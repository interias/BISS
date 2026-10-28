"""Fixture labels against the real model (SPEC 8): only with -m llm and a token.

    docker compose run --rm api uv run pytest -m llm

Each label costs one call with the fast model, two at a rule violation.
"""

import asyncio
import os
from pathlib import Path

import pytest
import yaml

from app.config import get_settings
from app.labels.agent import AgentLabelExtractor
from app.labels.extract import extract_label
from app.labels.photo import prepare

LABELS = Path(__file__).resolve().parent / "fixtures" / "labels"
EXPECTED = yaml.safe_load((LABELS / "expected.yaml").read_text(encoding="utf-8"))

pytestmark = [
    pytest.mark.llm,
    pytest.mark.skipif(
        not (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")),
        reason="needs CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY",
    ),
]


@pytest.mark.parametrize("name", list(EXPECTED))
def test_fixture_label_gives_the_expected_values(name: str) -> None:
    expected = EXPECTED[name]
    settings = get_settings()
    result = asyncio.run(
        extract_label(
            AgentLabelExtractor(),
            prepare((LABELS / name).read_bytes()),
            settings.llm_model_fast,
            settings.llm_model_strong,
        )
    )
    assert result.check.ok, result.check.violations
    draft = result.draft
    assert expected["name"].casefold() in draft.name.casefold()
    assert draft.brand == expected["brand"]
    assert (draft.per_100.basis, draft.per_100.state) == (expected["basis"], expected["state"])
    # The printed numbers are copied, so only float noise is tolerated.
    for field, value in expected["per_100"].items():
        assert getattr(draft.per_100, field) == pytest.approx(value, abs=0.01), field
