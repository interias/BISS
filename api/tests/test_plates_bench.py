"""Benchmark of the plate recognition on the real photos: models and variants side by side.

    docker compose -f compose.yaml -f compose.test.yaml run --rm \\
        -e PLATE_BENCH_MODELS=claude-haiku-5-5,claude-sonnet-5-5 -e PLATE_BENCH_RUNS=3 \\
        api uv run pytest -m "llm and realdata" tests/test_plates_bench.py -s

It asserts nothing about quality (tests/test_plates_realdata.py holds the thresholds); it
measures. Every model reads every photo PLATE_BENCH_RUNS times, without the fallback to the
strong model, so a figure belongs to one model. Per model it prints, over all runs:

- seen: main ingredients the model named (the recall of plate_scoring), with the range
  over the runs, which shows how much is chance;
- logged: main ingredients whose matched food carries their name, so the entry is right;
  "search" is the same for the search alone, without the model choosing among candidates
  (from the same answers, so it costs no call);
- made up: ingredients that are neither asked for nor allowed, per plate with an also line;
- no food: ingredients the search found no food for;
- kcal: median deviation on the weighed plates;
- seconds per photo.

Below the table stand the main ingredients a model missed. PLATE_BENCH_OUT names a folder
for the figures as JSON (one file per run of the benchmark), PLATE_BENCH_LABEL a word for
what is being tried ("no thinking", "prompt v2"). Two switches try a variant without a
change of the code: PLATE_BENCH_PICK=0 leaves the food to the search alone (no second call),
PLATE_BENCH_THINKING=disabled turns the thinking of the model off.
"""

import asyncio
import json
import os
import statistics
import time
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy.orm import Session

from app.config import get_settings
from app.labels.photo import prepare
from app.models import Food
from app.plates.agent import AgentPlateExtractor
from app.plates.draft import PlateDraft
from app.plates.extract import pick_foods
from app.plates.extractor import ExtractionFailed
from app.plates.match import match_plate, plate_asks
from tests.label_scoring import photo_set
from tests.plate_scoring import Truth, detail, expected_plate, p95, score_plate
from tests.test_plates_realdata import SETS

