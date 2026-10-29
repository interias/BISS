"""Food search over all sources in Postgres with one query (SPEC 6, ADR-0002).

The sources are the foods (own, BLS, logged Open Food Facts products) and the Open Food
Facts cache: products shown after a scan, younger than 30 days and not yet a food. A cache
hit has no id; its first entry stores it as food (POST /entries with gtin, SPEC 4).
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.barcode.chain import CACHE_DAYS
from app.search.normalize import normalize
from app.search.usage import USAGE_BY_FOOD, usage_params
from app.search.weights import (
    DUPLICATE_KCAL_TOLERANCE,
    DUPLICATE_NAME_SIMILARITY,
    RANKING,
    RankingConfig,
)
from app.sources import off
from app.sources.off import FoodDraft

# Cache rows `o` the search sees: the window of chain.cached_product (:cache_since,
# computed in Python like there), a name (off.draft() rejects a product without one), and
# no food has the GTIN (a branded product of the same GTIN is merged into the food, SPEC 6).
_CACHED = """
    o.fetched_at > :cache_since AND o.name_norm IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM food f WHERE f.gtin = o.gtin)
"""

# The longest known brand (food.brand or a cached product's brand, normalised) that stands
# as whole words in the query.
_KNOWN_BRAND = text(
    f"""
    SELECT b FROM (SELECT DISTINCT biss_normalize(brand) AS b FROM food
                   WHERE brand IS NOT NULL
                   UNION
                   SELECT o.brand_norm FROM off_cache o
                   WHERE o.brand_norm IS NOT NULL AND {_CACHED}) brands
    WHERE b <> '' AND strpos(' ' || :q || ' ', ' ' || b || ' ') > 0
    ORDER BY length(b) DESC, b LIMIT 1
    """
)


def _off_number(key: str) -> str:
    """SQL for off._number() of the nutriment `key` of the cached payload `o.payload`.

    A non-negative, finite number from a JSON number or a string like "1,5", else NULL.
    The CASE is nested, so the cast only runs on valid input.
    """
    value = "(o.payload #> '{product,nutriments," + key + "}')"
    number = f"replace(btrim({value} #>> '{{}}'), ',', '.')"
    as_float = f"CAST({number} AS float8)"
    return (
        f"CASE WHEN jsonb_typeof({value}) IN ('number', 'string') "
        f"AND pg_input_is_valid({number}, 'float8') "
        f"THEN CASE WHEN {as_float} >= 0 AND {as_float} < 'Infinity' THEN {as_float} END END"
    )


_N = {field: _off_number(key) for field, key in off.NUTRIMENTS.items()}

# 1. Candidates: the query or its plural stem within name_norm (GIN indexes
#    food_name_norm_trgm and off_cache_name_norm_trgm) or within the brand. A cache row
#    carries the values off.draft() maps (kcal from kJ when missing, core values 0 when
#    missing), so it ranks and merges like the food it becomes; `ref` names a row of
#    either kind.
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
        SELECT 'food ' || f.id AS ref, f.id, f.gtin, f.source,
               f.kcal, f.protein, f.carbs, f.fat, f.fiber,
               f.name_norm, biss_normalize(f.brand) AS brand_norm, CAST(NULL AS jsonb) AS payload
        FROM food f
        WHERE :q <% f.name_norm OR :q_stem <% f.name_norm
           OR (f.brand IS NOT NULL AND :q <% biss_normalize(f.brand))
        UNION ALL
        SELECT 'off ' || c.gtin, NULL, c.gtin, 'off', c.kcal, c.protein, c.carbs, c.fat, c.fiber,
               c.name_norm, c.brand_norm, c.payload
        FROM (
            SELECT o.gtin, o.payload, o.name_norm, o.brand_norm,
                   CAST(coalesce({_N["kcal"]},
                        round(CAST({_off_number("energy-kj_100g")} / :kj_per_kcal AS numeric), 1))
                        AS float8) AS kcal,
                   coalesce({_N["protein"]}, 0) AS protein,
                   coalesce({_N["carbs"]}, 0) AS carbs,
                   coalesce({_N["fat"]}, 0) AS fat,
                   {_N["fiber"]} AS fiber
            FROM off_cache o
            WHERE {_CACHED}
              AND (:q <% o.name_norm OR :q_stem <% o.name_norm OR :q <% o.brand_norm)
        ) c
        WHERE c.kcal IS NOT NULL
    ),
    keyed AS (
        SELECT m.*,
               replace(replace(replace(concat_ws(' ', m.name_norm, m.brand_norm),
                   'ae', 'a'), 'oe', 'o'), 'ue', 'u') AS key
        FROM matched m
    ),
    filtered AS (
        SELECT * FROM keyed
        WHERE NOT :brand_filter OR brand_norm = CAST(:brand_hit AS text)
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
             + :w_brand * CASE WHEN m.brand_norm = CAST(:brand_hit AS text) THEN 1 ELSE 0 END
               AS score,
               coalesce(u.usage, 0) AS usage
        FROM filtered m
        LEFT JOIN food_usage u ON u.food_id = m.id
        CROSS JOIN LATERAL (
            SELECT greatest(word_similarity(:key, m.key), word_similarity(:key_stem, m.key)) AS ws
        ) w
    ),
    candidate AS MATERIALIZED (
        SELECT * FROM scored ORDER BY score DESC, id, gtin LIMIT :candidates
    )
    SELECT c.ref, c.id, c.gtin, c.payload, f.name, f.brand, c.source, f.basis, f.density,
           f.category,
           c.kcal, c.protein, c.carbs, c.fat, c.score,
           c.usage > 0 AS used,
           s.label AS serving_label, s.grams AS serving_grams, s.origin AS serving_origin,
           ARRAY(
               SELECT d.ref FROM candidate d
               WHERE d.ref <> c.ref AND c.brand_norm IS NULL AND d.brand_norm IS NULL
                 AND similarity(c.name_norm, d.name_norm) >= :name_similarity
                 AND abs(c.kcal - d.kcal) <= :kcal_tolerance * greatest(c.kcal, d.kcal)
           ) AS duplicates
    FROM candidate c
    LEFT JOIN food f ON f.id = c.id
    LEFT JOIN serving s ON s.food_id = c.id AND s.is_default
    """
)


