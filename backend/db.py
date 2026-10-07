"""SQLite access for the Campus Customs shop.

Everything the site claims about a product - price, colours, what is left in
stock - comes out of this module. Nothing else is a source of truth.
"""

from __future__ import annotations

import json
import re
import sqlite3
from contextlib import contextmanager
from typing import Iterator
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "data" / "campus_customs.db"
IMAGES_DIR = BASE_DIR / "data" / "products"

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL"]

# The catalogue stores 22 different spellings of what a shopper would call six
# categories ("short-sleeve t-shirt", "short-sleeve T-shirt", "t-shirt" ...).
# Matching garment_type exactly would quietly drop most of a category, so every
# product gets mapped to a normalised bucket on the way out.
CATEGORIES = [
    "T-shirts",
    "Long sleeve",
    "Crewnecks",
    "Hoodies",
    "Quarter-zips",
    "Jackets",
]


# What a shopper is buying *for*, as opposed to what garment it is. Built from
# names, descriptions and search tags because the catalogue has no such column.
# This replaced a planned men's/women's facet: only 3 of 102 products carry a
# gender label and none carry a women's one, so that filter could not have
# divided the catalogue. Collection divides all 102.
COLLECTIONS = [
    "Residential colleges",
    "Graduate schools",
    "Harvard-Yale",
    "Athletics",
    "Crest & shield",
    "Classic Yale",
]

_COLLEGES = (
    "benjamin franklin", "berkeley", "branford", "davenport", "ezra stiles",
    "grace hopper", "jonathan edwards", "morse", "pauli murray", "pierson",
    "saybrook", "silliman", "timothy dwight", "trumbull",
)
_SCHOOLS = (
    "divinity", "architecture", "school of art", "school of music",
    "school of management", "law school", "school of medicine", "nursing",
    "public health", "school of drama", "forestry", "school of engineering",
)
_SPORTS = re.compile(
    r"\b(baseball|tennis|diving|football|basketball|hockey|soccer|lacrosse|rowing|"
    r"swimming|track|golf|volleyball|squash|fencing|sailing|rugby|gymnastics|athletics)\b"
)
# "crew" is a sport; "crewneck" and "crew neck" are a collar. Without the
# lookahead this matched 40 sweatshirts and made Athletics meaningless.
_CREW = re.compile(r"\bcrew\b(?!\s*neck)")


def collection_of(product: dict[str, Any]) -> str:
    text = " ".join(
        [product["name"], product["description"], " ".join(product["search_tags"])]
    ).lower()

    if any(c in text for c in _COLLEGES):
        return "Residential colleges"
    if any(s in text for s in _SCHOOLS):
        return "Graduate schools"
    if "harvard" in text or "the game" in text:
        return "Harvard-Yale"
    if _SPORTS.search(text) or (_CREW.search(text) and "crewneck" not in text and "crew neck" not in text):
        return "Athletics"
    if "crest" in text or "shield" in text:
        return "Crest & shield"
    return "Classic Yale"


# `navy` and `navy blue` are one colour to a shopper, and 62 products say one
# while 18 say the other. A colour filter that does not merge them is broken.
COLOR_FAMILIES = ["Navy", "Gray", "White", "Blue", "Gold", "Red", "Black", "Green"]

_COLOR_MAP = {
    "navy": "Navy", "navy blue": "Navy", "midnight navy": "Navy",
    "gray": "Gray", "grey": "Gray", "heather gray": "Gray", "heather grey": "Gray",
    "light gray": "Gray", "charcoal": "Gray", "graphite": "Gray", "silver": "Gray",
    "white": "White", "cream": "White", "ivory": "White", "off-white": "White",
    "blue": "Blue", "light blue": "Blue", "royal blue": "Blue", "sky blue": "Blue",
    "gold": "Gold", "yellow": "Gold", "mustard": "Gold",
    "red": "Red", "maroon": "Red", "burgundy": "Red", "crimson": "Red",
    "black": "Black", "green": "Green", "forest green": "Green",
}

PRICE_BANDS = [
    {"id": "under-50", "label": "Under $50", "min": 0.0, "max": 49.99},
    {"id": "50-70", "label": "$50 to $70", "min": 50.0, "max": 70.0},
    {"id": "70-90", "label": "$70 to $90", "min": 70.01, "max": 90.0},
    {"id": "over-90", "label": "$90 and up", "min": 90.01, "max": 100000.0},
]


def color_families(colors: list[str]) -> list[str]:
    """Map a product's raw colour strings onto the filterable families."""
    found = []
    for raw in colors:
        family = _COLOR_MAP.get(raw.strip().lower())
        if family and family not in found:
            found.append(family)
    return found


