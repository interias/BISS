"""Ranking weights of the food search (SPEC 6), tuned with tests/golden/search.yaml.

Score = text similarity + source priority + usage + completeness + brand match.
Text similarity is the sum of three pg_trgm measures, each weighted below. Usage is the
strongest factor on top of the text; it saturates, so it cannot outvote the text.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RankingConfig:
    # word_similarity: the query within the name, for parts of words and typos.
    word_similarity: float = 1.0
    # strict_word_similarity: the query against whole words, so "vollmilch" prefers
    # "Vollmilch frisch" over "Vollmilchpulver".
    strict_word_similarity: float = 1.0
    # similarity of query and whole name: the shorter, closer name wins
    # ("Apfel roh" before "Apfel getrocknet").
    similarity: float = 1.0
    # Times source_priority of the food's source.
    source: float = 0.1
    source_priority: dict[str, float] = field(
        default_factory=lambda: {"own": 1.0, "bls": 0.5, "off": 0.0}
    )
    # Times the share of core values present (kcal, protein, carbs, fat, fiber).
    completeness: float = 0.05
    # Times the saturated usage u / (u + usage_scale), between 0 and 1, and times the word
    # similarity of the query (so a poor text match gains little). The usage u of a
    # food is the sum over its entries of 0.5 ^ (age in days / usage_half_life_days): an
    # entry from today counts 1, one a month old counts 0.5. Both the number of entries and
    # their recency raise u. At usage_scale = 3 a food with three entries today gets half
    # of the weight and no amount of usage gets more than the weight.
    usage: float = 0.5
    usage_scale: float = 3.0
    usage_half_life_days: float = 30.0
    # Added when the brand of the food is a word of the query.
    brand: float = 0.3
    # Minimum word_similarity of a candidate (pg_trgm.word_similarity_threshold); 0.3 still
    # finds "Brokkoli" in "Broccoli".
    threshold: float = 0.3
    # Best candidates by score that are deduplicated and returned.
    candidates: int = 60


RANKING = RankingConfig()

# Generic foods are duplicates at a name similarity of at least 0.9 and kcal within 10 %.
DUPLICATE_NAME_SIMILARITY = 0.9
DUPLICATE_KCAL_TOLERANCE = 0.1
