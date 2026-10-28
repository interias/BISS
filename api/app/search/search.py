"""Food search over all sources in Postgres with one query (SPEC 6, ADR-0002)."""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.search.normalize import normalize
from app.search.usage import USAGE_BY_FOOD, usage_params
from app.search.weights import (
    DUPLICATE_KCAL_TOLERANCE,
    DUPLICATE_NAME_SIMILARITY,
    RANKING,
    RankingConfig,
)

# The longest known brand (food.brand, normalised) that stands as whole words in the query.
_KNOWN_BRAND = text(
    """
    SELECT b FROM (SELECT DISTINCT biss_normalize(brand) AS b FROM food
                   WHERE brand IS NOT NULL) brands
    WHERE b <> '' AND strpos(' ' || :q || ' ', ' ' || b || ' ') > 0
    ORDER BY length(b) DESC, b LIMIT 1
    """
)

# 1. Candidates: the query or its plural stem within name_norm (GIN index
#    food_name_norm_trgm) or within the brand.
# 2. Text similarity on a key without umlaut spellings ("moehre", "mohre" and "Möhre"
#    meet as "mohre"), for the query and its stem, and for compounds also without spaces
#    (BLS writes "Hafer Flocken", people type "Haferflocken").
#    Usage counts as much as the word similarity: it lifts a food that matches the query,
#    not one that hardly resembles it.
# 3. For each of the best candidates the generic candidates it duplicates.
# With :brand_filter only the foods of the brand :brand_hit are candidates; the brand
# match bonus applies to that brand in both modes.
_SEARCH = text(
    f"""
    WITH food_usage AS ({USAGE_BY_FOOD}),
    matched AS (
        SELECT f.*,
               replace(replace(replace(concat_ws(' ', f.name_norm, biss_normalize(f.brand)),
                   'ae', 'a'), 'oe', 'o'), 'ue', 'u') AS key
        FROM food f
        WHERE :q <% f.name_norm OR :q_stem <% f.name_norm
           OR (f.brand IS NOT NULL AND :q <% biss_normalize(f.brand))
    ),
    filtered AS (
        SELECT * FROM matched
        WHERE NOT :brand_filter OR biss_normalize(brand) = CAST(:brand_hit AS text)
    ),
    scored AS (
        SELECT m.*,
               :w_word * w.ws
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
             + :w_usage * w.ws * coalesce(u.usage, 0) / (coalesce(u.usage, 0) + :usage_scale)
             + :w_brand * CASE WHEN biss_normalize(m.brand) = CAST(:brand_hit AS text)
                               THEN 1 ELSE 0 END
               AS score,
               coalesce(u.usage, 0) AS usage
        FROM filtered m
        LEFT JOIN food_usage u ON u.food_id = m.id
        CROSS JOIN LATERAL (
            SELECT greatest(word_similarity(:key, m.key), word_similarity(:key_stem, m.key)) AS ws
        ) w
    ),
    candidate AS MATERIALIZED (
        SELECT * FROM scored ORDER BY score DESC, id LIMIT :candidates
    )
    SELECT c.id, c.name, c.brand, c.source, c.basis, c.density,
           c.kcal, c.protein, c.carbs, c.fat, c.score,
           c.usage > 0 AS used,
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


def _brand_split(session: Session, q: str) -> tuple[str | None, str]:
    """The known brand in the query and the query without it (the brand alone stays)."""
    brand = session.scalar(_KNOWN_BRAND, {"q": q})
    if brand is None:
        return None, q
    rest = " ".join(f" {q} ".replace(f" {brand} ", " ").split())
    return brand, rest or q


def _query(session: Session, q: str, text_q: str, brand, brand_filter: bool, now, config):
    session.execute(
        text("SELECT set_config('pg_trgm.word_similarity_threshold', :t, true)"),
        {"t": str(config.threshold)},
    )
    priority = config.source_priority
    return session.execute(
        _SEARCH,
        {
            "q": q,
            "q_stem": _stem(q),
            "key": _flat(text_q),
            "key_stem": _flat(_stem(text_q)),
            "brand_hit": brand,
            "brand_filter": brand_filter,
            "w_word": config.word_similarity,
            "w_strict": config.strict_word_similarity,
            "w_similarity": config.similarity,
            "w_source": config.source,
            "p_own": priority["own"],
            "p_bls": priority["bls"],
            "p_off": priority["off"],
            "w_completeness": config.completeness,
            "w_usage": config.usage,
            "usage_scale": config.usage_scale,
            "w_brand": config.brand,
            "candidates": config.candidates,
            "name_similarity": DUPLICATE_NAME_SIMILARITY,
            "kcal_tolerance": DUPLICATE_KCAL_TOLERANCE,
        }
        | usage_params(now, config),
    ).all()


def search_foods(
    session: Session,
    query: str,
    limit: int = 20,
    config: RankingConfig = RANKING,
    now: datetime | None = None,
) -> list[Hit]:
    """Return the best foods for a search text, duplicates of generic foods merged.

    A word of the query that is a known brand filters on that brand and is left out of
    the text similarity. Without a hit it only counts as a brand match bonus: candidates
    are found with the whole query, ranked by the text similarity of the rest.
    """
    q = normalize(query)
    if not q:
        return []
    brand, rest = _brand_split(session, q)
    rows = []
    if brand is not None and rest != q:
        rows = _query(session, rest, rest, brand, True, now, config)
    if not rows:
        rows = _query(session, q, rest, brand, False, now, config)

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
