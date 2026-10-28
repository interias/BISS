"""Ranking weights of the food search (SPEC 6), tuned with tests/golden/search.yaml.

Score = text similarity + source priority + completeness. Usage and brand matches follow
in E2. Text similarity is the sum of three pg_trgm measures, each weighted below.
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
    # Minimum word_similarity of a candidate (pg_trgm.word_similarity_threshold); 0.3 still
    # finds "Brokkoli" in "Broccoli".
    threshold: float = 0.3
    # Best candidates by score that are deduplicated and returned.
    candidates: int = 60


RANKING = RankingConfig()

# Generic foods are duplicates at a name similarity of at least 0.9 and kcal within 10 %.
DUPLICATE_NAME_SIMILARITY = 0.9
DUPLICATE_KCAL_TOLERANCE = 0.1
