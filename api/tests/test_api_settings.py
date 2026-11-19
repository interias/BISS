import pytest
from fastapi.testclient import TestClient


def test_tolerance_defaults_to_ten_percent(client: TestClient) -> None:
    assert client.get("/api/v1/settings").json() == {"tolerance": 0.1}


@pytest.mark.parametrize("tolerance", [0.05, 0.15, 0.2])
def test_tolerance_is_stored(client: TestClient, tolerance: float) -> None:
    response = client.put("/api/v1/settings", json={"tolerance": tolerance})
    assert response.status_code == 200
    assert response.json() == {"tolerance": tolerance}
    assert client.get("/api/v1/settings").json() == {"tolerance": tolerance}


@pytest.mark.parametrize("body", [{"tolerance": 0.04}, {"tolerance": 0.21}, {"tolerance": 1}, {}])
def test_tolerance_outside_the_bounds_is_rejected(client: TestClient, body: dict) -> None:
    assert client.put("/api/v1/settings", json=body).status_code == 422
    assert client.get("/api/v1/settings").json() == {"tolerance": 0.1}
