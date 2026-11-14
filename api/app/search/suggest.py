"""The Wirt: what the search shows before anything is typed (SPEC 6).

Like the landlord of a regular's pub, who puts the coffee down at eight and the beer in the
evening, it guesses the next entry from the diary alone. Nothing is trained and nothing is
stored: every entry is an observation, and counting them is the learning.

A food gets points for four questions:
- How often and how lately was it logged? Each entry counts 0.5 ^ (age / half-life).
- Does the time of day fit? An entry at this hour counts up to 1 + time_weight times.
- What usually comes next? A food that followed the foods logged just now is raised.
- Was it logged today already? Then it drops, unless it usually comes several times a day.

Guessed are foods logged as single entries and Schnellzugriffe: a Gericht logged under the
name of a Schnellzugriff counts as one entry of it. The foods of a Gericht are not guessed
on their own, a plate does not go through the search; they still count as what was logged
just now. Below the guesses the search lists the foods and Schnellzugriffe last used,
strictly by time, so each is always where it is expected.
suggest_backtest replays the diary to say how good the guesses are.
"""

import math
from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.day import day_of, to_local
from app.models import Combo, Entry, Food
from app.services.combos import ComboView, list_combos
from app.services.foods import StandardServing, standard_servings


@dataclass(frozen=True)
class SuggestConfig:
    # Guesses on top and foods in the list of the last used below.
    tips: int = 6
    recent: int = 100
    # An entry a month old counts half, as in the usage of the search ranking.
    half_life_days: float = 30.0
    # An entry at the same time of day counts 1 + time_weight times one at another time.
    time_weight: float = 4.0
    # How far "the same time" reaches: at 1.5 h distance an entry still counts 0.6 of it.
    time_sigma_hours: float = 1.5
    # A young diary knows no habits yet: after this many days with entries the time of day
    # has half of its weight, so the first days go mostly by "how often and how lately".
    time_days: float = 7.0
    # A food that always followed what was logged just now counts up to 1 + follow_weight
    # times.
    follow_weight: float = 8.0
    # "Just now" and "follows": within this many minutes.
    follow_minutes: float = 30.0
    # Older entries count under 0.001 and are not read.
    history_days: int = 365


SUGGEST = SuggestConfig()


# What the Wirt guesses: ("food", id) or ("combo", id).
Item = tuple[str, int]


@dataclass(frozen=True)
class Event:
    """An entry as the Wirt sees it; `single` is false for the foods of a Gericht."""

    item: Item
    eaten_at: datetime
    single: bool = True


def _hour(moment: datetime) -> float:
    local = to_local(moment)
    return local.hour + local.minute / 60


def _again(per_day: Counter[date], today: date) -> float:
    """How likely one more entry today is: the share of days that went beyond today's count."""
    count = per_day.get(today, 0)
    if count == 0:
        return 1.0
    others = [n for day, n in per_day.items() if day != today]
    return (sum(n > count for n in others) + 0.5) / (sum(n >= count for n in others) + 1)


def _follows(past: list[Event], now: datetime, config: SuggestConfig) -> dict[int, float]:
    """Per food the share of earlier times it followed a food logged just now, 0 to 1."""
    window = timedelta(minutes=config.follow_minutes)
    just_now = {event.item for event in past if now - event.eaten_at <= window}
    share: dict[int, float] = {}
    for lead in just_now:
        seen = 0.0
        after: dict[int, float] = defaultdict(float)
        for index, event in enumerate(past):
            # The entries of just now are the question, not the evidence.
            if event.item != lead or now - event.eaten_at <= window:
                continue
            weight = _decay(event, now, config)
            seen += weight
            followers = set()
            for later in past[index + 1 :]:
                if later.eaten_at - event.eaten_at > window:
                    break
                if later.single and later.item != lead and later.eaten_at > event.eaten_at:
                    followers.add(later.item)
            for item in followers:
                after[item] += weight
        for item, weight in after.items():
            # + 1: a single observation is no certainty.
            share[item] = max(share.get(item, 0.0), weight / (seen + 1))
    return share


def _decay(event: Event, now: datetime, config: SuggestConfig) -> float:
    age_days = (now - event.eaten_at).total_seconds() / 86400
    return 0.5 ** (age_days / config.half_life_days)


