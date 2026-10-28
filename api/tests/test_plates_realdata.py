"""Real plate photos against the real model (SPEC 8, ADR-0009): only with -m llm and a token.

    docker compose -f compose.yaml -f compose.test.yaml run --rm api \
        uv run pytest -m "llm and realdata" tests/test_plates_realdata.py -s

Every set (repo, local) is scored on its own (tests/plate_scoring.py): the recall of the
main ingredients over all plates, the share of plates with weighed kcal whose totals lie
within the tolerance, and the p95 of the time per photo. Each photo goes through
extract_plate and match_plate as at POST /plates/extract, against the full BLS seed: one
call with the fast model, a second with the strong one at a rule violation. The items and
the table per photo, the figures per set and the number of model calls are printed, also
when the test passes.
"""

import asyncio
import os
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from app.config import get_settings
from app.importers.bls import import_bls
from app.labels.photo import prepare
from app.plates.agent import AgentPlateExtractor
from app.plates.draft import PlateDraft
from app.plates.extract import extract_plate
from app.plates.extractor import FAKE_PLATE, ExtractionFailed, PlateExtractor
from app.plates.match import match_plate
from tests.label_scoring import photo_set
from tests.plate_scoring import (
    KCAL_PCT,
    KCAL_SHARE,
    P95_SECONDS,
    RECALL,
    expected_plate,
    p95,
    score_plate,
    table,
)

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


@pytest.fixture(scope="module")
def bls(engine: Engine) -> Iterator[Session]:
    """The test database with the full BLS seed (data/bls), rolled back after this module.

    The kcal of a plate come from the matched foods, so the matching needs the real seed;
    the other tests keep their small fixtures.
    """
    with engine.connect() as connection:
        transaction = connection.begin()
        session = Session(bind=connection, join_transaction_mode="create_savepoint")
        import_bls(session)
        yield session
        session.close()
        transaction.rollback()


@dataclass
class CountingExtractor:
    """Counts the models asked, also for a call that fails."""

    inner: PlateExtractor
    calls: list[str] = field(default_factory=list)

    async def extract(self, photo: bytes, model: str) -> PlateDraft:
        self.calls.append(model)
        return await self.inner.extract(photo, model)


def test_fake_plate_is_matched_completely_on_the_full_bls(bls: Session) -> None:
    """The e2e stack seeds the full BLS; there every ingredient of FAKE_PLATE has a food."""
    found = match_plate(bls, FAKE_PLATE)
    assert [item.food.name if item.food else None for item in found.items] == [
        ingredient.name for ingredient in FAKE_PLATE.ingredients
    ]


@pytest.mark.parametrize("name", list(SETS))
def test_real_plates_meet_the_thresholds(
    name: str, bls: Session, capsys: pytest.CaptureFixture[str]
) -> None:
    plates = photo_set(SETS[name], "plates")
    if plates.empty:
        pytest.skip(f"no plate set at {plates.dir or '$BISS_REAL_FIXTURES/plates (unset)'}")
    assert plates.problems == []
    # Every ground truth is checked before the first call, so a typo costs no budget.
    expected = {p.file: expected_plate(p.truth, p.file) for p in plates.photos}
    settings = get_settings()

    def show(*lines: str) -> None:
        # Printed photo by photo, so a run cut short keeps what it has measured.
        with capsys.disabled():
            print("\n" + "\n".join(lines))

    async def run() -> tuple[list, list[float], int]:
        scores, seconds, calls = [], [], 0
        for photo in plates.photos:
            extractor = CountingExtractor(AgentPlateExtractor())
            start = time.perf_counter()
            items: list[str] = []
            try:
                result = await extract_plate(
                    extractor,
                    prepare(photo.path.read_bytes()),
                    settings.llm_model_fast,
                    settings.llm_model_strong,
                )
                found = match_plate(bls, result.draft)
                texts = [item.name for item in found.items] + [
                    item.food.name for item in found.items if item.food is not None
                ]
                kcal: float | None = found.totals.kcal
                note = f"model {result.model}, dish {result.draft.dish!r}"
                items = [
                    f"    {item.name} {item.grams:g} g ({item.certainty}) -> "
                    + (f"{item.food.name}, {item.macros.kcal:g} kcal" if item.food else "-")
                    for item in found.items
                ]
            except ExtractionFailed as error:
                texts, kcal, note = [], None, f"failed: {error}"
            seconds.append(time.perf_counter() - start)
            score = score_plate(expected[photo.file], texts, kcal)
            scores.append(score)
            calls += len(extractor.calls)
            hits = sum(ok for _, ok in score.found)
            show(
                f"[{name}] {photo.file}: {hits}/{len(score.found)} main found, "
                f"{seconds[-1]:.1f} s, {len(extractor.calls)} call(s) "
                f"({', '.join(extractor.calls)}), {note}",
                *items,
                table(score),
            )
        return scores, seconds, calls

    scores, seconds, calls = asyncio.run(run())
    found = sum(ok for s in scores for _, ok in s.found)
    total = sum(len(s.found) for s in scores)
    weighed = [s for s in scores if s.kcal_ok is not None]
    kcal_hits = sum(bool(s.kcal_ok) for s in weighed)
    slowest = p95(seconds)
    summary = (
        f"[{name}] recall {found}/{total} = {found * 100 / total:.1f} % (threshold "
        f"{RECALL:.0%}); kcal within ±{KCAL_PCT:g} %: {kcal_hits}/{len(weighed)} plates"
        + (f" = {kcal_hits * 100 / len(weighed):.1f} %" if weighed else "")
        + f" (threshold {KCAL_SHARE:.0%}); p95 {slowest:.1f} s (threshold < {P95_SECONDS:g} s); "
        f"{len(plates.photos)} photos, {calls} model calls"
    )
    show(summary)
    assert found >= RECALL * total, summary
    assert not weighed or kcal_hits >= KCAL_SHARE * len(weighed), summary
    assert slowest < P95_SECONDS, summary
