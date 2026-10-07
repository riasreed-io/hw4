"""Campus Customs API -- the file you run with uvicorn.

    cd backend
    uvicorn main:app --reload --port 8000

Three jobs: serve the product catalogue and images, handle accounts, and put the
PydanticAI shop assistant behind a chat route. The agent itself is next door --
`agent.py` wires it up, `tools.py` does the catalogue lookups, `models.py` holds
the types, and `prompts/prompt.md` holds its instructions.
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic_ai.exceptions import ModelHTTPError

import agent as shop_agent
import auth
import db
import tools
from models import (
    ChatRequest,
    ChatResponse,
    ChatTurn,
    CustomerContext,
    OpenerRequest,
    OpenerResponse,
)

# The Vite dev server runs on 5180; 5173 was taken by another project in this
# workspace. Credentials are allowed because the session rides in a cookie, so
# the origin list has to stay exact -- no wildcard.
ALLOWED_ORIGINS = [
    "http://localhost:5180",
    "http://127.0.0.1:5180",
    "http://localhost:5173",
]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # One connection at startup, only to create the sessions table. Request
    # handling uses a fresh connection each time -- see db.session().
    with db.session() as conn:
        auth.ensure_schema(conn)
        db.ensure_view_schema(conn)
        db.ensure_preference_schema(conn)
    yield


app = FastAPI(title="Campus Customs API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Product photos live next to the database, outside the repo. Serving them here
# means the front end only ever deals in URLs.
app.mount("/images", StaticFiles(directory=db.IMAGES_DIR), name="images")


def get_conn():
    """A FastAPI dependency giving each request its own SQLite connection."""
    with db.session() as conn:
        yield conn


@app.get("/api/health")
def health(conn=Depends(get_conn)):
    total = conn.execute("SELECT COUNT(*) FROM catalogue").fetchone()[0]
    # model_label() reads the env to report which model is configured. It never
    # touches the key itself.
    return {"status": "ok", "products": total, "agent_model": tools.model_label()}


@app.get("/api/categories")
def categories(conn=Depends(get_conn)):
    products = db.list_products(conn)
    counts: dict[str, int] = {}
    for p in products:
        counts[p["category"]] = counts.get(p["category"], 0) + 1
    return [
        {"name": name, "count": counts[name]}
        for name in db.CATEGORIES
        if counts.get(name)
    ]


@app.get("/api/facets")
def facets(conn=Depends(get_conn)):
    """Every filter value with a live count, so no chip promises an empty grid."""
    products = db.list_products(conn)

    def tally(key: str, order: list[str]) -> list[dict]:
        counts: dict[str, int] = {}
        for p in products:
            counts[p[key]] = counts.get(p[key], 0) + 1
        return [{"name": n, "count": counts[n]} for n in order if counts.get(n)]

    colors: dict[str, int] = {}
    for p in products:
        for family in p["color_families"]:
            colors[family] = colors.get(family, 0) + 1

    size_counts = dict(
        conn.execute(
            "SELECT size, COUNT(*) FROM inventory WHERE quantity > 0 GROUP BY size"
        ).fetchall()
    )

    price_counts = {b["id"]: 0 for b in db.PRICE_BANDS}
    for p in products:
        for b in db.PRICE_BANDS:
            if b["min"] <= p["price"] <= b["max"]:
                price_counts[b["id"]] += 1

    return {
        "categories": tally("category", db.CATEGORIES),
        "collections": tally("collection", db.COLLECTIONS),
        "colors": [
            {"name": n, "count": colors[n]} for n in db.COLOR_FAMILIES if colors.get(n)
        ],
        "sizes": [
            {"name": s, "count": int(size_counts.get(s, 0))}
            for s in db.SIZE_ORDER
            if size_counts.get(s)
        ],
        "price_bands": [
            {"id": b["id"], "name": b["label"], "count": price_counts[b["id"]]}
            for b in db.PRICE_BANDS
            if price_counts[b["id"]]
        ],
        "total": len(products),
    }


@app.get("/api/products")
def products(
    category: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=200),
    collection: str | None = Query(default=None),
    color: str | None = Query(default=None),
    size: str | None = Query(default=None),
    price_band: str | None = Query(default=None),
    in_stock: bool = Query(default=False),
    conn=Depends(get_conn),
):
    items = db.list_products(
        conn,
        category=category,
        query=q,
        limit=limit,
        collection=collection,
        color=color,
        size=size,
        price_band=price_band,
        in_stock_only=in_stock,
    )
    return {"count": len(items), "products": items}


@app.get("/api/products/{product_id}/related")
def related(product_id: str, conn=Depends(get_conn)):
    """Other products worth showing beside this one - in stock first."""
    return {"products": db.related_products(conn, product_id)}


@app.get("/api/products/{product_id}")
def product_detail(product_id: str, conn=Depends(get_conn)):
    product = db.get_product(conn, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


# --------------------------------------------------------------------------
# accounts
# --------------------------------------------------------------------------

SESSION_COOKIE = "cc_session"


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=auth.SESSION_DAYS * 24 * 60 * 60,
        httponly=True,  # JavaScript cannot read it, so an XSS bug cannot steal it
        samesite="lax",
        secure=False,  # the dev server is plain http; flip to True behind TLS
        path="/",
    )


def current_user(request: Request, conn=Depends(get_conn)):
    return auth.session_user(conn, request.cookies.get(SESSION_COOKIE))


@app.post("/api/auth/signup", status_code=201)
async def signup(request: Request, response: Response, conn=Depends(get_conn)):
    payload = await request.json()
    try:
        data = auth.clean_signup(payload)
        user = auth.create_user(conn, data)
    except auth.AuthError as e:
        raise HTTPException(status_code=e.status, detail={"message": e.message, "field": e.field})

    _set_session_cookie(response, auth.start_session(conn, user["id"]))
    return {"user": auth.public_user(user)}


@app.post("/api/auth/login")
async def login(request: Request, response: Response, conn=Depends(get_conn)):
    payload = await request.json()
    email = str(payload.get("email") or "")
    password = str(payload.get("password") or "")

    try:
        user = auth.authenticate(conn, email, password)
    except auth.AuthError as e:
        raise HTTPException(status_code=e.status, detail={"message": e.message, "field": e.field})

    _set_session_cookie(response, auth.start_session(conn, user["id"]))
    return {"user": auth.public_user(user)}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, conn=Depends(get_conn)):
    auth.end_session(conn, request.cookies.get(SESSION_COOKIE))
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return {"user": auth.public_user(user) if user else None}


# --------------------------------------------------------------------------
# chat
# --------------------------------------------------------------------------

# A signed-in shopper's history comes out of chat_messages. A logged-out one has
# nowhere to persist it, so the browser sends back what it is holding.
HISTORY_TURNS = 20


@app.get("/api/chat/history")
def chat_history(user=Depends(current_user), conn=Depends(get_conn)):
    """Replay a signed-in shopper's conversation, product cards and all."""
    if user is None or not db.get_preferences(conn, user["id"])["store_chat"]:
        return {"messages": []}

    rows = conn.execute(
        """SELECT role, content, products_json FROM chat_messages
           WHERE user_id = ? ORDER BY id DESC LIMIT ?""",
        (user["id"], HISTORY_TURNS),
    ).fetchall()

    messages = []
    for row in reversed(rows):
        products = []
        if row["products_json"]:
            try:
                saved = json.loads(row["products_json"])
                # Re-resolve against the database rather than trusting the
                # snapshot: a price or stock count may have moved since.
                products = tools.cards_for(conn, [p.get("product_id", "") for p in saved])
            except (ValueError, AttributeError, TypeError):
                products = []
        messages.append({"role": row["role"], "content": row["content"], "products": products})

    return {"messages": messages}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest, user=Depends(current_user), conn=Depends(get_conn)):
    """One turn of conversation with the shop assistant."""
    connection = conn

    prefs = (
        db.get_preferences(connection, user["id"]) if user is not None else dict(db.DEFAULT_PREFERENCES)
    )

    if user is not None:
        history = (
            [ChatTurn(**t) for t in tools.load_history(connection, user["id"], HISTORY_TURNS)]
            if prefs["store_chat"]
            else []
        )
        recent_ids = db.recent_view_ids(connection, user["id"]) if prefs["track_views"] else []
        # Exactly four fields reach the agent. Everything else on the row -
        # most importantly password_hash - stays in the database.
        customer = CustomerContext(
            signed_in=True,
            first_name=user["first_name"],
            full_name=user["name"],
            email=user["email"],
            remembers_browsing=prefs["track_views"],
            remembers_chat=prefs["store_chat"],
        )
    else:
        # A guest has nowhere to persist history, so the browser sends its own.
        history = payload.history[-HISTORY_TURNS:]
        customer = CustomerContext(signed_in=False)
        recent_ids = payload.guest_recent_ids[:db.MAX_TRACKED_VIEWS]

    try:
        # The agent's tools open their own connections; this one is only for the
        # history read and write around the run.
        answer, allowed_ids = await shop_agent.answer(
            payload.message,
            history=history,
            customer=customer,
            page=payload.page,
            recent_ids=recent_ids,
        )
    except tools.ConfigError as e:
        # Our own message about our own setup, so it is safe to pass along.
        raise HTTPException(status_code=503, detail={"message": str(e), "field": None})
    except ModelHTTPError as e:
        # Upstream refused. The raw text names the gateway, the model and the
        # policy that fired, none of which belongs in a shopper's browser, so it
        # goes to the log and they get a plain sentence.
        logging.warning("model call rejected: %s", e)
        filtered = "content_filter" in str(e) or "content management policy" in str(e)
        raise HTTPException(
            status_code=502,
            detail={
                "message": (
                    "I can't help with that one. Ask me about Campus Customs gear and "
                    "I'll look it up."
                    if filtered
                    else "The assistant is having trouble reaching its model. Try again in a moment."
                ),
                "field": None,
            },
        )
    except Exception:
        logging.exception("agent run failed")
        raise HTTPException(
            status_code=502,
            detail={"message": "The assistant is having trouble right now. Try again.", "field": None},
        )

    # The model chose ids; the database supplies every fact on the card.
    cards = tools.cards_for(connection, allowed_ids)

    persisted = False
    if user is not None and prefs["store_chat"]:
        tools.save_turn(connection, user["id"], "user", payload.message)
        tools.save_turn(connection, user["id"], "assistant", answer.reply, cards)
        persisted = True

    return ChatResponse(
        reply=answer.reply,
        products=cards,
        match_label=answer.showcase_label.strip() if cards else "",
        persisted=persisted,
    )


