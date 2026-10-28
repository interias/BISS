"""Food search over all sources in Postgres with one query (SPEC 6, ADR-0002)."""

from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.search.normalize import normalize
from app.search.ranking import (
    DUPLICATE_KCAL_TOLERANCE,
    DUPLICATE_NAME_SIMILARITY,
    RANKING,
    RankingConfig,
)

# 1. Candidates: the query or its plural stem within name_norm (GIN index
#    food_name_norm_trgm) or within the brand.
# 2. Text similarity on a key without umlaut spellings ("moehre", "mohre" and "Möhre"
#    meet as "mohre"), for the query and its stem, and for compounds also without spaces
#    (BLS writes "Hafer Flocken", people type "Haferflocken").
# 3. For each of the best candidates the generic candidates it duplicates.
_SEARCH = text(
    """
    WITH matched AS (
        SELECT f.*,
               replace(replace(replace(concat_ws(' ', f.name_norm, biss_normalize(f.brand)),
                   'ae', 'a'), 'oe', 'o'), 'ue', 'u') AS key
        FROM food f
        WHERE :q <% f.name_norm OR :q_stem <% f.name_norm
           OR (f.brand IS NOT NULL AND :q <% biss_normalize(f.brand))
    ),
    scored AS (
        SELECT m.*,
               :w_word * greatest(word_similarity(:key, key), word_similarity(:key_stem, key))
             + :w_strict * greatest(
                   strict_word_similarity(:key, key),
                   strict_word_similarity(:key_stem, key),
                   strict_word_similarity(:key, replace(key, ' ', '')),
                   strict_word_similarity(:key_stem, replace(key, ' ', '')))
             + :w_similarity * greatest(
                   similarity(:key, key),
                   similarity(:key_stem, key),
                   similarity(:key, replace(key, ' ', '')),
                   similarity(:key_stem, replace(key, ' ', '')))
             + :w_source * CASE m.source
                   WHEN 'own' THEN :p_own WHEN 'bls' THEN :p_bls ELSE :p_off END
             + :w_completeness * num_nonnulls(m.kcal, m.protein, m.carbs, m.fat, m.fiber) / 5.0
               AS score
        FROM matched m
    ),
    candidate AS MATERIALIZED (
        SELECT * FROM scored ORDER BY score DESC, id LIMIT :candidates
    )
    SELECT c.id, c.name, c.brand, c.source, c.basis, c.density,
           c.kcal, c.protein, c.carbs, c.fat, c.score,
           EXISTS (SELECT 1 FROM entry e WHERE e.food_id = c.id) AS used,
           s.label AS serving_label, s.grams AS serving_grams, s.origin AS serving_origin,
           ARRAY(
               SELECT d.id FROM candidate d
               WHERE d.id <> c.id AND c.brand IS NULL AND d.brand IS NULL
                 AND similarity(c.name_norm, d.name_norm) >= :name_similarity
                 AND abs(c.kcal - d.kcal) <= :kcal_tolerance * greatest(c.kcal, d.kcal)
           ) AS duplicates
    FROM candidate c
    LEFT JOIN serving s ON s.food_id = c.id AND s.is_default
    """
)


@dataclass(frozen=True)
class Hit:
    id: int
    name: str
    brand: str | None
    source: str
    basis: str
    density: float
    kcal: float
    protein: float
    carbs: float
    fat: float
    serving_label: str | None
    serving_grams: float | None
    serving_origin: str | None
    score: float


def _flat(value: str) -> str:
    return value.replace("ae", "a").replace("oe", "o").replace("ue", "u")


def _stem(value: str) -> str:
    """Drop a plural -n from longer words: "bananen" -> "banane", "tomaten" -> "tomate"."""
    return " ".join(w[:-1] if len(w) >= 5 and w.endswith("n") else w for w in value.split())


def _keep_rank(row) -> int:
    """Which duplicate is kept: own DB > already used > BLS > OFF."""
    if row.source == "own":
        return 0
    if row.used:
        return 1
    return 2 if row.source == "bls" else 3


def search_foods(
    session: Session, query: str, limit: int = 20, config: RankingConfig = RANKING
) -> list[Hit]:
    """Return the best foods for a search text, duplicates of generic foods merged."""
    q = normalize(query)
    if not q:
        return []
    session.execute(
        text("SELECT set_config('pg_trgm.word_similarity_threshold', :t, true)"),
        {"t": str(config.threshold)},
    )
    priority = config.source_priority
    rows = session.execute(
        _SEARCH,
        {
            "q": q,
            "q_stem": _stem(q),
            "key": _flat(q),
            "key_stem": _flat(_stem(q)),
            "w_word": config.word_similarity,
            "w_strict": config.strict_word_similarity,
            "w_similarity": config.similarity,
            "w_source": config.source,
            "p_own": priority["own"],
            "p_bls": priority["bls"],
            "p_off": priority["off"],
            "w_completeness": config.completeness,
            "candidates": config.candidates,
            "name_similarity": DUPLICATE_NAME_SIMILARITY,
            "kcal_tolerance": DUPLICATE_KCAL_TOLERANCE,
        },
    ).all()

    kept, dropped = [], set()
    for row in sorted(rows, key=lambda r: (_keep_rank(r), -r.score, r.id)):
        if row.id not in dropped:
            kept.append(row)
            dropped.update(row.duplicates)
    kept.sort(key=lambda r: (-r.score, r.id))

    return [
        Hit(
            id=row.id,
            name=row.name,
            brand=row.brand,
            source=row.source,
            basis=row.basis,
            density=row.density,
            kcal=row.kcal,
            protein=row.protein,
            carbs=row.carbs,
            fat=row.fat,
            serving_label=row.serving_label,
            serving_grams=row.serving_grams,
            serving_origin=row.serving_origin,
            score=round(row.score, 4),
        )
        for row in kept[:limit]
    ]
