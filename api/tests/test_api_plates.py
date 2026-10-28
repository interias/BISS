"""POST /plates/extract with the fake extractor (SPEC 5, SPEC 7a); no model is called."""

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_plate_extractor
from app.main import app
from app.models import Entry
from app.plates.agent import AgentPlateExtractor
from app.plates.draft import PlateDraft, PlateIngredient
from app.plates.extractor import FAKE_PLATE, ExtractionFailed, FakePlateExtractor
from tests.factories import add_food

URL = "/api/v1/plates/extract"


@pytest.fixture(autouse=True)
def settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """The fake chosen by setting, as the e2e stack does; images go to an empty directory."""
    monkeypatch.setenv("PLATE_EXTRACTOR", "fake")
    monkeypatch.setenv("LLM_MODEL_FAST", "fast-model")
    monkeypatch.setenv("LLM_MODEL_STRONG", "strong-model")
    directory = tmp_path / "images"
    directory.mkdir()
    monkeypatch.setenv("IMAGES_DIR", str(directory))
    return directory


def plate_photo(fmt: str = "JPEG") -> bytes:
    out = BytesIO()
    Image.new("RGB", (1600, 1200), "white").save(out, format=fmt)
    return out.getvalue()


def extract(client: TestClient, data: bytes | None = None):
    return client.post(URL, files={"file": ("plate.jpg", data or plate_photo(), "image/jpeg")})


def add_fake_foods(session: Session) -> dict[str, int]:
    """The BLS foods of FAKE_PLATE with their BLS values (data/bls)."""
    foods = {
        "Hähnchen Brustfilet, gegrillt": add_food(
            session,
            "Hähnchen Brustfilet, gegrillt",
            kcal=140,
            protein=29.4,
            carbs=0,
            fat=2.4,
            source="bls",
        ),
        "Reis gekocht": add_food(
            session, "Reis gekocht", kcal=112, protein=2.4, carbs=24.6, fat=0.2, source="bls"
        ),
    }
    return {name: food.id for name, food in foods.items()}


def test_plate_with_matched_and_unmatched_items_and_totals(
    client: TestClient, session: Session
) -> None:
    ids = add_fake_foods(session)  # no Broccoli: that ingredient stays unmatched
    response = extract(client)
    assert response.status_code == 200
    body = response.json()
    assert (body["dish"], body["notes"]) == (FAKE_PLATE.dish, "")
    assert (body["model"], body["attempts"]) == ("fast-model", 1)
    chicken, rice, broccoli = body["items"]
    assert chicken == {
        "food_id": ids["Hähnchen Brustfilet, gegrillt"],
        "name": "Hähnchen Brustfilet, gegrillt",
        "grams": 120,
        "confidence": 0.9,
        "certainty": "recognized",
        "food": {
            "id": ids["Hähnchen Brustfilet, gegrillt"],
            "name": "Hähnchen Brustfilet, gegrillt",
            "brand": None,
            "source": "bls",
        },
        "basis": "g",
        "density": 1.0,
        "per_100": {"kcal": 140, "protein": 29.4, "carbs": 0, "fat": 2.4},
        "macros": {"kcal": 168.0, "protein": 35.3, "carbs": 0.0, "fat": 2.9},
    }
    assert (rice["food_id"], rice["macros"]["kcal"]) == (ids["Reis gekocht"], 168.0)
    assert broccoli == {
        "food_id": None,
        "name": "Broccoli gekocht",
        "grams": 80,
        "confidence": 0.6,
        "certainty": "guessed",
        "food": None,
        "basis": None,
        "density": None,
        "per_100": None,
        "macros": None,
    }
    assert body["totals"] == {"kcal": 336.0, "protein": 38.9, "carbs": 36.9, "fat": 3.2}


def test_liquid_carries_basis_and_density_and_its_macros_go_through_the_density(
    client: TestClient, session: Session
) -> None:
    """per_100 of an ml food is per 100 ml; the app previews with basis and density (SPEC 7a)."""
    milk = PlateDraft(
        dish="Milch",
        ingredients=[PlateIngredient(name="Testmilch", grams=206, confidence=0.9)],
        notes="",
    )
    app.dependency_overrides[get_plate_extractor] = lambda: FakePlateExtractor({"fast-model": milk})
    food = add_food(
        session, "Testmilch", kcal=64, protein=3.3, carbs=4.8, fat=3.5, basis="ml", density=1.03
    )
    [item] = extract(client).json()["items"]
    assert (item["food_id"], item["basis"], item["density"]) == (food.id, "ml", 1.03)
    # 206 g / 1.03 g/ml = 200 ml, not 206 ml.
    assert item["macros"] == {"kcal": 128.0, "protein": 6.6, "carbs": 9.6, "fat": 7.0}


def test_extraction_logs_nothing_and_does_not_store_the_photo(
    client: TestClient, session: Session, settings: Path
) -> None:
    add_fake_foods(session)
    assert extract(client).status_code == 200
    assert session.scalar(select(func.count()).select_from(Entry)) == 0
    assert list(settings.iterdir()) == []


def test_png_and_webp_are_accepted(client: TestClient) -> None:
    for fmt in ("PNG", "WEBP"):
        assert extract(client, plate_photo(fmt)).status_code == 200


def test_no_image_is_422(client: TestClient) -> None:
    assert extract(client, b"no image at all").status_code == 422


def test_violation_asks_the_strong_model_once(client: TestClient) -> None:
    empty = PlateDraft(dish="Teller", ingredients=[], notes="")
    strong = PlateDraft(
        dish="Apfel",
        ingredients=[PlateIngredient(name="Apfel roh", grams=150, confidence=0.95)],
        notes="",
    )
    fake = FakePlateExtractor({"fast-model": empty, "strong-model": strong})
    app.dependency_overrides[get_plate_extractor] = lambda: fake
    body = extract(client).json()
    assert fake.calls == ["fast-model", "strong-model"]
    assert (body["model"], body["attempts"], body["dish"]) == ("strong-model", 2, "Apfel")
    [item] = body["items"]
    assert (item["name"], item["food_id"]) == ("Apfel roh", None)


def test_plate_extractor_setting_chooses_agent_or_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    assert isinstance(get_plate_extractor(), FakePlateExtractor)
    monkeypatch.setenv("PLATE_EXTRACTOR", "agent")
    assert isinstance(get_plate_extractor(), AgentPlateExtractor)
    monkeypatch.setenv("PLATE_EXTRACTOR", "other")
    with pytest.raises(ValueError, match="PLATE_EXTRACTOR"):
        get_plate_extractor()


def test_failed_extraction_is_502(client: TestClient) -> None:
    class Failing:
        async def extract(self, photo: bytes, model: str):
            raise ExtractionFailed("no structured output")

    app.dependency_overrides[get_plate_extractor] = Failing
    response = extract(client)
    assert response.status_code == 502
    assert "no structured output" in response.json()["detail"]