# --------------------------------------------------------------------------
# recently viewed
# --------------------------------------------------------------------------


@app.post("/api/views/{product_id}", status_code=202)
def record_view(product_id: str, user=Depends(current_user), conn=Depends(get_conn)):
    """Record that a signed-in shopper opened a product page.

    Guests get a 202 and nothing written. Their browser keeps its own list.
    """
    if user is None:
        return {"recorded": False, "reason": "guest"}
    if not db.get_preferences(conn, user["id"])["track_views"]:
        return {"recorded": False, "reason": "opted_out"}
    return {"recorded": db.record_view(conn, user["id"], product_id)}


@app.get("/api/views/recent")
def recent_views(user=Depends(current_user), conn=Depends(get_conn)):
    if user is None:
        return {"products": []}
    if not db.get_preferences(conn, user["id"])["track_views"]:
        return {"products": []}
    ids = db.recent_view_ids(conn, user["id"])
    return {"products": tools.cards_for(conn, ids)}


# --------------------------------------------------------------------------
# privacy preferences
# --------------------------------------------------------------------------


@app.get("/api/preferences")
def read_preferences(user=Depends(current_user), conn=Depends(get_conn)):
    if user is None:
        # A guest has no server-side record to govern; their browser holds the
        # switch and the data both.
        return {"signed_in": False, **db.DEFAULT_PREFERENCES}
    return {"signed_in": True, **db.get_preferences(conn, user["id"])}


