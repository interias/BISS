"""Prepare the demo day for the reel in a separate demo stack (never the own one).

Usage: python marketing/reel/seed.py [base]   (default http://127.0.0.1:2577/api/v1)
Idempotent: creates the foods, Schnellzugriffe and the recipe once, logs yesterday's history
once, and clears today's diary so every capture starts from an empty day.
"""
import datetime as dt
import json
import sys
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:2577/api/v1"
TODAY = dt.date.today()


def call(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as res:
        raw = res.read()
    return json.loads(raw) if raw else None


def bls(name: str) -> int:
    """The id of a BLS food by its exact name."""
    hits = call("GET", "/foods/search?q=" + urllib.parse.quote(name))["hits"]
    for h in hits:
        if h["name"] == name:
            return h["id"]
    sys.exit(f"BLS food not found: {name}")


def own_food(name: str, copy_of: str, category: str, serving: tuple[str, float]) -> int:
    for h in call("GET", "/foods/search?q=" + urllib.parse.quote(name))["hits"]:
        if h["name"] == name and h["source"] != "bls":
            return h["id"]
    src = call("GET", f"/foods/{bls(copy_of)}")
    per = {k: src["per_100"][k] for k in ("kcal", "protein", "carbs", "fat")}
    food = call("POST", "/foods", {"name": name, "category": category, "per_100": per,
                                   "servings": [{"label": serving[0], "grams": serving[1], "is_default": True}]})
    return food["id"]


def combo(name: str, items: list[tuple[int, float]]) -> None:
    body = {"name": name, "items": [{"food_id": f, "grams": g} for f, g in items]}
    for c in call("GET", "/combos"):
        if c["name"] == name:
            call("PATCH", f"/combos/{c['id']}", body)
            return
    call("POST", "/combos", body)


def recipe(name: str, items: list[tuple[int, float]], portions: int, cooked: float, text: str) -> None:
    body = {"name": name, "description": text, "portions": portions, "cooked_grams": cooked,
            "items": [{"food_id": f, "grams": g} for f, g in items]}
    for r in call("GET", "/recipes"):
        if r["name"] == name:
            call("PATCH", f"/recipes/{r['id']}", body)
            return
    call("POST", "/recipes", body)


def at(day: dt.date, hh: int, mm: int) -> str:
    return dt.datetime(day.year, day.month, day.day, hh, mm).astimezone().isoformat()


def clear(day: dt.date) -> None:
    for row in call("GET", f"/days/{day.isoformat()}")["rows"]:
        if row.get("kind") == "group":
            call("DELETE", f"/entries/group/{row['group_id']}")
        else:
            call("DELETE", f"/entries/{row['entry']['id']}")


def main() -> None:
    oats = own_food("Haferflocken", "Hafer Flocken", "grains", ("1 Schale", 60))
    skyr, berries, walnut = bls("Skyr, Frischkäse < 10 % Fett i. Tr."), bls("Heidelbeere roh"), bls("Walnuss")
    apple = bls("Apfel roh")
    breakfast = [(skyr, 150), (berries, 100), (walnut, 10)]
    # One Schnellzugriff only, so the chips the reel taps stay within 384 px.
    combo("Frühstück", breakfast)
    recipe("Lasagne", [(bls("Teigwaren eifrei, roh"), 250), (bls("Rind Hackfleisch, roh"), 500), (bls("Tomate roh"), 800),
                       (bls("Gouda 48 % Fett i. Tr."), 150), (bls("Vollmilch frisch, 3,5 % Fett, pasteurisiert"), 500)],
           6, 1800, "Hack anbraten, Tomaten dazu, schichten, 40 Minuten backen.")

    # Yesterday's day makes the recent chips and the suggestions real. The dock orders chips
    # by last use, so the oats come last (first chip) and the apple before the breakfast,
    # which keeps the Frühstück chip second and on screen.
    yesterday = TODAY - dt.timedelta(days=1)
    clear(yesterday)
    call("POST", "/entries/group", {"group_name": "Frühstück", "eaten_at": at(yesterday, 7, 30),
                                    "items": [{"food_id": f, "grams": g} for f, g in breakfast]})
    call("POST", "/entries", {"food_id": apple, "grams": 150, "eaten_at": at(yesterday, 7, 0)})
    call("POST", "/entries", {"food_id": oats, "grams": 60, "eaten_at": at(yesterday, 18, 30)})
    clear(TODAY)
    # Goals of an active day, so the full demo day ends just below them.
    call("PUT", "/goals/default", {"kcal": 3000, "protein": 150, "carbs": 360, "fat": 120})
    print("seeded", TODAY)


if __name__ == "__main__":
    main()
