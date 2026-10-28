"""Rules for a food's servings: origin after an edit and the one standard serving."""

from collections.abc import Sequence


class TooManyDefaults(ValueError):
    pass


def origin_after_edit(
    origin: str, old_label: str, old_grams: float, label: str, grams: float
) -> str:
    """A package or estimated serving whose label or grams change becomes own."""
    if (label, grams) != (old_label, old_grams):
        return "own"
    return origin


def default_index(flags: Sequence[bool]) -> int | None:
    """Index of the standard serving among a food's servings, given their is_default flags.

    Without a flag the first serving is the standard; more than one flag is an error.
    No servings, no standard (the derived 100 g applies).
    """
    marked = [index for index, flag in enumerate(flags) if flag]
    if len(marked) > 1:
        raise TooManyDefaults("at most one serving can be the standard serving")
    if marked:
        return marked[0]
    return 0 if flags else None
