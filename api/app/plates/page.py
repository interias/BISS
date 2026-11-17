"""A recipe link (ADR-0014): the page is loaded and turned into text for the model.

Only http and https to public addresses, checked again after every redirect, so a link
reaches neither the database nor another service of the own network. A schema.org Recipe
in JSON-LD, as recipe sites carry it, goes alone; without one the visible text of the page.
"""

import asyncio
import html
import ipaddress
import json
import re
import socket
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

from app.plates.draft import MAX_RECIPE_SOURCE

TIMEOUT_SECONDS = 10.0
MAX_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 5
# Some recipe sites answer a client without a browser name with 403.
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; BISS recipe import)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "de,en;q=0.8",
}


class UnsafeLink(ValueError):
    """No http(s) link, or one to an address of the own network."""


class PageUnreadable(RuntimeError):
    """The page did not load or holds no text."""


def is_link(source: str) -> bool:
    """The source is exactly one http(s) address, nothing else."""
    text = source.strip()
    return bool(re.fullmatch(r"https?://\S+", text, re.IGNORECASE))


def _resolve(host: str) -> list[str]:
    try:
        return [info[4][0] for info in socket.getaddrinfo(host, None)]
    except socket.gaierror as error:
        raise PageUnreadable(f"unknown host {host}") from error


def check_link(url: str) -> None:
    """Raises UnsafeLink unless the url is http(s) to public addresses only."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise UnsafeLink("only http and https links")
    for address in _resolve(parts.hostname):
        if not ipaddress.ip_address(address.split("%", 1)[0]).is_global:
            raise UnsafeLink(f"{parts.hostname} is no public address")


async def load(url: str, client: httpx.AsyncClient | None = None) -> str:
    """The text of the recipe behind the link, at most MAX_RECIPE_SOURCE characters."""
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT_SECONDS, headers=HEADERS)
    try:
        page = await _fetch(client, url.strip())
    except httpx.HTTPError as error:
        raise PageUnreadable(f"page did not load: {error}") from error
    finally:
        if own:
            await client.aclose()
    text = recipe_text(page)
    if not text:
        raise PageUnreadable("the page holds no text")
    return text[:MAX_RECIPE_SOURCE]


async def _fetch(client: httpx.AsyncClient, url: str) -> str:
    for _ in range(MAX_REDIRECTS + 1):
        await asyncio.to_thread(check_link, url)
        async with client.stream("GET", url, follow_redirects=False) as response:
            if response.is_redirect and "location" in response.headers:
                url = urljoin(url, response.headers["location"])
                continue
            if response.status_code != 200:
                raise PageUnreadable(f"page answered {response.status_code}")
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body += chunk
                if len(body) > MAX_BYTES:
                    raise PageUnreadable(f"page is larger than {MAX_BYTES // 1024 // 1024} MB")
            return body.decode(response.encoding or "utf-8", errors="replace")
    raise PageUnreadable("too many redirects")


def recipe_text(page: str) -> str:
    """The schema.org Recipe of the page as text, else its visible text."""
    for block in re.findall(
        r"<script[^>]*application/ld\+json[^>]*>(.*?)</script>", page, re.IGNORECASE | re.DOTALL
    ):
        try:
            data = json.loads(html.unescape(block.strip()))
        except ValueError:
            continue
        recipe = _find_recipe(data)
        if recipe is not None:
            return _recipe_lines(recipe)
    return _visible_text(page)


def _find_recipe(data: Any) -> dict | None:
    if isinstance(data, list):
        return next((r for item in data if (r := _find_recipe(item)) is not None), None)
    if not isinstance(data, dict):
        return None
    kind = data.get("@type")
    if kind == "Recipe" or (isinstance(kind, list) and "Recipe" in kind):
        return data
    return _find_recipe(data.get("@graph"))


def _recipe_lines(recipe: dict) -> str:
    lines = [str(recipe.get("name", "")).strip()]
    servings = recipe.get("recipeYield")
    if servings:
        joined = ", ".join(map(str, servings)) if isinstance(servings, list) else servings
        lines.append(f"Portionen: {joined}")
    lines.append("Zutaten:")
    lines += [f"- {item}" for item in recipe.get("recipeIngredient") or []]
    steps = _steps(recipe.get("recipeInstructions"))
    if steps:
        lines.append("Zubereitung:")
        lines += steps
    return "\n".join(html.unescape(line) for line in lines if line)


def _steps(instructions: Any) -> list[str]:
    if isinstance(instructions, str):
        return [_strip_tags(instructions)]
    if isinstance(instructions, list):
        return [step for item in instructions for step in _steps(item)]
    if isinstance(instructions, dict):
        if "itemListElement" in instructions:
            return _steps(instructions["itemListElement"])
        return _steps(instructions.get("text", ""))
    return []


def _strip_tags(text: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", text).split())


def _visible_text(page: str) -> str:
    page = re.sub(
        r"<(script|style|noscript|svg|head)\b.*?</\1>", " ", page, flags=re.IGNORECASE | re.DOTALL
    )
    page = re.sub(r"<(br|/p|/li|/h\d|/div|/tr)[^>]*>", "\n", page, flags=re.IGNORECASE)
    text = html.unescape(re.sub(r"<[^>]+>", " ", page))
    lines = (" ".join(line.split()) for line in text.splitlines())
    return "\n".join(line for line in lines if line)
