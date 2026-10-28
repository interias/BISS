"""POST /labels/extract with the fake extractor (SPEC 5, SPEC 7); no model is called."""

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_label_extractor
from app.labels.agent import AgentLabelExtractor
from app.labels.extractor import FAKE_DRAFT, ExtractionFailed, FakeLabelExtractor
from app.main import app
from app.models import Food, FoodSourceData, OffCache
from tests.test_label_extract import BAD

URL = "/api/v1/labels/extract"


@pytest.fixture(autouse=True)
def settings(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """The fake chosen by setting, as the e2e stack does; images go to an empty directory."""
    monkeypatch.setenv("LABEL_EXTRACTOR", "fake")
    monkeypatch.setenv("LLM_MODEL_FAST", "fast-model")
    monkeypatch.setenv("LLM_MODEL_STRONG", "strong-model")
    directory = tmp_path / "images"
    directory.mkdir()
    monkeypatch.setenv("IMAGES_DIR", str(directory))
    return directory


def label_photo(fmt: str = "JPEG") -> bytes:
    out = BytesIO()
    Image.new("RGB", (1200, 900), "white").save(out, format=fmt)
    return out.getvalue()


def extract(client: TestClient, data: bytes | None = None, **form: str):
    files = {"file": ("label", label_photo() if data is None else data, "image/jpeg")}
    return client.post(URL, files=files, data=form)


def counts(session: Session) -> tuple[int, int, int]:
    return tuple(
        session.scalar(select(func.count()).select_from(table))
        for table in (Food, FoodSourceData, OffCache)
    )


def test_draft_with_gtin_from_the_request_validation_and_model(client: TestClient) -> None:
    response = extract(client, gtin="2000000000015")
    assert response.status_code == 200
    body = response.json()
    assert body["draft"] == {"gtin": "02000000000015", **FAKE_DRAFT.model_dump()}
    assert body["validation"]["ok"] is True
    assert body["validation"]["violations"] == []
    assert body["validation"]["atwater"]["ok"] is True
    assert (body["model"], body["attempts"]) == ("fast-model", 1)


@pytest.mark.parametrize("form", [{}, {"gtin": ""}])
def test_without_gtin_the_draft_has_none(client: TestClient, form: dict) -> None:
    response = extract(client, **form)
    assert response.status_code == 200
    assert response.json()["draft"]["gtin"] is None


def test_png_and_webp_are_accepted(client: TestClient) -> None:
    assert extract(client, label_photo("PNG")).status_code == 200
    assert extract(client, label_photo("WEBP")).status_code == 200


@pytest.mark.parametrize("gtin", ["2000000000016", "12345", "abc"])
def test_invalid_gtin_is_422(client: TestClient, gtin: str) -> None:
    assert extract(client, gtin=gtin).status_code == 422


def test_no_image_is_422(client: TestClient) -> None:
    assert extract(client, b"not a photo").status_code == 422


def test_label_photo_is_not_stored(client: TestClient, session: Session, settings: Path) -> None:
    before = counts(session)
    assert extract(client, gtin="2000000000015").status_code == 200
    assert list(settings.iterdir()) == []
    assert counts(session) == before


def test_violation_that_stays_returns_violations_and_strong_model(client: TestClient) -> None:
    fake = FakeLabelExtractor({"fast-model": BAD, "strong-model": BAD})
    app.dependency_overrides[get_label_extractor] = lambda: fake
    body = extract(client).json()
    assert fake.calls == ["fast-model", "strong-model"]
    assert (body["model"], body["attempts"]) == ("strong-model", 2)
    assert body["validation"]["ok"] is False
    assert [v["rule"] for v in body["validation"]["violations"]] == ["sugar"]
    assert body["draft"]["per_100"]["sugar"] == 70


def test_label_extractor_setting_chooses_agent_or_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    assert isinstance(get_label_extractor(), FakeLabelExtractor)
    monkeypatch.setenv("LABEL_EXTRACTOR", "agent")
    assert isinstance(get_label_extractor(), AgentLabelExtractor)
    monkeypatch.setenv("LABEL_EXTRACTOR", "fkae")
    with pytest.raises(ValueError, match="fkae"):
        get_label_extractor()


def test_failed_extraction_is_502(client: TestClient) -> None:
    class Failing:
        async def extract(self, photo: bytes, model: str):
            raise ExtractionFailed("no structured output")

    app.dependency_overrides[get_label_extractor] = Failing
    response = extract(client)
    assert response.status_code == 502
    assert response.json()["detail"] == "no structured output"