@dataclass(frozen=True)
class Hit:
    """A food, or with id None a product of the Open Food Facts cache (logged by gtin)."""

    id: int | None
    gtin: str | None
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
    category: str | None = None


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


def _order(row) -> tuple:
    """Best score first; on a tie foods by id, then cache rows by GTIN."""
    return -row.score, row.id is None, row.id or 0, row.gtin or ""


def _cache_since(now: datetime) -> datetime:
    """Cache rows fetched after this moment count, as in chain.cached_product."""
    return now - timedelta(days=CACHE_DAYS)


def _brand_split(session: Session, q: str, now: datetime) -> tuple[str | None, str]:
    """The known brand in the query and the query without it (the brand alone stays)."""
    brand = session.scalar(_KNOWN_BRAND, {"q": q, "cache_since": _cache_since(now)})
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
            "cache_since": _cache_since(now),
            "kj_per_kcal": off.KJ_PER_KCAL,
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

    A cache hit shows what off.draft() makes of its payload, as the amount sheet does.
    """
    q = normalize(query)
    if not q:
        return []
    now = now or datetime.now(UTC)
    brand, rest = _brand_split(session, q, now)
    rows = []
    if brand is not None and rest != q:
        rows = _query(session, rest, rest, brand, True, now, config)
    if not rows:
        rows = _query(session, q, rest, brand, False, now, config)

    # The SQL reads the payload like draft(); a row draft() still rejects is left out.
    drafts = {row.gtin: off.draft(row.gtin, row.payload) for row in rows if row.id is None}
    rows = [row for row in rows if row.id is not None or drafts[row.gtin] is not None]

    kept, dropped = [], set()
    for row in sorted(rows, key=lambda r: (_keep_rank(r), *_order(r))):
        if row.ref not in dropped:
            kept.append(row)
            dropped.update(row.duplicates)
    kept.sort(key=_order)

    return [
        _hit(row) if row.id is not None else _cache_hit(row, drafts[row.gtin])
        for row in kept[:limit]
    ]


def _hit(row) -> Hit:
    return Hit(
        id=row.id,
        gtin=row.gtin,
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
        category=row.category,
    )


def _cache_hit(row, found: FoodDraft) -> Hit:
    return draft_hit(found, row.score)


def draft_hit(found: FoodDraft, score: float = 0.0) -> Hit:
    """The product as chain.food_for_entry() would store it, with its package serving."""
    serving = found.serving
    return Hit(
        id=None,
        gtin=found.gtin,
        name=found.name,
        brand=found.brand,
        source=off.SOURCE,
        basis=found.basis,
        density=1.0,
        kcal=found.values["kcal"],
        protein=found.values["protein"],
        carbs=found.values["carbs"],
        fat=found.values["fat"],
        serving_label=None if serving is None else serving.label,
        serving_grams=None if serving is None else serving.grams,
        serving_origin=None if serving is None else "package",
        score=round(score, 4),
        category=found.category,
    )