def rank(events: Iterable[Event], now: datetime, config: SuggestConfig = SUGGEST) -> list[Item]:
    """The items logged as single entries until now, the most likely next one first."""
    past = sorted((e for e in events if e.eaten_at <= now), key=lambda e: e.eaten_at)
    days = len({day_of(event.eaten_at) for event in past})
    time_weight = config.time_weight * days / (days + config.time_days)
    hour, today = _hour(now), day_of(now)

    habit: dict[int, float] = defaultdict(float)
    per_day: dict[int, Counter[date]] = defaultdict(Counter)
    last: dict[int, datetime] = {}
    for event in past:
        if not event.single:
            continue
        gap = abs(_hour(event.eaten_at) - hour)
        gap = min(gap, 24 - gap)
        near = math.exp(-(gap**2) / (2 * config.time_sigma_hours**2))
        habit[event.item] += _decay(event, now, config) * (1 + time_weight * near)
        per_day[event.item][day_of(event.eaten_at)] += 1
        last[event.item] = event.eaten_at

    follows = _follows(past, now, config)

    def score(item: int) -> float:
        return (
            habit[item]
            * (1 + config.follow_weight * follows.get(item, 0.0))
            * _again(per_day[item], today)
        )

    return sorted(habit, key=lambda item: (-score(item), -last[item].timestamp()))


def load_events(session: Session, now: datetime, config: SuggestConfig = SUGGEST) -> list[Event]:
    """The entries of the last year; a Gericht named like a Schnellzugriff adds one event of it."""
    combos = {combo.name: combo.id for combo in session.scalars(select(Combo))}
    rows = session.execute(
        select(Entry.food_id, Entry.eaten_at, Entry.group_id, Entry.group_name)
        .where(Entry.eaten_at > now - timedelta(days=config.history_days))
        .order_by(Entry.eaten_at, Entry.id)
    )
    events, groups = [], set()
    for food_id, eaten_at, group_id, group_name in rows:
        events.append(Event(("food", food_id), eaten_at, group_id is None))
        if group_id is not None and group_id not in groups and group_name in combos:
            groups.add(group_id)
            events.append(Event(("combo", combos[group_name]), eaten_at))
    return events


def _last_used(session: Session, limit: int) -> list[Item]:
    """Foods and Schnellzugriffe by their latest entry; a Schnellzugriff before its foods."""
    foods = session.execute(
        select(Entry.food_id, func.max(Entry.eaten_at), func.max(Entry.id))
        .group_by(Entry.food_id)
        .order_by(func.max(Entry.eaten_at).desc(), func.max(Entry.id).desc())
        .limit(limit)
    )
    used = [(eaten_at, 0, entry_id, ("food", food_id)) for food_id, eaten_at, entry_id in foods]
    names = {combo.name: combo.id for combo in session.scalars(select(Combo))}
    groups = session.execute(
        select(Entry.group_name, func.max(Entry.eaten_at), func.max(Entry.id))
        .where(Entry.group_id.is_not(None), Entry.group_name.in_(names))
        .group_by(Entry.group_name)
    )
    used += [(eaten_at, 1, entry_id, ("combo", names[name])) for name, eaten_at, entry_id in groups]
    return [item for *_, item in sorted(used, key=lambda use: use[:3], reverse=True)][:limit]


Suggested = tuple[Food, StandardServing] | ComboView


@dataclass(frozen=True)
class Suggestions:
    likely: list[Suggested]
    recent: list[Suggested]


def suggestions(session: Session, now: datetime, config: SuggestConfig = SUGGEST) -> Suggestions:
    """The guesses for this moment and what was last used, the latest first."""
    likely = rank(load_events(session, now, config), now, config)[: config.tips]
    recent = _last_used(session, config.recent)
    ids = [item_id for kind, item_id in [*likely, *recent] if kind == "food"]
    foods = {food.id: food for food in session.scalars(select(Food).where(Food.id.in_(ids)))}
    servings = standard_servings(session, ids)
    combos = {combo.id: combo for combo in list_combos(session)}

    def resolve(items: Iterable[Item]) -> list[Suggested]:
        return [
            combos[item_id] if kind == "combo" else (foods[item_id], servings[item_id])
            for kind, item_id in items
        ]

    return Suggestions(resolve(likely), resolve(recent))