def categorize(garment_type: str) -> str:
    g = (garment_type or "").lower()
    if "hood" in g:
        return "Hoodies"
    if "quarter-zip" in g or "1/4" in g:
        return "Quarter-zips"
    if "jacket" in g:
        return "Jackets"
    if "crewneck" in g or "mockneck" in g:
        return "Crewnecks"
    if "long-sleeve" in g:
        return "Long sleeve"
    if "t-shirt" in g or "tee" in g:
        return "T-shirts"
    return "Other"


@contextmanager
def session() -> Iterator[sqlite3.Connection]:
    """A connection scoped to one piece of work.

    A single shared connection is not safe here. FastAPI runs sync endpoints in
    a threadpool, and Pydantic AI can fire several tool calls at once, so two
    queries end up on one connection and SQLite raises
    `InterfaceError: bad parameter or other API misuse`. Opening a connection
    per request (and per tool call) removes the sharing entirely. Opening one on
    an existing file costs microseconds, which is nothing next to a model call.
    """
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def connect() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"Database not found at {DB_PATH}. Unzip data.zip into the project root."
        )
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [str(v) for v in value] if isinstance(value, list) else []


def _image_url(image_file_path: str) -> str:
    # The database stores "products/foo.jpg"; the API serves that directory at
    # /images, so the front end never has to know about the file layout.
    return "/images/" + image_file_path.split("/")[-1]


def row_to_product(row: sqlite3.Row) -> dict[str, Any]:
    product = {
        "product_id": row["product_id"],
        "name": row["name"],
        "garment_type": row["garment_type"],
        "category": categorize(row["garment_type"]),
        "description": row["description"],
        "colors": _json_list(row["colors"]),
        "search_tags": _json_list(row["search_tags"]),
        "image_file_path": row["image_file_path"],
        "image_url": _image_url(row["image_file_path"]),
        "price": float(row["price"]),
    }
    product["collection"] = collection_of(product)
    product["color_families"] = color_families(product["colors"])
    return product


def list_products(
    conn: sqlite3.Connection,
    category: str | None = None,
    query: str | None = None,
    limit: int | None = None,
    collection: str | None = None,
    color: str | None = None,
    size: str | None = None,
    price_band: str | None = None,
    in_stock_only: bool = False,
) -> list[dict[str, Any]]:
    """The catalogue, narrowed by any combination of the filter facets.

    `size` means *available in that size*, not *made in that size*. Every
    product is made in all six, so the useful question is always about stock.
    """
    rows = conn.execute("SELECT * FROM catalogue ORDER BY name").fetchall()
    products = [row_to_product(r) for r in rows]

    if category and category.lower() != "all":
        wanted = category.lower()
        products = [p for p in products if p["category"].lower() == wanted]

    if collection and collection.lower() != "all":
        wanted = collection.lower()
        products = [p for p in products if p["collection"].lower() == wanted]

    if color and color.lower() != "all":
        wanted = color.lower()
        products = [p for p in products if any(f.lower() == wanted for f in p["color_families"])]

    if price_band and price_band.lower() != "all":
        band = next((b for b in PRICE_BANDS if b["id"] == price_band), None)
        if band:
            products = [p for p in products if band["min"] <= p["price"] <= band["max"]]

    if query:
        products = search(products, query)

    # Stock totals let the grid grey out anything that is sold out everywhere.
    totals = dict(
        conn.execute(
            "SELECT product_id, SUM(quantity) FROM inventory GROUP BY product_id"
        ).fetchall()
    )
    for p in products:
        p["total_stock"] = int(totals.get(p["product_id"], 0))

    if size and size.upper() != "ALL":
        available = {
            row[0]
            for row in conn.execute(
                "SELECT product_id FROM inventory WHERE upper(size) = ? AND quantity > 0",
                (size.upper(),),
            ).fetchall()
        }
        products = [p for p in products if p["product_id"] in available]

    if in_stock_only:
        products = [p for p in products if p["total_stock"] > 0]

    return products[:limit] if limit else products


def related_products(
    conn: sqlite3.Connection, product_id: str, limit: int = 4
) -> list[dict[str, Any]]:
    """Other products worth showing beside this one.

    Ranked by how much they have in common - same collection counts for most,
    then garment type, then a shared colour - with anything sold out pushed to
    the back. The shopper most in need of this row is the one whose size just
    came up empty, so an alternative they also cannot buy is no use.
    """
    target = get_product(conn, product_id)
    if target is None:
        return []

    candidates = [p for p in list_products(conn) if p["product_id"] != product_id]
    target_colors = set(target["color_families"])

    def score(p: dict[str, Any]) -> tuple[int, int, float]:
        points = 0
        if p["collection"] == target["collection"]:
            points += 4
        if p["category"] == target["category"]:
            points += 3
        if target_colors & set(p["color_families"]):
            points += 1
        # Sort key: in stock first, then best match, then closest price.
        return (1 if p["total_stock"] > 0 else 0, points, -abs(p["price"] - target["price"]))

    return sorted(candidates, key=score, reverse=True)[:limit]


