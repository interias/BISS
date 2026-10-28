"""Plate rules and fallback with the fake, and the Agent SDK glue with a fake query (no model)."""

import asyncio
import base64
import json
from pathlib import Path

import pytest
from claude_agent_sdk import ClaudeSDKError, ResultMessage

from app.plates.agent import PROMPT, AgentPlateExtractor
from app.plates.draft import PlateDraft, PlateIngredient, json_schema
from app.plates.extract import extract_plate, violations
from app.plates.extractor import FAKE_PLATE, ExtractionFailed, FakePlateExtractor

FAST, STRONG = "fast-model", "strong-model"
PHOTO = b"\xff\xd8 plate photo"
EMPTY = PlateDraft(dish="Teller", ingredients=[], notes="kein Essen erkennbar")


def plate(*ingredients: tuple[str, float, float]) -> PlateDraft:
    items = [PlateIngredient(name=n, grams=g, confidence=c) for n, g, c in ingredients]
    return PlateDraft(dish="Gericht", ingredients=items, notes="")


def run(extractor: FakePlateExtractor):
    return asyncio.run(extract_plate(extractor, PHOTO, FAST, STRONG))


def test_fake_plate_passes_the_rules() -> None:
    assert violations(FAKE_PLATE) == []


@pytest.mark.parametrize(
    ("draft", "rule"),
    [
        (EMPTY, "no ingredient"),
        (plate(("", 50, 0.9)), "ingredient without name"),
        (plate(("Reis gekocht", 0, 0.9)), "Reis gekocht: 0 g"),
        (plate(("Reis gekocht", -5, 0.9)), "Reis gekocht: -5 g"),
        (plate(("Reis gekocht", 1600, 0.9)), "Reis gekocht: 1600 g"),
        (plate(("Reis gekocht", 100, 1.2)), "confidence 1.2"),
        (plate(*[(f"Zutat {i}", 1000, 0.9) for i in range(4)]), "plate of 4000 g"),
    ],
)
def test_rules_catch_an_implausible_plate(draft: PlateDraft, rule: str) -> None:
    assert any(rule in v for v in violations(draft))


def test_amounts_at_the_limits_are_plausible() -> None:
    assert violations(plate(("Reis gekocht", 1500, 0), ("Gurke roh", 0.5, 1))) == []


def test_no_violation_one_call_with_the_fast_model() -> None:
    extractor = FakePlateExtractor()
    result = run(extractor)
    assert extractor.calls == [FAST]
    assert (result.draft, result.model, result.attempts, result.violations) == (
        FAKE_PLATE,
        FAST,
        1,
        [],
    )


def test_violation_exactly_one_second_call_with_the_strong_model() -> None:
    extractor = FakePlateExtractor({FAST: EMPTY})
    result = run(extractor)
    assert extractor.calls == [FAST, STRONG]
    assert (result.draft, result.model, result.attempts) == (FAKE_PLATE, STRONG, 2)


def test_violation_stays_strong_draft_with_violations() -> None:
    extractor = FakePlateExtractor({FAST: EMPTY, STRONG: EMPTY})
    result = run(extractor)
    assert extractor.calls == [FAST, STRONG]
    assert (result.draft, result.model, result.attempts) == (EMPTY, STRONG, 2)
    assert result.violations == ["no ingredient"]


def test_strong_model_without_usable_draft_keeps_the_fast_draft() -> None:
    class FailingStrong(FakePlateExtractor):
        async def extract(self, photo: bytes, model: str):
            draft = await super().extract(photo, model)
            if model == STRONG:
                raise ExtractionFailed("no usable draft")
            return draft

    extractor = FailingStrong({FAST: EMPTY})
    result = run(extractor)
    assert extractor.calls == [FAST, STRONG]
    assert (result.draft, result.model, result.attempts) == (EMPTY, FAST, 2)


def test_fast_model_without_usable_draft_fails_the_extraction() -> None:
    class FailingFast(FakePlateExtractor):
        async def extract(self, photo: bytes, model: str):
            self.calls.append(model)
            raise ExtractionFailed("no usable draft")

    extractor = FailingFast()
    with pytest.raises(ExtractionFailed):
        run(extractor)
    assert extractor.calls == [FAST]


def test_schema_is_fixed_and_forbids_extra_fields() -> None:
    schema = json_schema()
    assert set(schema["properties"]) == {"dish", "ingredients", "notes"}
    assert set(schema["required"]) == set(schema["properties"])
    assert schema["additionalProperties"] is False
    ingredient = schema["$defs"]["PlateIngredient"]
    assert set(ingredient["properties"]) == {"name", "grams", "confidence"}
    assert set(ingredient["required"]) == set(ingredient["properties"])
    assert ingredient["additionalProperties"] is False


def test_prompt_asks_for_german_generic_names_and_amounts_as_eaten() -> None:
    for words in ("German", "Bundeslebensmittelschlüssel", "Reis gekocht", "as eaten"):
        assert words in PROMPT


def answer(**fields) -> ResultMessage:
    base = {
        "subtype": "success",
        "duration_ms": 1,
        "duration_api_ms": 1,
        "is_error": False,
        "num_turns": 1,
        "session_id": "s",
        "structured_output": FAKE_PLATE.model_dump(),
    }
    return ResultMessage(**(base | fields))


def fake_query(seen: dict, result: ResultMessage | None = None, error: Exception | None = None):
    async def query(*, prompt, options):
        seen["options"] = options
        seen["files"] = {p.name: p.read_bytes() for p in Path(options.cwd).iterdir()}
        seen["prompt"] = [m async for m in prompt]
        if error is not None:
            raise error
        if result is not None:
            yield result

    return query


def test_photo_goes_as_image_block_without_tools_in_a_removed_temp_dir() -> None:
    seen: dict = {}
    draft = asyncio.run(AgentPlateExtractor(fake_query(seen, answer())).extract(PHOTO, FAST))
    assert draft == FAKE_PLATE
    options = seen["options"]
    assert (options.model, options.tools, options.allowed_tools) == (FAST, [], [])
    assert (options.permission_mode, options.setting_sources) == ("dontAsk", [])
    assert options.output_format == {"type": "json_schema", "schema": json_schema()}
    assert seen["files"] == {}
    config = Path(options.env["CLAUDE_CONFIG_DIR"])
    assert config.parent == Path(options.cwd).parent
    assert not config.parent.exists()
    [message] = seen["prompt"]
    image, text = message["message"]["content"]
    assert base64.b64decode(image["source"]["data"]) == PHOTO
    assert image["source"]["media_type"] == "image/jpeg"
    assert text["type"] == "text"


@pytest.mark.parametrize(
    "result",
    [
        None,
        answer(is_error=True, subtype="error_max_turns", structured_output=None),
        answer(structured_output={"dish": "x"}),
        answer(structured_output=json.loads(FAKE_PLATE.model_dump_json()) | {"kcal": 500}),
    ],
)
def test_no_usable_structured_output_fails(result: ResultMessage | None) -> None:
    extractor = AgentPlateExtractor(fake_query({}, result))
    with pytest.raises(ExtractionFailed):
        asyncio.run(extractor.extract(PHOTO, FAST))


def test_sdk_error_fails() -> None:
    extractor = AgentPlateExtractor(fake_query({}, error=ClaudeSDKError("cli gone")))
    with pytest.raises(ExtractionFailed, match="cli gone"):
        asyncio.run(extractor.extract(PHOTO, FAST))
