"""Replays the diary to say how good the guesses of the Wirt are (SPEC 6).

For every single entry and every logged Schnellzugriff it asks: on which place stood it
just before it was logged?
The Wirt runs against two plain orders, "last used" (the list below the guesses) and "usage"
(the Zuletzt-Chips). What is logged for the first time cannot be guessed and is left out.
It only reads:

    docker compose exec api uv run python -m app.search.suggest_backtest
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from app.db import get_session
from app.search.suggest import SUGGEST, Event, Item, SuggestConfig, load_events, rank

Order = Callable[[list[Event], datetime], list[Item]]


def last_used(past: list[Event], now: datetime) -> list[Item]:
    last = {event.item: event.eaten_at for event in past}
    return sorted(last, key=lambda item: last[item], reverse=True)


def usage(past: list[Event], now: datetime, half_life_days: float = 30.0) -> list[Item]:
    total: dict[Item, float] = {}
    for event in past:
        age_days = (now - event.eaten_at).total_seconds() / 86400
        total[event.item] = total.get(event.item, 0.0) + 0.5 ** (age_days / half_life_days)
    return sorted(total, key=lambda item: total[item], reverse=True)


@dataclass(frozen=True)
class Result:
    """Of `entries` guessable entries: the share on place 1, within the tips, and the mean
    of 1 / place (0 for a food the order does not list)."""

    entries: int
    first: float
    tips: float
    mean_reciprocal_rank: float


def backtest(
    events: list[Event], config: SuggestConfig = SUGGEST, orders: dict[str, Order] | None = None
) -> dict[str, Result]:
    orders = orders or {
        "Wirt": lambda past, now: rank(past, now, config),
        "last used": last_used,
        "usage": usage,
    }
    events = sorted(events, key=lambda event: event.eaten_at)
    places: dict[str, list[int | None]] = {name: [] for name in orders}
    for index, event in enumerate(events):
        past = events[:index]
        if not event.single or all(seen.item != event.item for seen in past):
            continue
        for name, order in orders.items():
            ranked = order(past, event.eaten_at)
            places[name].append(ranked.index(event.item) + 1 if event.item in ranked else None)
    return {name: _result(found, config.tips) for name, found in places.items()}


def _result(places: list[int | None], tips: int) -> Result:
    count = len(places)
    if count == 0:
        return Result(0, 0.0, 0.0, 0.0)
    return Result(
        count,
        sum(place == 1 for place in places) / count,
        sum(place is not None and place <= tips for place in places) / count,
        sum(1 / place for place in places if place is not None) / count,
    )


def main() -> None:
    with get_session() as session:
        events = load_events(session, datetime.now(UTC))
    results = backtest(events)
    print(f"{len(events)} entries, {next(iter(results.values())).entries} of them guessable")
    print(f"{'order':<10} {'place 1':>8} {f'top {SUGGEST.tips}':>8} {'MRR':>6}")
    for name, result in results.items():
        print(
            f"{name:<10} {result.first:>8.0%} {result.tips:>8.0%}"
            f" {result.mean_reciprocal_rank:>6.2f}"
        )


if __name__ == "__main__":
    main()
