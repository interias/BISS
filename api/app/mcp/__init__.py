"""MCP server (ADR-0007): Streamable HTTP at /mcp in the api process.

The tools call the same services as the REST API and answer with its response models;
the server has no logic of its own. Only log_meal and log_combo write.
"""

from collections.abc import AsyncIterator, Callable
from contextlib import AbstractContextManager, asynccontextmanager
from datetime import UTC, date, datetime
from typing import Annotated

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy.orm import Session
from starlette.types import Receive, Scope, Send

from app import VERSION
from app.api import convert, schemas
from app.barcode import chain
from app.barcode.gtin import InvalidGtin
from app.db import get_session
from app.domain.day import day_of
from app.domain.meal import Meal
from app.search.search import search_foods
from app.services import combos, entries, foods
from app.services.days import day_summary

PATH = "/mcp"

Sessions = Callable[[], AbstractContextManager[Session]]
READ_ONLY = ToolAnnotations(read_only_hint=True)


def build_server(sessions: Sessions = get_session) -> MCPServer:
    """The server with its seven tools; tests pass their rolled-back session."""
    server = MCPServer(name="biss", title="BISS", version=VERSION)

    @server.tool(annotations=READ_ONLY)
    def search_food(
        query: Annotated[str, Field(min_length=1, max_length=200)],
        limit: Annotated[int, Field(ge=1, le=50)] = 20,
    ) -> list[schemas.SearchHit]:
        """Search own foods, BLS and cached products; best match first, duplicates merged.

        Values per 100 g (or 100 ml with basis ml), with the standard serving. A cached
        product of Open Food Facts has id null; log_meal takes its gtin.
        """
        with sessions() as session:
            return [convert.search_hit(hit) for hit in search_foods(session, query, limit=limit)]

    @server.tool(annotations=READ_ONLY)
    def get_food(food_id: int) -> schemas.FoodDetail:
        """A food with its values per 100 g (or 100 ml), its servings and its source."""
        with sessions() as session:
            try:
                return convert.food_detail(session, foods.get_food(session, food_id))
            except foods.NotFound as error:
                raise ToolError(str(error)) from error

    @server.tool(annotations=READ_ONLY)
    def list_entries(first: date, last: date) -> list[schemas.Entry]:
        """Entries of the days first to last, both included, by time.

        A day runs from 04:00 to 04:00 in Europe/Berlin.
        """
        with sessions() as session:
            return [
                convert.entry(e, food) for e, food in entries.entries_between(session, first, last)
            ]

    @server.tool(annotations=READ_ONLY)
    def daily_summary(day: date | None = None) -> schemas.Day:
        """Day summary: totals against the goals, entries by meal. Without day: today."""
        now = datetime.now(UTC)
        with sessions() as session:
            return convert.day(day_summary(session, day or day_of(now), now=now))

    @server.tool(annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False))
    def log_meal(
        food_id: int | None = None,
        gtin: str | None = None,
        grams: Annotated[float | None, Field(gt=0)] = None,
        meal: Meal | None = None,
    ) -> schemas.Entry:
        """Log a food now: exactly one of food_id and gtin, as POST /entries.

        With the gtin of a cached product (search_food, id null) it is stored as food with
        source off on its first entry. Without grams the standard serving applies, without
        meal the meal suggested by the time of day.
        """
        if (food_id is None) == (gtin is None):
            raise ToolError("give exactly one of food_id and gtin")
        now = datetime.now(UTC)
        with sessions() as session:
            try:
                if gtin is not None:
                    food_id = chain.food_for_entry(session, gtin, now).id
                entry = entries.create_entry(session, food_id, grams=grams, meal=meal, eaten_at=now)
            except (InvalidGtin, chain.NotFound, entries.NotFound) as error:
                raise ToolError(str(error)) from error
            return convert.entry(entry, foods.get_food(session, entry.food_id))

    @server.tool(annotations=READ_ONLY)
    def list_combos() -> list[schemas.Combo]:
        """Schnellzugriff: saved combinations of foods with grams, e.g. coffee with sugar.

        Each item with the macros an entry would take now, and the sum; log_combo logs one.
        """
        with sessions() as session:
            return [convert.combo(view) for view in combos.list_combos(session)]

    @server.tool(annotations=ToolAnnotations(read_only_hint=False, destructive_hint=False))
    def log_combo(
        combo_id: int | None = None,
        name: str | None = None,
        meal: Meal | None = None,
    ) -> schemas.EntryGroup:
        """Log a combo now: exactly one of combo_id and name, as POST /combos/{id}/log.

        The name matches case-insensitively after the search normalisation ("kaffee" finds
        "Kaffee"). One entry per item with a shared group named like the combo; without meal
        the meal suggested by the time of day.
        """
        if (combo_id is None) == (name is None):
            raise ToolError("give exactly one of combo_id and name")
        now = datetime.now(UTC)
        with sessions() as session:
            try:
                if name is not None:
                    combo_id = combos.find_by_name(session, name).id
                group = combos.log_combo(session, combo_id, meal=meal, eaten_at=now)
            except (combos.NotFound, combos.InvalidCombo) as error:
                raise ToolError(str(error)) from error
            return convert.entry_group(group)

    return server


class StreamableHttp:
    """ASGI app of the route /mcp.

    A session manager runs only once, so every start of the api (each TestClient
    as well) builds a new one in lifespan.
    """

    def __init__(self, server: MCPServer) -> None:
        self.server = server
        self._app = None

    @asynccontextmanager
    async def lifespan(self) -> AsyncIterator[None]:
        # Stateless: the tools keep nothing between requests. No DNS rebinding check
        # on the Host header: like the REST API it serves the local network (ADR-0005).
        self._app = self.server.streamable_http_app(
            streamable_http_path=PATH,
            stateless_http=True,
            transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        )
        async with self._app.router.lifespan_context(self._app):
            yield

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self._app(scope, receive, send)
