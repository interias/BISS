"""Fallback flow with the fake, and the Agent SDK glue with a fake query (no model)."""

import asyncio
import base64
import json
from io import BytesIO
from pathlib import Path

import pytest
from claude_agent_sdk import ClaudeSDKError, ResultMessage
from PIL import Image

from app.images import InvalidImage
from app.labels import photo
from app.labels.agent import PHOTO_NAME, PROMPT, AgentLabelExtractor
from app.labels.draft import json_schema
from app.labels.extract import extract_label
from app.labels.extractor import FAKE_DRAFT, ExtractionFailed, FakeLabelExtractor
from app.labels.validation import check

FAST, STRONG = "fast-model", "strong-model"
PHOTO = b"\xff\xd8 label photo"
# Sugar above carbs: one violation.
BAD = FAKE_DRAFT.model_copy(
    update={"per_100": FAKE_DRAFT.per_100.model_copy(update={"sugar": 70.0})}
)


def run(extractor: FakeLabelExtractor):
    return asyncio.run(extract_label(extractor, PHOTO, FAST, STRONG))


def test_fake_draft_passes_the_rules() -> None:
    assert check(FAKE_DRAFT.per_100).ok


def test_no_violation_one_call_with_the_fast_model() -> None:
    extractor = FakeLabelExtractor()
    result = run(extractor)
    assert extractor.calls == [FAST]
    assert (result.model, result.attempts, result.check.ok) == (FAST, 1, True)
    assert result.draft == FAKE_DRAFT


def test_violation_exactly_one_second_call_with_the_strong_model() -> None:
    extractor = FakeLabelExtractor({FAST: BAD})
    result = run(extractor)
    assert extractor.calls == [FAST, STRONG]
    assert (result.model, result.attempts, result.check.ok) == (STRONG, 2, True)
    assert result.draft == FAKE_DRAFT


def test_violation_stays_draft_with_violations_and_strong_model() -> None:
    extractor = FakeLabelExtractor({FAST: BAD, STRONG: BAD})
    result = run(extractor)
    assert extractor.calls == [FAST, STRONG]
    assert (result.model, result.attempts) == (STRONG, 2)
    assert [v.rule for v in result.check.violations] == ["sugar"]
    assert result.draft == BAD


def test_schema_has_no_gtin_and_forbids_extra_fields() -> None:
    schema = json_schema()
    assert "gtin" not in json.dumps(schema)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])


def test_prompt_names_the_three_typical_mistakes() -> None:
    for words in ("je Portion", "unzubereitet", "je 100 ml", "barcode"):
        assert words in PROMPT


def answer(**fields) -> ResultMessage:
    base = {
        "subtype": "success",
        "duration_ms": 1,
        "duration_api_ms": 1,
        "is_error": False,
        "num_turns": 1,
        "session_id": "s",
        "structured_output": FAKE_DRAFT.model_dump(),
    }
    return ResultMessage(**(base | fields))


def fake_query(seen: dict, result: ResultMessage | None = None, error: Exception | None = None):
    async def query(*, prompt, options):
        seen["options"] = options
        seen["files"] = {p.name: p.read_bytes() for p in Path(options.cwd).iterdir()}
        seen["prompt"] = prompt if isinstance(prompt, str) else [m async for m in prompt]
        if error is not None:
            raise error
        if result is not None:
            yield result

    return query


def test_base64_sends_the_photo_as_image_block_without_tools() -> None:
    seen: dict = {}
    extractor = AgentLabelExtractor("base64", fake_query(seen, answer()))
    draft = asyncio.run(extractor.extract(PHOTO, FAST))
    assert draft == FAKE_DRAFT
    options = seen["options"]
    assert (options.model, options.tools, options.allowed_tools) == (FAST, [], [])
    assert (options.permission_mode, options.setting_sources) == ("dontAsk", [])
    assert options.output_format == {"type": "json_schema", "schema": json_schema()}
    assert seen["files"] == {}
    [message] = seen["prompt"]
    image, text = message["message"]["content"]
    assert base64.b64decode(image["source"]["data"]) == PHOTO
    assert image["source"]["media_type"] == "image/jpeg"
    assert text["type"] == "text"


def test_read_puts_the_photo_in_the_working_directory_with_only_read() -> None:
    seen: dict = {}
    asyncio.run(AgentLabelExtractor("read", fake_query(seen, answer())).extract(PHOTO, STRONG))
    options = seen["options"]
    assert (options.tools, options.allowed_tools, options.model) == (["Read"], ["Read"], STRONG)
    assert seen["files"] == {PHOTO_NAME: PHOTO}
    assert PHOTO_NAME in seen["prompt"]


@pytest.mark.parametrize("transfer", ["base64", "read"])
def test_temporary_directory_with_photo_and_config_is_removed(transfer: str) -> None:
    seen: dict = {}
    asyncio.run(AgentLabelExtractor(transfer, fake_query(seen, answer())).extract(PHOTO, FAST))
    options = seen["options"]
    config = Path(options.env["CLAUDE_CONFIG_DIR"])
    assert config.parent == Path(options.cwd).parent
    assert not config.parent.exists()


def test_temporary_directory_is_removed_when_the_agent_fails() -> None:
    seen: dict = {}
    extractor = AgentLabelExtractor("read", fake_query(seen, error=ClaudeSDKError("CLI gone")))
    with pytest.raises(ExtractionFailed):
        asyncio.run(extractor.extract(PHOTO, FAST))
    assert seen["files"] == {PHOTO_NAME: PHOTO}
    assert not Path(seen["options"].cwd).parent.exists()


@pytest.mark.parametrize(
    ("result", "error"),
    [
        (None, None),
        (answer(is_error=True, subtype="error_max_turns", structured_output=None), None),
        (answer(structured_output=None), None),
        (answer(structured_output={"name": "only a name"}), None),
        (None, ClaudeSDKError("CLI gone")),
    ],
)
def test_no_usable_answer_fails_the_extraction(result, error) -> None:
    extractor = AgentLabelExtractor("base64", fake_query({}, result, error))
    with pytest.raises(ExtractionFailed):
        asyncio.run(extractor.extract(PHOTO, FAST))


def image(size: tuple[int, int], fmt: str = "PNG") -> bytes:
    out = BytesIO()
    Image.new("RGB", size, "white").save(out, format=fmt)
    return out.getvalue()


def test_photo_becomes_jpeg_with_longer_edge_1568() -> None:
    with Image.open(BytesIO(photo.prepare(image((4000, 3000))))) as prepared:
        assert (prepared.format, prepared.size) == ("JPEG", (1568, 1176))
    with Image.open(BytesIO(photo.prepare(image((800, 600), "WEBP")))) as small:
        assert small.size == (800, 600)


def test_photo_that_is_no_image_is_invalid() -> None:
    with pytest.raises(InvalidImage):
        photo.prepare(b"no image")
