"""One real recipe import (ADR-0014) with the configured models, printed with the matches.

    docker compose run --rm api uv run python scripts/spike_recipe_import.py "<text or link>"
"""

import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app  # noqa: E402


def main(source: str) -> None:
    with TestClient(app) as client:
        started = time.perf_counter()
        response = client.post("/api/v1/recipes/import", json={"source": source})
        seconds = time.perf_counter() - started
    if response.status_code != 200:
        print(response.status_code, response.json())
        return
    body = response.json()
    print(f"{body['name']} · {body['portions']} Portionen · {body['model']} · {seconds:.1f} s")
    for item in body["items"]:
        food = item["food"]["name"] if item["food"] else "— nicht zugeordnet —"
        print(f"  {item['grams']:>6g} g  {item['name']:<40} → {food}")
    print(body["description"])
    if body["notes"]:
        print("Hinweis:", body["notes"])


if __name__ == "__main__":
    main(sys.argv[1])
