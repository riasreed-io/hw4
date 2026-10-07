"""Typed objects that cross a boundary.

Three boundaries, really: the browser talking to FastAPI, FastAPI talking to the
agent, and the agent talking to its tools. Anything that crosses one of those
gets a model here so the shape is checked once instead of guessed at three
times.

The important one is `AgentAnswer`. The model is allowed to choose *which*
products to show, by id. It is never allowed to supply their price, colors or
stock -- those are looked up from the database afterwards. A hallucinated id
resolves to nothing; a hallucinated price would reach the shopper.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["user", "assistant"]


# ---------------------------------------------------------------------------
# what the agent returns
# ---------------------------------------------------------------------------


class AgentAnswer(BaseModel):
    """The agent's structured reply.

    `product_ids` is the half of this that drives the website: the ids chosen
    here become product cards on the page itself, not just inside the chat
    bubble. The agent picks which products; it never supplies their facts.
    """

    reply: str = Field(description="What to say to the shopper, in the Campus Customs voice.")
    product_ids: list[str] = Field(
        default_factory=list,
        description=(
            "product_id values for products to show as cards, in the order they should "
            "appear. These are rendered on the page as a browsable row, so include them "
            "whenever the shopper is looking at or choosing between products. Only ids "
            "that came back from a tool call in this conversation. Empty when the answer "
            "is not about specific products. At most six."
        ),
    )
    showcase_label: str = Field(
        default="",
        max_length=60,
        description=(
            "A short heading for the row of cards on the page, in the shopper's terms - "
            "'Hoodies', 'Navy crewnecks under $60', 'Berkeley 1/4 Zip'. Sentence case, no "
            "trailing punctuation. Empty when there are no products."
        ),
    )


# ---------------------------------------------------------------------------
# what the tools return
# ---------------------------------------------------------------------------


class ProductSummary(BaseModel):
    """One product as the agent sees it in a list of search results.

    Deliberately lighter than ProductFacts: a search returns up to six of these,
    and per-size stock for six products is a lot of tokens spent on sizes nobody
    asked about. This carries enough to describe and price the product and to
    know whether it is worth mentioning at all; `get_product` fills in the rest.
    """

    product_id: str
    name: str
    category: str
    description: str
    colors: list[str]
    price: float
    total_stock: int
    in_stock: bool = Field(
        description="False when every size is sold out. Stated outright so a zero is never misread."
    )


class SizeStock(BaseModel):
    size: str
    quantity: int
    in_stock: bool = Field(
        default=True,
        description="False when quantity is 0. The claim and the number travel together.",
    )


class ProductFacts(BaseModel):
    """Everything the store knows about one product, including per-size stock.

    The derived fields at the bottom are not redundant. Reading six quantities
    and working out which are zero is arithmetic, and arithmetic is where a
    language model slips. Doing it in Python means the agent reads the answer
    instead of computing it.
    """

    product_id: str
    name: str
    category: str
    garment_type: str
    description: str
    colors: list[str]
    price: float
    sizes: list[SizeStock]
    total_stock: int

    available_sizes: list[str] = Field(
        default_factory=list, description="Sizes with at least one left, in size order."
    )
    sold_out_sizes: list[str] = Field(
        default_factory=list, description="Sizes at zero. Say these are sold out, plainly."
    )
    low_stock_sizes: list[str] = Field(
        default_factory=list,
        description="Sizes with 1-3 left. Worth mentioning; never invent urgency beyond this.",
    )
    availability: str = Field(
        default="",
        description="The stock situation in one plain sentence, safe to paraphrase to the shopper.",
    )
    colors_known: bool = Field(
        default=True,
        description=(
            "False when the catalogue lists no colours. False means unknown, NOT "
            "'available in every colour' - say you do not have that detail."
        ),
    )


class SearchResults(BaseModel):
    """Search results plus an honest note when there were none."""

    query: str
    count: int
    products: list[ProductSummary]
    note: str = ""


class StockAnswer(BaseModel):
    """The answer to 'do you have this in a medium'."""

    product_id: str
    name: str
    size: str
    quantity: int
    in_stock: bool
    other_sizes_available: list[str]
    valid_size: bool = Field(
        default=True,
        description="False when that size is not one we stock at all, as opposed to sold out.",
    )
    availability: str = Field(
        default="",
        description="The answer in one plain sentence, already phrased honestly.",
    )


# ---------------------------------------------------------------------------
# what the browser sends and receives
# ---------------------------------------------------------------------------


class ChatTurn(BaseModel):
    role: Role
    content: str


class PageContext(BaseModel):
    """Where the shopper is on the site when they send a message.

    This is what lets "do you have this in pink?" work. Without it the agent has
    a pronoun and no referent, and the honest answer would be "which one?" every
    time someone asks about the page they are already looking at.
    """

    path: str = Field(default="", max_length=300)
    product_id: str | None = Field(default=None, max_length=120)
    category: str | None = Field(default=None, max_length=60)
    search_query: str | None = Field(default=None, max_length=200)


class CustomerContext(BaseModel):
    """What the agent is told about who it is talking to.

    Four fields, chosen because they are what a shop assistant would know from a
    name badge and nothing more. `password_hash` is not here and never will be -
    it is excluded at the database layer too (`auth.PUBLIC_USER_FIELDS`), so a
    leak would take two separate mistakes.
    """

    signed_in: bool
    first_name: str | None = None
    full_name: str | None = None
    email: str | None = None
    # Whether this shopper has left memory switched on. The agent needs to know
    # the difference between "you have not looked at anything" and "you asked me
    # not to keep that", because those are different sentences to a shopper.
    remembers_browsing: bool = True
    remembers_chat: bool = True


class ViewedProduct(BaseModel):
    """One product the shopper has looked at, as the agent sees it."""

    product_id: str
    name: str
    price: float
    category: str


class RecentlyViewed(BaseModel):
    count: int
    products: list[ViewedProduct]
    note: str = ""


class OpenerRequest(BaseModel):
    """Context for the unprompted greeting the chat opens with."""

    page: PageContext | None = None
    # A guest's browsing stays in their browser, so it has to be sent up.
    guest_recent_ids: list[str] = Field(default_factory=list, max_length=12)


class OpenerResponse(BaseModel):
    greeting: str
    products: list[ProductCard] = Field(default_factory=list)
    match_label: str = ""


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    # Signed-in shoppers get their history from the database. A logged-out
    # shopper has nowhere to persist it, so the browser sends back what it has.
    history: list[ChatTurn] = Field(default_factory=list, max_length=20)
    page: PageContext | None = None
    # A guest's browsing lives in their browser, so it rides along with the
    # message. A signed-in shopper's comes from product_views and this is ignored.
    guest_recent_ids: list[str] = Field(default_factory=list, max_length=12)


class ProductCard(BaseModel):
    """A product card for the chat panel. Built from the database, never from
    the model's own words."""

    product_id: str
    name: str
    category: str
    description: str
    colors: list[str]
    price: float
    image_url: str
    total_stock: int


class ChatResponse(BaseModel):
    """The chat API contract.

    `reply` goes in the chat bubble. `products` is what the page renders as
    product cards, and every field on them was read from the database after the
    agent chose the ids - so a card on the page cannot show a price the model
    made up.
    """

    reply: str
    products: list[ProductCard] = Field(default_factory=list)
    match_label: str = Field(
        default="", description="Heading for the row of cards on the page."
    )
    persisted: bool = Field(
        default=False, description="True when this exchange was saved to chat_messages."
    )