# Words that carry no signal in a shop search. Without this, "do you have a navy
# hoodie" scores every product that happens to contain "a".
STOPWORDS = {
    "a", "an", "and", "any", "anything", "are", "available", "do", "does", "for", "got",
    "have", "how", "i", "im", "in", "is", "it", "like", "looking", "me", "much", "my",
    "need", "of", "on", "or", "please", "show", "some", "something", "sell", "that",
    "the", "there", "this", "to", "want", "what", "whats", "which", "with", "you",
    "your", "hows", "wheres", "theres", "its", "get", "find", "carry", "stock",
    # price talk belongs in max_price, not in the text match
    "about", "around", "below", "budget", "bucks", "cheaper", "cheapest", "dollar",
    "dollars", "less", "over", "price", "than", "under",
}

# Shoppers write "1/4 zip" and "half zip"; the catalogue says "quarter-zip".
PHRASE_SYNONYMS = [
    (r"\b1\s*/\s*4\b", "quarter"),
    (r"\b1\s*/\s*2\b", "half"),
    (r"\bquarter\s*zip\b", "quarter zip"),
    (r"\btee\b", "t shirt"),
    (r"\bsweat\s*shirt\b", "sweatshirt"),
]


def _tokens(text: str) -> set[str]:
    """Split on anything that is not a letter or digit.

    This is what makes "1/4-zip", "1 4 zip" and "quarter zip" land in the same
    place. Matching raw substrings instead means a shopper's punctuation decides
    whether we admit to stocking something.
    """
    lowered = text.lower()
    for pattern, replacement in PHRASE_SYNONYMS:
        lowered = re.sub(pattern, replacement, lowered)
    tokens = re.split(r"[^a-z0-9]+", lowered)
    # Single letters are noise from contractions ("what's" -> "what", "s"), with
    # one exception: the "t" in "t shirt" is load-bearing.
    return {
        t
        for t in tokens
        if t and t not in STOPWORDS and (len(t) > 1 or t == "t" or t.isdigit())
    }


def _product_tokens(product: dict[str, Any]) -> set[str]:
    return _tokens(
        " ".join(
            [
                product["name"],
                product["description"],
                product["garment_type"],
                product["category"],
                " ".join(product["colors"]),
                " ".join(product["search_tags"]),
            ]
        )
    )


def score_match(product: dict[str, Any], query_tokens: set[str]) -> int:
    """How many of the shopper's words this product accounts for."""
    return len(query_tokens & _product_tokens(product))


