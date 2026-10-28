import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.api import health
from app.main import app

client = TestClient(app)


def test_health_checks_the_database() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_fails_without_database(monkeypatch: pytest.MonkeyPatch) -> None:
    unreachable = create_engine("postgresql+psycopg://biss:biss@127.0.0.1:1/biss")
    monkeypatch.setattr(health, "get_engine", lambda: unreachable)
    assert client.get("/api/v1/health").status_code == 503


def test_openapi_docs_are_served() -> None:
    assert client.get("/docs").status_code == 200
    assert "/api/v1/health" in client.get("/openapi.json").json()["paths"]
