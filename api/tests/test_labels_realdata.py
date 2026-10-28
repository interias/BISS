"""Real label photos against the real model (SPEC 8, ADR-0008): only with -m llm and a token.

    docker compose -f compose.yaml -f compose.test.yaml run --rm api \
        uv run pytest -m "llm and realdata" tests/test_labels_realdata.py

Every set (repo, local) is scored on its own: at least 90 % of the fields it has a ground
truth for lie within the tolerance (tests/label_scoring.py). Each photo goes through
extract_label as at POST /labels/extract: one call with the fast model, a second with the
strong one at a rule violation. The table per photo, the rate per set and the number of
model calls are printed, also when the test passes.
"""

import asyncio
import os
from dataclasses import dataclass, field
from pathlib import Path

import pytest

from app.config import get_settings
from app.labels.agent import AgentLabelExtractor
from app.labels.draft import LabelDraft
from app.labels.extract import extract_label
from app.labels.extractor import ExtractionFailed, LabelExtractor
from app.labels.photo import prepare
from tests.label_scoring import THRESHOLD, expected_values, photo_set, rate, score, table

pytestmark = [
    pytest.mark.llm,
    pytest.mark.realdata,
    pytest.mark.skipif(
        not (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")),
        reason="needs CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY",
    ),
]

# The repo set lies next to the tests (/app/tests/fixtures/real in the container), the
# local one at BISS_REAL_FIXTURES (compose.test.yaml mounts it at /fixtures/local).
_local = os.environ.get("BISS_REAL_FIXTURES")
SETS = {
    "repo": Path(__file__).resolve().parent / "fixtures" / "real",
    "local": Path(_local) if _local else None,
}


@dataclass
class CountingExtractor:
    """Counts the models asked, also for a call that fails."""

    inner: LabelExtractor
    calls: list[str] = field(default_factory=list)

    async def extract(self, photo: bytes, model: str) -> LabelDraft:
        self.calls.append(model)
        return await self.inner.extract(photo, model)


@pytest.mark.parametrize("name", list(SETS))
def test_real_labels_within_tolerance(name: str, capsys: pytest.CaptureFixture[str]) -> None:
    labels = photo_set(SETS[name], "labels")
    if labels.empty:
        pytest.skip(f"no label set at {labels.dir or '$BISS_REAL_FIXTURES/labels (unset)'}")
    assert labels.problems == []
    # Every ground truth is checked before the first call, so a typo costs no budget.
    expected = {p.file: expected_values(p.truth, p.file) for p in labels.photos}
    settings = get_settings()

    def show(*lines: str) -> None:
        # Printed photo by photo, so a run cut short keeps what it has measured.
        with capsys.disabled():
            print("\n" + "\n".join(lines))

    async def run() -> tuple[int, int, int]:
        ok, scored, calls = 0, 0, 0
        for photo in labels.photos:
            extractor = CountingExtractor(AgentLabelExtractor())
            try:
                result = await extract_label(
                    extractor,
                    prepare(photo.path.read_bytes()),
                    settings.llm_model_fast,
                    settings.llm_model_strong,
                )
                per_100, note = result.draft.per_100, f"model {result.model}"
            except ExtractionFailed as error:
                per_100, note = None, f"failed: {error}"
            scores = score(expected[photo.file], per_100)
            hits, count = rate(scores)
            ok, scored, calls = ok + hits, scored + count, calls + len(extractor.calls)
            show(
                f"[{name}] {photo.file}: {hits}/{count} ok, {len(extractor.calls)} call(s) "
                f"({', '.join(extractor.calls)}), {note}",
                table(scores),
            )
        return ok, scored, calls

    ok, scored, calls = asyncio.run(run())
    summary = (
        f"[{name}] {ok}/{scored} fields within tolerance = {ok * 100 / scored:.1f} % "
        f"(threshold {THRESHOLD:.0%}), {len(labels.photos)} photos, {calls} model calls"
    )
    show(summary)
    assert ok >= THRESHOLD * scored, summary
