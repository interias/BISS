"""Spike of the label extraction (ADR-0004): one photo, JSON with draft, rule check and time.

Every model call is a real call on the token in .env; the output says how many there were.

    docker compose run --rm --no-deps api uv run python scripts/spike_label.py <photo>
        [--model fast|strong|both] [--transfer base64|read|both]
"""

import argparse
import asyncio
import json
import sys
import tempfile
import time
from dataclasses import asdict
from pathlib import Path

# The api project is no installed package; the script runs from api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.labels.agent import AgentLabelExtractor  # noqa: E402
from app.labels.extractor import ExtractionFailed  # noqa: E402
from app.labels.photo import prepare  # noqa: E402
from app.labels.validation import check  # noqa: E402

CHOICES = {"fast": ["fast"], "strong": ["strong"], "both": ["fast", "strong"]}


async def run(photo: bytes, models: list[str], transfers: list[str]) -> dict:
    settings = get_settings()
    names = {"fast": settings.llm_model_fast, "strong": settings.llm_model_strong}
    runs = []
    for transfer in transfers:
        extractor = AgentLabelExtractor(transfer)  # type: ignore[arg-type]
        for model in models:
            start = time.perf_counter()
            entry: dict = {"model": names[model], "transfer": transfer}
            try:
                draft = await extractor.extract(photo, names[model])
            except ExtractionFailed as error:
                entry["error"] = str(error)
            else:
                result = check(draft.per_100)
                entry["draft"] = draft.model_dump()
                entry["violations"] = [asdict(v) for v in result.violations]
            entry["seconds"] = round(time.perf_counter() - start, 2)
            runs.append(entry)
    leftovers = sorted(p.name for p in Path(tempfile.gettempdir()).glob("biss-label-*"))
    return {
        "llm_calls": len(runs),
        "runs": runs,
        # Evidence that no copy of the photo stays behind (SPEC 7).
        "leftover_temp_dirs": leftovers,
        "home_claude_dir_exists": (Path.home() / ".claude").exists(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("photo", type=Path)
    parser.add_argument("--model", choices=CHOICES, default="fast")
    parser.add_argument("--transfer", choices=["base64", "read", "both"], default="base64")
    args = parser.parse_args()
    transfers = ["base64", "read"] if args.transfer == "both" else [args.transfer]
    photo = prepare(args.photo.read_bytes())
    out = asyncio.run(run(photo, CHOICES[args.model], transfers))
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