def search(products: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    """Rank products against a shopper's phrase.

    Strict AND is too brittle - one stray word and a product we stock reports as
    one we do not, which is a confident wrong answer rather than a miss. Instead
    every product is scored by how many query words it accounts for, and only
    the best scorers survive. When everything matches, that is identical to AND;
    when nothing matches everything, it degrades to the closest thing we have
    rather than to nothing.
    """
    wanted = _tokens(query)
    if not wanted:
        return products

    scored = [(score_match(p, wanted), p) for p in products]
    best = max((s for s, _ in scored), default=0)

    # A short query has to match in full. "baseball cap" matching on "baseball"
    # alone would surface baseball shirts to someone asking for a hat, and a
    # near-miss presented as a result is worse than an honest no. Longer,
    # chattier queries get two words of slack, because by then the extra words
    # are usually description rather than requirement.
    minimum = len(wanted) if len(wanted) <= 2 else 2
    if best < minimum:
        return []

    return [p for s, p in scored if s == best]


def get_product(conn: sqlite3.Connection, product_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        "SELECT * FROM catalogue WHERE product_id = ?", (product_id,)
    ).fetchone()
    if row is None:
        return None

    product = row_to_product(row)
    product["sizes"] = get_sizes(conn, product_id)
    product["total_stock"] = sum(s["quantity"] for s in product["sizes"])
    return product


def get_sizes(conn: sqlite3.Connection, product_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT size, quantity FROM inventory WHERE product_id = ?", (product_id,)
    ).fetchall()
    by_size = {r["size"]: int(r["quantity"]) for r in rows}
    ordered = [s for s in SIZE_ORDER if s in by_size]
    ordered += sorted(s for s in by_size if s not in SIZE_ORDER)
    return [{"size": s, "quantity": by_size[s]} for s in ordered]



# ---------------------------------------------------------------------------
# recently viewed
# ---------------------------------------------------------------------------

MAX_TRACKED_VIEWS = 12


def ensure_view_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS product_views (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               user_id INTEGER NOT NULL,
               product_id TEXT NOT NULL,
               viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
               FOREIGN KEY (user_id) REFERENCES users(id),
               FOREIGN KEY (product_id) REFERENCES catalogue(product_id)
           )"""
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_views_user ON product_views (user_id, viewed_at DESC)"
    )
    conn.commit()


def record_view(conn: sqlite3.Connection, user_id: int, product_id: str) -> bool:
    """Note that a signed-in shopper looked at a product.

    Guests are never recorded. We have no account to attach their browsing to,
    so a server-side profile of an anonymous visitor would be data we have no
    use for and no business keeping - their views stay in their own browser.
    """
    if conn.execute(
        "SELECT 1 FROM catalogue WHERE product_id = ?", (product_id,)
    ).fetchone() is None:
        return False

    # Re-opening the same product should move it to the front, not stack up.
    conn.execute(
        "DELETE FROM product_views WHERE user_id = ? AND product_id = ?", (user_id, product_id)
    )
    conn.execute(
        "INSERT INTO product_views (user_id, product_id) VALUES (?, ?)", (user_id, product_id)
    )
    conn.execute(
        """DELETE FROM product_views WHERE user_id = ? AND id NOT IN (
               SELECT id FROM product_views WHERE user_id = ?
               ORDER BY viewed_at DESC, id DESC LIMIT ?
           )""",
        (user_id, user_id, MAX_TRACKED_VIEWS),
    )
    conn.commit()
    return True


def recent_view_ids(conn: sqlite3.Connection, user_id: int, limit: int = 6) -> list[str]:
    rows = conn.execute(
        """SELECT product_id FROM product_views WHERE user_id = ?
           ORDER BY viewed_at DESC, id DESC LIMIT ?""",
        (user_id, limit),
    ).fetchall()
    return [r[0] for r in rows]



# ---------------------------------------------------------------------------
# privacy preferences
# ---------------------------------------------------------------------------

DEFAULT_PREFERENCES = {"track_views": True, "store_chat": True}


def ensure_preference_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS user_preferences (
               user_id INTEGER PRIMARY KEY,
               track_views INTEGER NOT NULL DEFAULT 1,
               store_chat INTEGER NOT NULL DEFAULT 1,
               updated_at TEXT NOT NULL DEFAULT (datetime('now')),
               FOREIGN KEY (user_id) REFERENCES users(id)
           )"""
    )
    conn.commit()


def get_preferences(conn: sqlite3.Connection, user_id: int) -> dict[str, bool]:
    row = conn.execute(
        "SELECT track_views, store_chat FROM user_preferences WHERE user_id = ?", (user_id,)
    ).fetchone()
    if row is None:
        return dict(DEFAULT_PREFERENCES)
    return {"track_views": bool(row["track_views"]), "store_chat": bool(row["store_chat"])}


def set_preferences(
    conn: sqlite3.Connection,
    user_id: int,
    track_views: bool | None = None,
    store_chat: bool | None = None,
) -> dict[str, bool]:
    """Save a shopper's choices, and act on them immediately.

    Switching something off does not just stop future collection - it deletes
    what we already hold. An opt-out that leaves the old rows sitting there is
    not an opt-out, it is a promise about the future.
    """
    current = get_preferences(conn, user_id)
    nxt = {
        "track_views": current["track_views"] if track_views is None else bool(track_views),
        "store_chat": current["store_chat"] if store_chat is None else bool(store_chat),
    }

    conn.execute(
        """INSERT INTO user_preferences (user_id, track_views, store_chat, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(user_id) DO UPDATE SET
             track_views = excluded.track_views,
             store_chat  = excluded.store_chat,
             updated_at  = excluded.updated_at""",
        (user_id, int(nxt["track_views"]), int(nxt["store_chat"])),
    )

    if not nxt["track_views"]:
        conn.execute("DELETE FROM product_views WHERE user_id = ?", (user_id,))
    if not nxt["store_chat"]:
        conn.execute("DELETE FROM chat_messages WHERE user_id = ?", (user_id,))

    conn.commit()
    return nxt


def forget_everything(conn: sqlite3.Connection, user_id: int) -> dict[str, int]:
    """Delete everything we hold about this shopper's activity.

    Their account stays - they asked us to forget what they did, not who they
    are. Deleting the account is a different request with different consequences.
    """
    views = conn.execute(
        "SELECT COUNT(*) FROM product_views WHERE user_id = ?", (user_id,)
    ).fetchone()[0]
    messages = conn.execute(
        "SELECT COUNT(*) FROM chat_messages WHERE user_id = ?", (user_id,)
    ).fetchone()[0]

    conn.execute("DELETE FROM product_views WHERE user_id = ?", (user_id,))
    conn.execute("DELETE FROM chat_messages WHERE user_id = ?", (user_id,))
    conn.commit()
    return {"views_deleted": int(views), "messages_deleted": int(messages)}
