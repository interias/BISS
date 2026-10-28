"""Spike of the plate recognition (ADR-0009): one photo, JSON with draft, rule check and time.

Every model call is a real call on the token in .env; the output says how many there were.
The script needs no database; the matching of the drafts runs without a model.

    docker compose run --rm --no-deps api uv run python scripts/spike_plate.py <photo>
        [--model fast|strong|both]
"""

import argparse
import asyncio
import json
import sys
import tempfile
import time
from pathlib import Path

# The api project is no installed package; the script runs from api/.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.labels.photo import prepare  # noqa: E402
from app.plates.agent import AgentPlateExtractor  # noqa: E402
from app.plates.extract import violations  # noqa: E402
from app.plates.extractor import ExtractionFailed  # noqa: E402

CHOICES = {"fast": ["fast"], "strong": ["strong"], "both": ["fast", "strong"]}


async def run(photo: bytes, models: list[str]) -> dict:
    settings = get_settings()
    names = {"fast": settings.llm_model_fast, "strong": settings.llm_model_strong}
    extractor = AgentPlateExtractor()
    runs = []
    for model in models:
        start = time.perf_counter()
        entry: dict = {"model": names[model]}
        try:
            draft = await extractor.extract(photo, names[model])
        except ExtractionFailed as error:
            entry["error"] = str(error)
        else:
            entry["draft"] = draft.model_dump()
            entry["violations"] = violations(draft)
        entry["seconds"] = round(time.perf_counter() - start, 2)
        runs.append(entry)
    leftovers = sorted(p.name for p in Path(tempfile.gettempdir()).glob("biss-plate-*"))
    return {
        "llm_calls": len(runs),
        "photo_bytes": len(photo),
        "runs": runs,
        # Evidence that no copy of the photo stays behind (SPEC 7a).
        "leftover_temp_dirs": leftovers,
        "home_claude_dir_exists": (Path.home() / ".claude").exists(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("photo", type=Path)
    parser.add_argument("--model", choices=CHOICES, default="fast")
    args = parser.parse_args()
    out = asyncio.run(run(prepare(args.photo.read_bytes()), CHOICES[args.model]))
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