@app.put("/api/preferences")
async def write_preferences(request: Request, user=Depends(current_user), conn=Depends(get_conn)):
    if user is None:
        raise HTTPException(
            status_code=401,
            detail={"message": "Sign in to change what we remember about you.", "field": None},
        )
    payload = await request.json()
    saved = db.set_preferences(
        conn,
        user["id"],
        track_views=payload.get("track_views"),
        store_chat=payload.get("store_chat"),
    )
    return {"signed_in": True, **saved}


@app.post("/api/preferences/forget")
def forget_me(user=Depends(current_user), conn=Depends(get_conn)):
    """Delete the browsing and chat history we hold for this shopper."""
    if user is None:
        raise HTTPException(
            status_code=401,
            detail={"message": "Sign in first.", "field": None},
        )
    return db.forget_everything(conn, user["id"])


@app.post("/api/chat/opener", response_model=OpenerResponse)
async def chat_opener(
    payload: OpenerRequest, user=Depends(current_user), conn=Depends(get_conn)
):
    """The line the chat window opens itself with.

    Runs the same agent with the same tools, so the invitation is grounded in
    the catalogue - it cannot offer to check a size on a product we do not sell.
    Any failure returns a plain static greeting rather than an error: a greeting
    nobody asked for must never be the thing that shows an error.
    """
    if user is not None:
        opener_prefs = db.get_preferences(conn, user["id"])
        customer = CustomerContext(
            signed_in=True,
            first_name=user["first_name"],
            full_name=user["name"],
            email=user["email"],
            remembers_browsing=opener_prefs["track_views"],
            remembers_chat=opener_prefs["store_chat"],
        )
        recent_ids = db.recent_view_ids(conn, user["id"]) if opener_prefs["track_views"] else []
    else:
        customer = CustomerContext(signed_in=False)
        recent_ids = payload.guest_recent_ids[: db.MAX_TRACKED_VIEWS]

    try:
        answer, allowed_ids = await shop_agent.opener(
            customer=customer, page=payload.page, recent_ids=recent_ids
        )
    except Exception:
        logging.warning("opener generation failed; falling back to the static greeting")
        return OpenerResponse(
            greeting=(
                "Ask me anything about Campus Customs gear - what we carry, what it "
                "costs, or whether your size is in stock."
            )
        )

    cards = tools.cards_for(conn, allowed_ids)
    return OpenerResponse(
        greeting=answer.reply,
        products=cards,
        match_label=answer.showcase_label.strip() if cards else "",
    )