pytestmark = [
    pytest.mark.llm,
    pytest.mark.realdata,
    pytest.mark.skipif(
        not (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")),
        reason="needs CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY",
    ),
]

# Photos read at the same time; each one starts its own agent process.
PARALLEL = 4


@dataclass(frozen=True)
class Reading:
    """One photo read once by one model."""

    file: str
    seconds: float
    seen: list[tuple[str, bool]]
    logged: list[tuple[str, bool]]
    logged_search: list[tuple[str, bool]]
    extras: list[str] | None
    unmatched: list[str]
    items: int
    kcal_deviation: float | None
    failed: str | None


def _models() -> list[str]:
    wanted = os.environ.get("PLATE_BENCH_MODELS") or get_settings().llm_model_fast
    return [model.strip() for model in wanted.split(",") if model.strip()]


Picked = dict[int, Food | None]
Read = tuple[str, PlateDraft | str, Picked, float]


async def _extract_all(
    session: Session, photos: list[tuple[str, bytes]], model: str, runs: int
) -> list[list[Read]]:
    """Per run each photo's draft (or why there is none), the foods the model chose and
    the seconds both took."""
    gate = asyncio.Semaphore(PARALLEL)
    thinking = os.environ.get("PLATE_BENCH_THINKING")
    extractor = AgentPlateExtractor(thinking={"type": thinking} if thinking else None)
    pick = os.environ.get("PLATE_BENCH_PICK", "1") != "0"

    async def one(file: str, data: bytes) -> Read:
        async with gate:
            start = time.perf_counter()
            picked: Picked = {}
            try:
                draft: PlateDraft | str = await extractor.extract(data, model)
                if pick:
                    picked = await pick_foods(extractor, plate_asks(session, draft), model)
            except ExtractionFailed as error:
                draft = str(error)
            return file, draft, picked, time.perf_counter() - start

    return [await asyncio.gather(*(one(*photo) for photo in photos)) for _ in range(runs)]


def _score(
    session: Session,
    truth: Truth,
    file: str,
    draft: PlateDraft | str,
    picked: Picked,
    seconds: float,
) -> Reading:
    if isinstance(draft, str):
        missed = [(names[0], False) for names in truth.main]
        return Reading(file, seconds, missed, missed, missed, None, [], 0, None, draft)
    found = match_plate(session, draft, picked)
    items = [(item.name, item.food.name if item.food else None) for item in found.items]
    texts = [text for item in items for text in item if text]
    score = score_plate(truth, texts, found.totals.kcal)
    more = detail(truth, items)
    plain = match_plate(session, draft)
    search = detail(truth, [(i.name, i.food.name if i.food else None) for i in plain.items])
    return Reading(
        file,
        seconds,
        score.found,
        more.logged,
        search.logged,
        more.extras,
        more.unmatched,
        len(items),
        score.deviation_pct,
        None,
    )


def _share(pairs: list[tuple[str, bool]]) -> float:
    return sum(ok for _, ok in pairs) * 100 / len(pairs) if pairs else 0.0


def _figures(runs: list[list[Reading]]) -> dict:
    readings = [reading for run in runs for reading in run]
    judged = [r for r in readings if r.extras is not None]
    deviations = [r.kcal_deviation for r in readings if r.kcal_deviation is not None]
    seconds = [r.seconds for r in readings]
    per_run = [_share([pair for r in run for pair in r.seen]) for run in runs]
    return {
        "seen_pct": _share([pair for r in readings for pair in r.seen]),
        "seen_min_pct": min(per_run),
        "seen_max_pct": max(per_run),
        "logged_pct": _share([pair for r in readings for pair in r.logged]),
        "logged_search_pct": _share([pair for r in readings for pair in r.logged_search]),
        "extras_per_plate": sum(len(r.extras) for r in judged) / len(judged) if judged else None,
        "no_food_pct": sum(len(r.unmatched) for r in readings)
        * 100
        / max(1, sum(r.items for r in readings)),
        "kcal_median_deviation_pct": statistics.median(deviations) if deviations else None,
        "seconds_median": statistics.median(seconds),
        "seconds_p95": p95(seconds),
        "failed": sum(r.failed is not None for r in readings),
        "readings": len(readings),
    }


def _number(value: float | None, unit: str = "") -> str:
    return "-" if value is None else f"{value:.1f}{unit}"


def _row(model: str, f: dict) -> str:
    seen = f"{f['seen_pct']:.1f} % ({f['seen_min_pct']:.0f}-{f['seen_max_pct']:.0f})"
    return (
        f"{model:<20} {seen:>18} {_number(f['logged_pct'], ' %'):>9}"
        f" {_number(f['logged_search_pct'], ' %'):>9}"
        f" {_number(f['extras_per_plate']):>8} {_number(f['no_food_pct'], ' %'):>8}"
        f" {_number(f['kcal_median_deviation_pct'], ' %'):>9}"
        f" {f['seconds_median']:>5.1f} / {f['seconds_p95']:.1f} s {f['failed']:>6}"
    )


HEADER = (
    f"{'model':<20} {'seen (range)':>18} {'logged':>9} {'search':>9} {'made up':>8} {'no food':>8}"
    f" {'kcal dev':>9} {'median / p95':>14} {'failed':>6}"
)


def _missed(runs: list[list[Reading]], field: str) -> list[str]:
    """ "photo: ingredient 2/3" for each main ingredient not found in every run."""
    hits: Counter[tuple[str, str]] = Counter()
    for run in runs:
        for reading in run:
            for label, ok in getattr(reading, field):
                hits[(reading.file, label)] += ok
    return [
        f"    {file}: {label} {count}/{len(runs)}"
        for (file, label), count in sorted(hits.items())
        if count < len(runs)
    ]


@pytest.mark.parametrize("name", list(SETS))
def test_plate_benchmark(name: str, bls: Session, capsys: pytest.CaptureFixture[str]) -> None:
    plates = photo_set(SETS[name], "plates")
    if plates.empty:
        pytest.skip(f"no plate set at {plates.dir or '$BISS_REAL_FIXTURES/plates (unset)'}")
    assert plates.problems == []
    truths = {p.file: expected_plate(p.truth, p.file) for p in plates.photos}
    photos = [(p.file, prepare(p.path.read_bytes())) for p in plates.photos]
    runs = int(os.environ.get("PLATE_BENCH_RUNS") or 1)
    label = os.environ.get("PLATE_BENCH_LABEL") or "baseline"

    def show(*lines: str) -> None:
        with capsys.disabled():
            print("\n".join(lines))

    show(
        "",
        f"[{name}] {label}: {len(photos)} photos x {runs} run(s), "
        f"{sum(len(t.main) for t in truths.values())} main ingredients",
        HEADER,
    )
    results, notes = {}, []
    for model in _models():
        drafts = asyncio.run(_extract_all(bls, photos, model, runs))
        scored = [[_score(bls, truths[read[0]], *read) for read in run] for run in drafts]
        results[model] = _figures(scored)
        show(_row(model, results[model]))
        made_up = Counter(extra for run in scored for r in run for extra in r.extras or [])
        no_food = Counter(item for run in scored for r in run for item in r.unmatched)
        notes += [
            f"{model}",
            "  not seen:",
            *_missed(scored, "seen"),
            "  seen, but the wrong or no food:",
            *[line for line in _missed(scored, "logged") if line not in _missed(scored, "seen")],
            "  made up: " + ", ".join(f"{n} x{c}" for n, c in made_up.most_common(15)),
            "  no food: " + ", ".join(f"{n} x{c}" for n, c in no_food.most_common(15)),
        ]
    show("", *notes)

    out = os.environ.get("PLATE_BENCH_OUT")
    if out:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
        path = Path(out) / f"{stamp}-{name}-{label.replace(' ', '-')}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"set": name, "label": label, "runs": runs, "models": results}, indent=2),
            encoding="utf-8",
        )
        show(f"written to {path}")
