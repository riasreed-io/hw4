"""The agent's hands.

Two kinds of thing live here:

1. **Setup** -- finding the API key and building the model object.
2. **Catalogue lookups** -- the functions the agent calls to find out what the
   store actually sells. Every one of them reads SQLite. None of them asks a
   language model anything.

That split is the point. The model decides *what to look up*; these functions
decide *what is true*. A price the shopper sees came from `catalogue.price`, not
from the model's sense of what a hoodie costs.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider

import db
from models import (
    ProductFacts,
    ProductSummary,
    RecentlyViewed,
    SearchResults,
    SizeStock,
    StockAnswer,
    ViewedProduct,
)

HERE = Path(__file__).resolve().parent


class ConfigError(RuntimeError):
    """Something about this server's setup is wrong -- a missing API key, say.

    Kept separate from model and network failures so main.py can show the
    operator's message for this one and a generic message for everything else.
    An upstream error text can carry gateway details that have no business
    reaching a shopper's browser.
    """


PORTKEY_BASE_URL = "https://api.portkey.ai/v1"
PORTKEY_MODEL = "gpt-5.6-luna"
OPENAI_FALLBACK_MODEL = "gpt-4o"

MAX_SEARCH_RESULTS = 6

# "Only a couple left" is a real thing to say at 2 and a lie at 12.
LOW_STOCK_THRESHOLD = 3


def load_environment() -> None:
    """Look for .env beside this file, then the project root, then the course root."""
    for candidate in (HERE / ".env", HERE.parent / ".env", HERE.parent.parent / ".env"):
        if candidate.exists():
            load_dotenv(candidate, override=False)


def build_model() -> OpenAIChatModel:
    """Build the chat model from whichever API key is configured."""
    load_environment()

    portkey_key = (os.getenv("PORTKEY_API_KEY") or "").strip()
    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    override = (os.getenv("OPENAI_MODEL") or os.getenv("MODEL_NAME") or "").strip()

    if portkey_key:
        api_key, base_url = portkey_key, PORTKEY_BASE_URL
        model_name = override or PORTKEY_MODEL
    elif openai_key:
        api_key = openai_key
        base_url = (os.getenv("OPENAI_BASE_URL") or "").strip() or None
        model_name = override or OPENAI_FALLBACK_MODEL
    else:
        raise ConfigError(
            "No API key found. Put PORTKEY_API_KEY (class gateway) or OPENAI_API_KEY in "
            "a .env file in the project root and restart the server."
        )

    return OpenAIChatModel(model_name, provider=OpenAIProvider(api_key=api_key, base_url=base_url))


def model_label() -> str:
    """The model name, for the health endpoint. Never returns the key."""
    load_environment()
    override = (os.getenv("OPENAI_MODEL") or os.getenv("MODEL_NAME") or "").strip()
    if (os.getenv("PORTKEY_API_KEY") or "").strip():
        return f"{override or PORTKEY_MODEL} (via Portkey)"
    if (os.getenv("OPENAI_API_KEY") or "").strip():
        return override or OPENAI_FALLBACK_MODEL
    return "unconfigured"


# ---------------------------------------------------------------------------
# catalogue lookups
# ---------------------------------------------------------------------------


def _summary(product: dict) -> ProductSummary:
    total = product.get("total_stock", 0)
    return ProductSummary(
        product_id=product["product_id"],
        name=product["name"],
        category=product["category"],
        description=product["description"],
        colors=product["colors"],
        price=product["price"],
        total_stock=total,
        in_stock=total > 0,
    )


def _availability_sentence(name: str, available: list[str], sold_out: list[str], low: list[str]) -> str:
    """State the stock position in one sentence the agent can paraphrase safely.

    Written here rather than left to the model because this is the sentence most
    likely to be gotten wrong, and getting it wrong sends someone to Broadway
    for a size that is not there.
    """
    if not available:
        return f"{name} is sold out in every size."

    parts = [f"{name} is available in {', '.join(available)}."]
    if sold_out:
        parts.append(f"Sold out in {', '.join(sold_out)}.")
    if low:
        parts.append(f"Only a few left in {', '.join(low)}.")
    return " ".join(parts)


def search_catalogue(
    conn: sqlite3.Connection,
    query: str,
    category: str | None = None,
    max_price: float | None = None,
    in_stock_only: bool = False,
    size: str | None = None,
) -> SearchResults:
    """Find products matching a shopper's description.

    Searches names, descriptions, colours and the hand-written search tags, so
    "The Game" and "Handsome Dan" land even though no product name contains
    them. Category is normalised first -- the raw `garment_type` column has 22
    spellings of six categories, and matching it literally would return five
    hoodies out of twenty-seven.
    """
    wanted_category = db.categorize(category) if category else None
    if wanted_category == "Other":
        wanted_category = None

    # `size` goes to the inventory filter, never into the text match. A shopper
    # asking for "a hoodie in XXL" put a size in their sentence, and no product
    # description contains the word XXL - folding it into the query returns zero
    # and the agent reports we have none, which was wrong 23 times over.
    products = db.list_products(
        conn, category=wanted_category, query=query or None, size=size
    )

    if max_price is not None:
        products = [p for p in products if p["price"] <= max_price]
    if in_stock_only:
        products = [p for p in products if p.get("total_stock", 0) > 0]

    # Nearest first: cheapest option that fits the brief tends to be the useful
    # one to lead with, and the model can reorder when it has a reason to.
    products.sort(key=lambda p: (-p.get("total_stock", 0) > 0, p["price"]))

    note = ""
    if not products and size:
        note = (
            f"Nothing matching '{query}' is in stock in {size.upper()}. That is a size "
            "answer, not a catalogue answer - do not say we have no such product. Search "
            "again without the size to see what exists, then say which sizes are left."
        )
    elif not products:
        note = (
            f"No products matched '{query}'. Campus Customs only sells apparel "
            "(t-shirts, long sleeves, crewnecks, hoodies, quarter-zips, jackets). "
            "Tell the shopper we do not carry it rather than offering a substitute "
            "as though it were what they asked for."
        )
    elif len(products) > MAX_SEARCH_RESULTS:
        note = f"{len(products)} products matched; showing the first {MAX_SEARCH_RESULTS}."

    return SearchResults(
        query=query,
        count=len(products),
        products=[_summary(p) for p in products[:MAX_SEARCH_RESULTS]],
        note=note,
    )


def product_facts(conn: sqlite3.Connection, product_id: str) -> ProductFacts | None:
    """Everything the store knows about one product: description, price, colours
    and how many are left in every size."""
    product = db.get_product(conn, product_id)
    if product is None:
        return None

    sizes = [
        SizeStock(size=s["size"], quantity=s["quantity"], in_stock=s["quantity"] > 0)
        for s in product["sizes"]
    ]
    available = [s.size for s in sizes if s.quantity > 0]
    sold_out = [s.size for s in sizes if s.quantity == 0]
    low = [s.size for s in sizes if 0 < s.quantity <= LOW_STOCK_THRESHOLD]

    return ProductFacts(
        product_id=product["product_id"],
        name=product["name"],
        category=product["category"],
        garment_type=product["garment_type"],
        description=product["description"],
        colors=product["colors"],
        price=product["price"],
        sizes=sizes,
        total_stock=product["total_stock"],
        available_sizes=available,
        sold_out_sizes=sold_out,
        low_stock_sizes=low,
        availability=_availability_sentence(product["name"], available, sold_out, low),
        # An empty colours list means the catalogue does not record them, which
        # is not the same as the product being colourless.
        colors_known=bool(product["colors"]),
    )


def stock_for_size(conn: sqlite3.Connection, product_id: str, size: str) -> StockAnswer | None:
    """How many of one product are left in one size."""
    product = db.get_product(conn, product_id)
    if product is None:
        return None

    wanted = size.strip().upper()
    match = next((s for s in product["sizes"] if s["size"].upper() == wanted), None)
    quantity = match["quantity"] if match else 0
    others = [s["size"] for s in product["sizes"] if s["quantity"] > 0]
    name = product["name"]

    if match is None:
        # "We do not stock that size" and "that size is sold out" are different
        # answers, and a shopper deserves the right one.
        sentence = (
            f"{name} does not come in {wanted}. It comes in "
            f"{', '.join(s['size'] for s in product['sizes'])}."
        )
    elif quantity == 0:
        sentence = (
            f"{name} is sold out in {match['size']}."
            + (f" Still available in {', '.join(others)}." if others else " It is sold out in every size.")
        )
    elif quantity <= LOW_STOCK_THRESHOLD:
        sentence = f"Only {quantity} left of {name} in {match['size']}."
    else:
        sentence = f"{name} is in stock in {match['size']} - {quantity} available."

    return StockAnswer(
        product_id=product["product_id"],
        name=name,
        size=match["size"] if match else wanted,
        quantity=quantity,
        in_stock=quantity > 0,
        other_sizes_available=others,
        valid_size=match is not None,
        availability=sentence,
    )


def cards_for(conn: sqlite3.Connection, product_ids: list[str]) -> list[dict]:
    """Turn the ids the model chose into real product cards.

    Ids the model made up simply do not resolve, so an invented product cannot
    reach the page. Order is preserved, duplicates dropped.
    """
    seen: set[str] = set()
    cards: list[dict] = []
    for pid in product_ids:
        if pid in seen:
            continue
        seen.add(pid)
        product = db.get_product(conn, pid)
        if product is None:
            continue
        cards.append(
            {
                "product_id": product["product_id"],
                "name": product["name"],
                "category": product["category"],
                "description": product["description"],
                "colors": product["colors"],
                "price": product["price"],
                "image_url": product["image_url"],
                "total_stock": product["total_stock"],
            }
        )
    return cards


def viewed_products(conn: sqlite3.Connection, product_ids: list[str]) -> RecentlyViewed:
    """Turn a list of viewed ids into products, newest first.

    Ids are resolved against the catalogue rather than trusted, so a stale or
    forged id simply drops out instead of reaching the shopper.
    """
    items: list[ViewedProduct] = []
    for pid in product_ids:
        product = db.get_product(conn, pid)
        if product is None:
            continue
        items.append(
            ViewedProduct(
                product_id=product["product_id"],
                name=product["name"],
                price=product["price"],
                category=product["category"],
            )
        )

    note = (
        ""
        if items
        else "This shopper has not opened any product pages yet, so do not refer to anything they looked at."
    )
    return RecentlyViewed(count=len(items), products=items, note=note)


# ---------------------------------------------------------------------------
# conversation history
# ---------------------------------------------------------------------------


def load_history(conn: sqlite3.Connection, user_id: int, limit: int = 20) -> list[dict]:
    """The last few turns for a signed-in shopper, oldest first."""
    rows = conn.execute(
        """SELECT role, content FROM chat_messages
           WHERE user_id = ? ORDER BY id DESC LIMIT ?""",
        (user_id, limit),
    ).fetchall()
    return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]


def save_turn(
    conn: sqlite3.Connection,
    user_id: int,
    role: str,
    content: str,
    products: list[dict] | None = None,
) -> None:
    """Append one message. Assistant rows carry the cards that went with them so
    a reload re-renders the same conversation, matching the seeded rows."""
    conn.execute(
        "INSERT INTO chat_messages (user_id, role, content, products_json) VALUES (?, ?, ?, ?)",
        (user_id, role, content, json.dumps(products) if products else None),
    )
    conn.commit()
