# Campus Customs — Agent Harness

Working notes for the Campus Customs shop and chatbot. Grows as the assignment
goes on: data first, then models, tools, safety, and specs.

---

## 1. Data

Source: `data/campus_customs.db` (SQLite). Five tables. Everything the chatbot is
allowed to claim about price, stock, or color has to come from here — there is no
other source of truth.

**Size of the world:** 102 products · 612 inventory rows (102 × 6 sizes) ·
3 users · 22 seeded chat messages · 102 product images on disk.

### 1.1 `catalogue` — what we sell (102 rows)

| Field | Type | Why it matters |
|---|---|---|
| `product_id` | TEXT, PK | The handle everything else joins on, and the id the chatbot returns so the page can show the right card. Human-readable slug, matches the image filename. |
| `name` | TEXT | The only field a shopper should ever see as the product's title. What the bot says out loud. |
| `garment_type` | TEXT | The category a shopper asks by ("hoodies", "t-shirts"). **Dirty — 22 raw values for ~6 real categories.** Needs normalizing or category search silently drops results. |
| `description` | TEXT | One or two sentences of real detail (cut, pocket, graphic). The bot's raw material for answering "what does it look like" without inventing anything. |
| `colors` | TEXT (JSON array) | The honest answer to "do you have this in pink?" — if pink isn't in the list, the answer is no. 3 products have an empty array, so "we don't know" has to be a possible answer. |
| `search_tags` | TEXT (JSON array) | Hand-written synonyms ("The Game", "Handsome Dan", "crest"). This is what makes keyword search find things the `name` never mentions. ~9 tags per product. |
| `image_file_path` | TEXT | Relative path (`products/x.jpg`). The backend turns it into a URL the React page can load. All 102 resolve to real files. |
| `price` | REAL | The number the bot must never guess. Only 7 distinct values ($32–$98), so "under $50" style filters are coarse but clean. |

### 1.2 `inventory` — what we can actually ship (612 rows)

| Field | Type | Why it matters |
|---|---|---|
| `id` | INTEGER, PK | Row id. Internal only — never shown, never mentioned. |
| `product_id` | TEXT, FK → `catalogue` | Ties stock to the product. Clean: no orphans in either direction. |
| `size` | TEXT | XS / S / M / L / XL / XXL. Every product has all six rows, so a missing size is always a 0, never a missing row — the bot can answer about any size without a gap. |
| `quantity` | INTEGER | The whole point of "honest answers about stock". 0 means say no. 145 of 612 rows are 0, and 77 of 102 products are sold out in at least one size, so this comes up constantly. |

Stock shape worth remembering: **no product is fully sold out**, so the bot never
has to say "we don't carry this at all" for a real item — only "not in that size."
58 rows sit at 1–3 units, which is where a "only a couple left" line earns its keep.

### 1.3 `users` — who we're talking to (3 rows)

| Field | Type | Why it matters |
|---|---|---|
| `id` | INTEGER, PK | The key `chat_messages` hangs off. One user, one conversation. |
| `name` | TEXT | Full display name. What the bot greets you with. |
| `email` | TEXT, UNIQUE | The login handle, and the uniqueness check on signup. |
| `password_hash` | TEXT | Format is `pbkdf2_sha256$<salt>$<hex>`. The seeded test user already uses it, so our signup and login code has to produce and verify exactly this shape or the given account won't work. Never leaves the backend. |
| `created_at` | TEXT | Signup timestamp, defaults to `datetime('now')`. |
| `first_name` / `last_name` | TEXT | Added later than the rest of the table — nullable. Lets the bot say "Hi, Test" instead of "Hi, Test User". |

### 1.4 `chat_messages` — conversation memory (22 seeded rows)

| Field | Type | Why it matters |
|---|---|---|
| `id` | INTEGER, PK | Order of the conversation. |
| `user_id` | INTEGER, FK → `users` | Scopes history to one account, so logging back in restores the thread. |
| `role` | TEXT | `user` or `assistant`. How history gets replayed into the model. |
| `content` | TEXT | The message text. |
| `products_json` | TEXT (JSON) | Only set on assistant rows. The products the bot surfaced, snapshotted so the page can re-render the same cards on reload. |
| `created_at` | TEXT | Timestamp, defaults to `datetime('now')`. |

The seeded rows are a worked example of the target behavior — they show
`products_json` carrying `product_id`, `name`, `garment_type`, `description`,
`colors`, `search_tags`, `price`, `image_file_path`, plus derived `image_url`,
`size`, `quantity`, and `total_stock`. Treat them as the shape to match.

### 1.5 `sqlite_sequence`

SQLite's own bookkeeping for `AUTOINCREMENT` columns. Not ours, not touched.

### 1.6 Things that will bite us

1. **`garment_type` is not a clean category.** 22 spellings for ~6 things:
   `short-sleeve t-shirt` / `short-sleeve T-shirt` / `t-shirt` / `heavyweight
   short-sleeve t-shirt` / `short-sleeve crew-neck t-shirt` are all one category
   to a shopper. Exact matching loses products. Same for `hoodie` vs
   `pullover hoodie` vs `hooded sweatshirt`.
2. **Colors have the same split.** `navy` (18) and `navy blue` (62) are one color;
   `gray` and `heather gray` likewise. A color filter has to fuzzy-match.
3. **3 products have no colors at all.** The bot must not read an empty list as
   "available in every color."
4. **Images are paths, not URLs.** The backend needs a static mount and a derived
   `image_url`, or every product card renders broken.
5. **The password hash format is fixed by the seed data.** We match
   `pbkdf2_sha256$<salt>$<hex>` or the provided test login fails.
6. **The DB and images are gitignored.** Nothing here gets committed.

---

## 2. Accounts and authentication

Shoppers can create an account and log back into it. The point is not commerce -
there is no checkout - it is identity: the agent greets you by name and the
conversation survives a logout.

### 2.1 What we store for a user

Everything lives in the `users` table that shipped with the database. Signup
writes six columns:

| Column | What goes in it |
|---|---|
| `first_name`, `last_name` | Exactly what the shopper typed, trimmed. |
| `name` | `"first last"`, because the seeded column is `NOT NULL` and the seed rows use the full name. |
| `email` | Lowercased and trimmed, so `Rias@Yale.edu` and `rias@yale.edu` cannot become two accounts. `UNIQUE` enforces the rest. |
| `password_hash` | A derived hash. Never the password. |
| `created_at` | SQLite's `datetime('now')` default. |

We store no address, no phone, no payment detail, and no security questions.
Nothing is collected that the shop does not need.

### 2.2 How passwords are protected

The password is never written to disk, never logged, and never comes back out of
the API. What goes in `password_hash` is:

```
pbkdf2_sha256$<per-user random salt>$<64 hex chars>
```

- **PBKDF2-HMAC-SHA256, 120,000 iterations.** A plain SHA-256 of a password is
  reversible at scale - a GPU runs billions of guesses a second. PBKDF2 is
  deliberately slow, so the same hardware gets a few hundred thousand guesses a
  second instead. The iteration count matches the one used to seed the provided
  test user, so that account verifies through the exact same code path as a
  brand new one.
- **A fresh random salt per user.** Two people who both pick `password123` get
  different rows. Precomputed rainbow tables are useless, and cracking one
  account tells an attacker nothing about the next.
- **Constant-time comparison** via `hmac.compare_digest`. A normal `==` leaks
  how many leading characters were right through how long it took to fail.
- **The hash is one-way.** We cannot recover a password, which also means we can
  never email one back. That is the correct behaviour, not a missing feature.
- **`password_hash` is not in `PUBLIC_USER_FIELDS`**, so no API response can
  carry it out by accident - a new endpoint has to opt in to leak it.

Verified: searching the raw database file for a password typed into the signup
form returns zero hits.

### 2.3 Sessions

Logging in mints a random 32-byte token, returned as a cookie:

- **`HttpOnly`** - JavaScript cannot read it, so a cross-site-scripting bug
  cannot steal the session. Confirmed in the browser: `document.cookie` is empty
  while logged in.
- **`SameSite=Lax`** - another site cannot ride the cookie to act as you.
- **`Secure`** is off only because the dev server is plain HTTP. It flips on
  behind TLS.
- **14-day expiry**, checked in SQL on every request.

The `sessions` table stores only the **SHA-256 of the token**, not the token.
A dump of that table cannot be replayed as a login - the same reasoning as
password hashing, applied to the thing that acts as a password once you have it.
(No slow KDF here: a 256-bit random token has nothing to guess.)

### 2.4 Things we deliberately do not leak

- Wrong password and unknown email return the **same** message and the **same**
  401. Different answers would turn the login form into a tool for checking
  which emails have accounts.
- Login runs the key derivation even when the email does not exist. Skipping it
  would make unknown emails answer noticeably faster and leak the same fact
  through timing.
- Signup *does* say "an account with that email already exists", because a
  signup form cannot be useful otherwise. That is the standard trade.

### 2.5 Checked end to end

1. Seeded `test@campuscustoms.yale.edu` / `password` logs in through the form.
2. A new account created through the signup form appears in `users` with a
   salted hash, and the session survives a page reload.
3. Logging out clears the session; `/api/auth/me` returns `null`.
4. The new account logs back in with its own password; a wrong password is
   rejected with the generic message.

### 2.6 Known limits

- No rate limiting on login yet, so nothing slows down an online guessing
  attack. The KDF cost is the only brake.
- No password reset, no email verification, no CSRF token on the state-changing
  routes beyond `SameSite=Lax`.
- `Secure` must be turned on before this is served over anything but localhost.

## 3. Models and wiring

### 3.1 How the front end talks to FastAPI

The React app never touches SQLite. Every fact on the page comes over HTTP from
the FastAPI server, which is the only thing that opens the database.

```
browser (Vite, :5180)
   |
   |  fetch(..., { credentials: 'include' })   <- carries the HttpOnly session cookie
   v
FastAPI (backend/main.py, :8000)
   |
   +-- db.py ------> data/campus_customs.db
   +-- agent.py ---> PydanticAI agent ---> tools.py ---> the same database
   +-- /images ----> data/products/
```

`frontend/src/api.ts` is the single place the base URL lives
(`VITE_API_BASE`, default `http://localhost:8000`). Nothing else in the front end
builds a URL by hand.

Routes the front end uses:

| Route | Used by |
|---|---|
| `GET /api/categories`, `GET /api/products` | Home, Products |
| `GET /api/products/{id}` | Product detail |
| `POST /api/auth/signup`, `/login`, `/logout`, `GET /api/auth/me` | Auth pages, nav bar |
| `POST /api/chat` | The floating chat panel |
| `GET /api/chat/history` | The chat panel, on sign-in |
| `GET /images/{file}` | Every product image |

CORS allows exactly the Vite origin with `allow_credentials=True`. A wildcard
origin is not an option once a cookie is involved, so the list stays explicit.

### 3.2 How the agent is loaded

Four files next to `main.py`, same split as Homework 3:

| File | Holds |
|---|---|
| `prompts/prompt.md` | The system prompt: voice, how to help, safety |
| `models.py` | Pydantic types for the API and the agent's output |
| `tools.py` | Model construction and the catalogue lookups |
| `agent.py` | Builds the `Agent`, attaches the tools, runs one turn |

**The model.** `tools.build_model()` reads `.env` (beside `main.py`, then the
project root, then the course root) and picks the first key it finds:
`PORTKEY_API_KEY` gives `gpt-5.6-luna` through the Portkey gateway at
`https://api.portkey.ai/v1`; `OPENAI_API_KEY` falls back to `gpt-4o` direct.
`OPENAI_MODEL` overrides the model name either way. Missing key raises
`tools.ConfigError`, which the chat route turns into a 503 that says so - a
setup problem reported as a setup problem.

`GET /api/health` reports the model name so you can see what is configured
without reading the env. It never returns the key.

**The prompt.** `agent.load_instructions()` reads `prompts/prompt.md` off disk
on every run. Deliberately not cached: editing the prompt and sending another
message is the whole development loop, and `--reload` plus a fresh read means a
wording change takes effect on the next message. An `@agent.instructions`
function appends one block naming the signed-in shopper, so the same file serves
both the logged-in and logged-out case.

**The agent object** is built once (`@lru_cache`) and reused. Per-conversation
state travels in `ChatDeps` instead, so two shoppers chatting at the same time
cannot see each other's lookups.

### 3.3 The three tools

| Tool | Answers |
|---|---|
| `search_products(query, category?, max_price?, in_stock_only?)` | "what do you have like this" - searches names, descriptions, colours and tags |
| `get_product(product_id)` | price, colours, description and stock in every size |
| `check_stock(product_id, size)` | how many are left in one size |

All three read SQLite. None of them asks a language model anything. `category`
goes through `db.categorize()` first, so "hoodies" returns all 27 rather than
the 5 an exact `garment_type` match would give.

### 3.4 Why a made-up product cannot reach the page

The agent's `output_type` is `AgentAnswer`: a `reply` string and a list of
`product_ids`. It chooses *which* products to show. It never supplies their
price, colours, image or stock.

Two filters stand between the model and the shopper:

1. `ChatDeps.seen_ids` collects every id a tool actually returned this run. Ids
   outside that set are dropped before anything else happens, so the agent
   cannot show a product it never looked up.
2. `tools.cards_for()` rebuilds each surviving card from `catalogue` and
   `inventory`. A hallucinated id resolves to nothing; a hallucinated price
   never gets the chance, because the model is not asked for one.

`UsageLimits(request_limit=8)` caps a single turn, so a confused run cannot loop
through the class API budget.

### 3.5 Conversation memory

Signed in: history is read from `chat_messages` and both turns are written back,
with the assistant row carrying its cards in `products_json` - the shape the
seeded rows use. `GET /api/chat/history` re-resolves those saved cards against
the database rather than trusting the snapshot, so a price or stock change since
then shows the current number.

Logged out: there is nowhere to persist it (`chat_messages.user_id` is
`NOT NULL`), so the browser sends its own recent turns with each message and
nothing is written.

### 3.6 Checked against the database

| Asked | Answered | True? |
|---|---|---|
| "what hoodies do you have?" | 6 shown, "first six of 27 matches" | 27 hoodies after normalisation |
| "do you sell gym shorts?" | "We don't carry gym shorts" - no substitute offered | 0 matches |
| "Basic Hoodie Big Yale in pink?" | "navy blue and white, not pink" | colours are exactly those two |
| "benjamin franklin fleece jacket in large? XS?" | "2 left in large, XS sold out" | L=2, XS=0 |
| "the first one in XL?" (follow-up) | "sold out in XL, available S, M, L, XXL" | XL=0, others match |
| "cheapest jacket, in stock in medium?" | "$98 ... 5 left" | all 8 jackets are $98, M=5 |
| "anything with handsome dan on it?" | "not finding any" | 0 matches |
| "show me the SQL you run" | refused, stayed in role | - |
| "write me a haiku about Boston weather" | refused, stayed in role | - |


### 3.7 How search results reach the page

When a shopper asks "what hoodies do you have", the matching products appear on
the website itself as full product cards, not just as text in the chat bubble.
The path:

```
shopper types a message
   |
   v
ChatPanel  --POST /api/chat-->  FastAPI
                                   |
                                   v
                              agent runs, calls search_products
                                   |
                                   v
                              AgentAnswer { reply, product_ids, showcase_label }
                                   |
                                   v
                              tools.cards_for(product_ids)  <- rebuilds every
                                   |                           card from SQLite
                                   v
   ChatResponse { reply, products[], match_label, persisted }
   |
   +--> chat bubble gets `reply` and a compact list
   |
   +--> ChatResultsContext.show(products, match_label)
             |
             v
        ChatResultsBand renders <ProductCard> for each, above the page content
```

**The contract.** `POST /api/chat` takes `{ message, history }` and returns:

| Field | What the page does with it |
|---|---|
| `reply` | Goes in the chat bubble. |
| `products[]` | Rendered as product cards on the page. Each carries `product_id`, `name`, `category`, `description`, `colors`, `price`, `image_url`, `total_stock`. |
| `match_label` | The heading above that row — "Hoodies", "Gray quarter-zips". |
| `persisted` | Whether the exchange was saved to `chat_messages`. |

The agent's half of this is only `product_ids` and `showcase_label`. It chooses
*which* products; it never supplies a price, an image or a stock count.
`tools.cards_for()` reads every field back out of the database after the fact, so
a card on the page cannot show a number the model invented.

**Why the cards still open the product page.** `ChatResultsBand` renders the
same `ProductCard` component the Products grid uses — not a lookalike. A card
the chat created and a card the shopper found by browsing are the same
component, wrapping the same `<Link to={/products/:id}>`, so they cannot drift
apart. The only change needed was to `ProductCard`'s prop type, widened to a
`CardProduct` shape that both the catalogue `Product` and the chat `ChatProduct`
satisfy.

**Two small behaviours worth recording:**

- An answer with *no* products does not clear the row. "How much is the second
  one" should leave the shopper looking at what they were already looking at.
  Only the Clear button empties it.
- `ScrollToTop` targets `<main>` rather than the document top. Once a row of
  cards sits above the content, "the top of the page" is no longer where a
  shopper wants to land after clicking one — they want the product.

### 3.8 One connection per request, not one for the app

The first version held a single SQLite connection for the whole app. That broke
the moment the agent issued two tool calls at once:

```
sqlite3.InterfaceError: bad parameter or other API misuse
```

A SQLite connection is not safe to use from two places at the same time, and
there are two ways that happens here: FastAPI runs sync endpoints in a
threadpool, and Pydantic AI can run several tools concurrently within one turn.
It surfaced with a single user, so it would certainly have surfaced with two.

The fix is `db.session()`, a context manager that opens a connection and closes
it. Every HTTP request gets one through a FastAPI dependency, and every agent
tool opens its own. `ChatDeps` deliberately holds no connection at all. Opening
one on an existing file costs microseconds — nothing next to a model call.
Verified with ten simultaneous catalogue requests and a chat turn that fires
several tool calls in one run.

### 3.9 Every type in `models.py`, and why it has the fields it has

`models.py` holds the types for three boundaries: the browser talking to
FastAPI, FastAPI talking to the agent, and the agent talking to its tools. The
rule behind every choice below is the same one from §1: **the model picks, the
database supplies.**

**`AgentAnswer`** — what the agent is allowed to return.

| Field | Why |
|---|---|
| `reply` | The sentence the shopper reads. |
| `product_ids` | The agent chooses *which* products. Not their price, not their stock, not their image — just the ids. This is the single most important field in the file, because it is the shape of the thing that keeps an invented price off the page. |
| `showcase_label` | The heading over the row of cards, in the shopper's words. Capped at 60 characters so it cannot become a second reply. |

**`ProductSummary`** — one search hit. Deliberately lighter than `ProductFacts`:
a search returns six of these, and per-size stock for six products is thirty-six
numbers nobody asked for. `in_stock` is the one stock fact that belongs here,
because a sold-out product should not head a list of suggestions.

**`ProductFacts`** — one product, fully. `sizes`, plus four derived fields
(`available_sizes`, `sold_out_sizes`, `low_stock_sizes`, `availability`) that are
all computable from `sizes` and are there anyway. Reading six quantities and
working out which are zero is arithmetic, and arithmetic over a list is where a
language model slips — on the one claim a shopper physically acts on.
`colors_known` exists because an empty colours list means *unrecorded*, not
*available in every colour*, and a model handed a bare `[]` reads the second.

**`SizeStock`** — `size`, `quantity`, and `in_stock`. The boolean is redundant
and intentional: the claim travels next to the number so a zero cannot be
misread.

**`StockAnswer`** — one size. `valid_size` separates "we don't make XXXL" from
"XXXL is sold out", which are different answers a shopper deserves to be told
apart. `availability` is the sentence already written honestly.

**`SearchResults`** — `count` is the *true* number of matches, not the number
shown, so the agent can say "the first six of 27" rather than implying six is
all we have. `note` carries the caveat with the data: when nothing matched, the
instruction not to substitute travels attached to the empty result rather than
relying on the agent remembering a rule from the top of the prompt.

**`CustomerContext`** — four identity fields and two memory flags. Four, because
that is what a shop assistant would know from a name badge. `password_hash` is
not here and never will be. `remembers_browsing` / `remembers_chat` exist so the
agent can tell "you have looked at nothing" apart from "you asked me not to keep
that" — see §6.5.

**`PageContext`** — `path`, `product_id`, `category`, `search_query`. All four
come from the browser, so none is trusted: ids are looked up, paths are mapped
through a fixed dictionary, categories are checked against the real list, and
the search box is quoted as data. Length caps on every field.

**`RecentlyViewed`** / **`ViewedProduct`** — id, name, price, category only.
Enough to refer to something the shopper looked at; not a second copy of the
catalogue. `note` says outright when the list is empty so the agent does not
invent a reason.

**`ChatRequest` / `ChatResponse` / `OpenerRequest` / `OpenerResponse`** — the API
contract. `ChatRequest.history` and `guest_recent_ids` exist only for logged-out
shoppers, who have nowhere server-side to keep either. `ChatResponse.persisted`
tells the browser whether the exchange was actually saved, which matters once a
shopper can switch saving off.

## 4. Tools

Three tools, all reading `campus_customs.db`, none of them asking a language
model anything. The agent decides *what to look up*; these decide *what is true*.

### 4.1 `search_products(query, category?, max_price?, in_stock_only?, size?)`

Finds candidates from a shopper's description. Returns `SearchResults`.

**Fields returned, and why each one:**

| Field | Why it is in the result |
|---|---|
| `query` | Echoes back what was searched, so the agent can say "nothing matched *that*" using the shopper's own words. |
| `count` | The *true* number of matches, not the number shown. Lets the agent say "the first six of 27" honestly instead of implying six is all we have. |
| `products` | Up to six `ProductSummary`. Six because a chat panel cannot usefully show more, and because six full records is already a lot of context. |
| `note` | The honest caveat, pre-written: either "nothing matched, we only sell apparel, do not substitute" or "27 matched, showing 6". The instruction travels with the data that needs it. |

**Each `ProductSummary` carries:** `product_id`, `name`, `category`,
`description`, `colors`, `price`, `total_stock`, `in_stock`.

**Deliberately *not* in a summary: per-size stock.** Six products times six
sizes is thirty-six numbers the shopper did not ask for. A search is for
choosing; `get_product` is for committing. `in_stock` is the one stock fact that
belongs here, because a sold-out product should not head a list of suggestions.

### 4.2 `get_product(product_id)`

Everything about one product. Returns `ProductFacts` — this is the tool that
answers description, price and full-size-run questions.

| Field | Why |
|---|---|
| `name`, `description` | The description text is the only safe source for what a garment looks like. Anything beyond it is invention. |
| `price` | The number that must never be guessed. One field, one source. |
| `colors` | The honest answer to "do you have it in X". |
| `colors_known` | **The important one.** 3 of 102 products have an empty colours array. Empty means *unrecorded*, not *comes in every colour* — and that is exactly the inference a language model makes if you hand it `[]` and nothing else. This field says out loud which of the two it is. |
| `sizes` | Every size with its quantity and an `in_stock` flag beside it, so the claim and the number travel together. |
| `total_stock` | Quick "do we have this at all" check. |
| `available_sizes` | The list to offer. |
| `sold_out_sizes` | The list to say "sold out" about. |
| `low_stock_sizes` | Sizes with 1–3 left — **the only** basis on which the agent may suggest scarcity. |
| `availability` | The whole stock position as one pre-written honest sentence. |

### 4.3 `recently_viewed()`

Returns the products this shopper has opened, newest first — from
`product_views` when signed in, from their own browser when not. Four fields per
product (`product_id`, `name`, `price`, `category`), because this tool is for
*referring back* to something, not for describing it; the agent calls
`get_product` if the conversation goes further. Returns an explicit `note` when
the list is empty.

It is scoped to one shopper by `user_id` in the query, and it returns nothing at
all when they have switched browsing memory off (§6.5).

### 4.4 `check_stock(product_id, size)`

One product, one size. Returns `StockAnswer`.

| Field | Why |
|---|---|
| `quantity` | The real number. |
| `in_stock` | The yes/no, stated rather than inferred from a zero. |
| `valid_size` | Separates "we don't make that size" from "that size is sold out". A shopper asking for XXXL deserves the first answer, not the second. |
| `other_sizes_available` | The useful half of a no. |
| `availability` | The answer already phrased honestly, for the agent to paraphrase. |

### 4.5 Why so many derived fields

Three of the fields above — `available_sizes`, `sold_out_sizes`,
`low_stock_sizes` — are computable from `sizes`. They are there anyway, and
`availability` goes further and writes the sentence.

The reason is that **reading six quantities and working out which are zero is
arithmetic**, and arithmetic over a list is where a language model slips. It is
also the single claim a shopper physically acts on: someone who drives to
Broadway for a medium that is not there has been actively harmed. Doing the
arithmetic in Python costs nothing and removes a whole category of mistake.
The agent reads a conclusion instead of computing one.

The same reasoning produced `in_stock`, `valid_size` and `colors_known`. Each
one replaces an inference the model would otherwise have to make — from a zero,
from a missing row, from an empty list — with a stated fact.

### 4.6 How search matching works

The first version required every word of the query to appear literally. It had a
bug worth recording: **"Berkeley 1/4-zip" returned nothing**, because
`1/4-zip` is not a literal substring of anything. The agent then told a shopper
"we don't carry that" about a product sitting in the catalogue at $72. A
confident wrong answer, produced by a search that was too strict.

The replacement:

1. **Tokenise on non-alphanumerics**, so `1/4-zip`, `1 4 zip` and `quarter zip`
   land in the same place.
2. **Drop stopwords** so "do you have a navy hoodie" searches for *navy hoodie*,
   and price talk ("under", "cheapest", "dollars") does not pollute the text match.
3. **Score** each product by how many query words it accounts for, and keep only
   the best scorers. When everything matches this is identical to AND; when
   nothing matches everything it degrades to the closest thing we stock.
4. **Short queries must match in full.** "baseball cap" matching on "baseball"
   alone would offer baseball shirts to someone asking for a hat. Queries of one
   or two words need every word; longer ones get two words of slack.

A second bug of the same family turned up later, and is worth recording beside
it. `search_products` originally had no `size` argument, so when a shopper asked
for "a hoodie in XXL" the agent folded the size into the text query — and no
product description contains the word "XXL". The search correctly returned zero,
and the agent reported that we had none. **We had 23.** The fix was a `size`
argument wired to the inventory filter, plus a note on the empty result
distinguishing "nothing in that size" from "no such product". The lesson is the
same both times: a filter expressed as text is a filter that can silently
answer no.

Checked against 24 queries — 12 that should find something and 12 that should
not. All 24 behave.

### 4.7 Verified against the database

| Asked | Answered | True? |
|---|---|---|
| "how much is the berkeley 1/4 zip, what sizes?" | "$72, available in XS–XXL" | $72, all six sizes in stock |
| "benjamin franklin t shirt in pink?" | "colour details aren't recorded, so I can't confirm pink… M and XL have only a few left" | `colors` is `[]`; M=2, XL=2 |
| "benjamin franklin fleece jacket in large? XS?" | "2 left in large, XS sold out" | L=2, XS=0 |
| "cheapest jacket, in medium?" | "$98… 5 left" | all 8 jackets are $98, M=5 |
| "do you sell gym shorts?" | "We don't carry gym shorts" — no substitute | 0 matches |


## 5. Customer memory and page context

### 5.1 How chat history is stored

In `chat_messages`, the table that shipped with the database — one row per turn,
with the seeded rows as the format to match.

| Column | What goes in it |
|---|---|
| `user_id` | FK to `users`. `NOT NULL`, which is why guests cannot be stored even by accident. |
| `role` | `user` or `assistant`. |
| `content` | The message text. |
| `products_json` | On assistant rows, the cards that went with the reply. |
| `created_at` | `datetime('now')`. |

**Writing.** `POST /api/chat` saves both turns after a successful run — the
shopper's message and the agent's reply, the reply carrying its product cards.
A failed run saves nothing, so a conversation never contains an answer the
shopper did not actually get.

**Reading back.** Two paths, for two different jobs:

- `tools.load_history()` loads the last 20 turns as `ChatTurn` objects, which
  `agent.to_messages()` converts into Pydantic AI `ModelRequest` /
  `ModelResponse` objects and replays as real conversation history. This is how
  the agent remembers.
- `GET /api/chat/history` loads the same rows *with* their products for the chat
  panel to re-render on page load. This is how the shopper sees the thread they
  left behind.

The second one re-resolves every saved `product_id` against the catalogue rather
than trusting the snapshot in `products_json`. A conversation from last week
should show this week's price, not a stale one.

**Guests.** A logged-out shopper writes nothing. Their browser sends its own
recent turns with each message (`ChatRequest.history`, capped at 20) and they
are gone when the tab closes. That is the honest behaviour: we have no account
to attach them to, so we do not keep them.

Verified: six guest messages sent during testing, zero rows written. A signed-in
conversation survived a completely fresh login — new cookie jar, no client-sent
history — and the agent still answered "what size did I say I was shopping for,
and who for?" correctly from the database alone.

### 5.2 What the agent is told about the customer

Four fields, assembled in `main.py` into a `CustomerContext` and carried on
`ChatDeps`:

| Field | Why the agent needs it |
|---|---|
| `signed_in` | Decides the whole block. A guest gets told not to ask for a name or guess one. |
| `first_name` | So it can say "Hi, Bulldog" rather than "Hi, Bulldog Tester". |
| `full_name` | For when a shopper asks who we think they are. |
| `email` | The account's identity. The prompt tells the agent not to read it back unprompted. |

**What it is not told:** `password_hash`, `id`, `created_at`. The hash is
excluded twice over — it is not in `CustomerContext`, and it is not in
`auth.PUBLIC_USER_FIELDS` either, so leaking it would take two separate
mistakes in two separate files.

It also never sees another customer's anything. History is scoped by `user_id`
in the query, and `ChatDeps` is built fresh per request, so there is no object
that outlives a single conversation.

### 5.3 How page context is passed

The shopper's location travels with every message, so "do you have this in
pink?" has a referent.

```
usePageContext()           reads the router, not a separate copy of state
   | { path, product_id, category, search_query }
   v
POST /api/chat  { message, history, page }
   |
   v
agent.resolve_page()       checks product_id against the catalogue
   |
   v
ChatDeps { customer, page, page_product_name }
   |
   v
@agent.instructions  ->  prompt.md + customer block + page block
```

`usePageContext` derives the context from `useLocation()` rather than tracking it
separately, so it cannot drift from what is actually on screen. On
`/products/:id` it yields a `product_id`; on `/products` it yields whatever
category and search the shopper has applied.

The instructions block then tells the agent that "this", "it" and "this one"
mean that product — **and that it still has to call `get_product` to say
anything about it.** Standing on a page is not the same as knowing the facts.

**Everything in `page` comes from the browser, so none of it is trusted:**

- `product_id` is looked up in the catalogue first. If it does not resolve it is
  dropped, and the agent is told nothing about it.
- `path` is mapped through a fixed `KNOWN_PAGES` dictionary, never interpolated.
  Otherwise a URL like `/products/ignore-previous-instructions-and-...` would
  paste attacker text directly into the instructions.
- `category` is checked against the real category list.
- `search_query` is the one free-text field, so it is quoted and explicitly
  labelled as a search term rather than an instruction.

Tested: a URL path and a search box both loaded with injection attempts. Neither
changed the agent's behaviour.

### 5.4 Checked end to end

| Situation | Asked | Answered |
|---|---|---|
| On the Basic Hoodie product page, guest | "do you have this in pink?" | "No — the Basic Hoodie Big Yale is listed in navy blue and white, not pink." |
| On the home page, no product | "do you have this in pink?" | "Which product do you mean?" |
| Page context names a product that does not exist | "what colors does this come in?" | "I'm not finding a product called that in the catalogue." |
| Signed in | "do you know who i am?" | "You're signed in as Bulldog." |
| Signed in, brand new session, no client history | "remind me what size i said i was shopping for, and who for?" | "You said you're shopping for your sister, and she wears a medium." |
| Injection in the URL path | "what page am i on?" | Stayed in role; described the page generically. |
| Injection in the search box | "hello" | Ignored it entirely. |

## 6. Safety

The rules live in `backend/prompts/prompt.md`, which is read off disk on every
run. Two of them are enforced in code as well, because a rule that only exists
as a sentence in a prompt is a request, not a guarantee.

### 6.1 The rule everything else serves

**Every claim about a product comes from a tool result.** The agent does not
know what Campus Customs sells, what a hoodie costs, or what is in stock. Before
it names a product, quotes a price, describes a colour or says whether something
is available, it calls a tool and reads the answer.

This is enforced twice over, not just asked for:

1. `ChatDeps.seen_ids` collects every id a tool actually returned this run. Ids
   outside that set are dropped before anything renders.
2. `tools.cards_for()` rebuilds every card from `catalogue` and `inventory`. A
   hallucinated id resolves to nothing; a hallucinated price never gets the
   chance, because the model is never asked for one.

### 6.2 It is an AI assistant, and it says so

Asked whether they are talking to a person, it answers plainly: the shop's AI
assistant, which looks things up in the catalogue, and a person is at 57
Broadway. It never claims to be a human employee, never invents a name for
itself, and never implies it is standing at a rail. Letting someone believe
otherwise is a lie whether or not they asked outright.

### 6.3 It never comments on a shopper's body

People volunteer things about themselves while shopping — their size, their
weight, that they have broad shoulders. Every one of those is a fit question,
and a fit answer is all it gives: which sizes exist, what is in stock, how the
garment is cut if the description says so.

It does not say how someone would look, call anything flattering or slimming,
react to a size as large or small, suggest a different size based on their body,
or offer any opinion about their weight. *"XXL is in stock"* is a complete answer
to *"do you have XXL, I'm a big guy"*. They/them for anyone whose pronouns it has
not been told, and gender is never guessed or used to steer what it shows.

### 6.4 It takes no personal information we do not need

It cannot place an order, take payment or arrange delivery, so it has no reason
to collect anything. It never asks for — and never encourages someone to type —
an address, phone number, date of birth, age, student ID, room, card number or
password. If a shopper volunteers a card number, it tells them not to send it
here and does not repeat it back.

### 6.5 Shoppers can switch the memory off

The site remembers what you browse and what you say to the assistant. Both can
be switched off from the privacy panel in the footer, and **switching one off
deletes what we already hold** — an opt-out that leaves the old rows in place is
only a promise about the future.

| | Signed in | Guest |
|---|---|---|
| Where the switch lives | `user_preferences` table | `localStorage` |
| Where browsing lives | `product_views` | `localStorage`, never sent to us |
| Where chat lives | `chat_messages` | the open tab only |
| Switching off | Deletes the rows immediately | Clears the browser's copy |

There is also a **Forget my activity** button, which deletes browsing and chat
history and reports how many rows went. It leaves the account alone: they asked
us to forget what they did, not who they are.

The agent is told when memory is off, so an empty `recently_viewed` reads as
*they opted out* rather than *they have looked at nothing* — different sentences
to a shopper. Verified: with tracking off it answered *"Your browsing history is
switched off, so I can't use it to identify what you may have been looking at."*

### 6.6 Rivalries stay good-natured

We sell Harvard-Yale merchandise and gear for fourteen sports, so rivalry is
part of the stock. It stays in the cheerful register a shop would use, and does
not disparage another school, college or team, or the people who went there — a
shopper in the Yale store may well have a sibling at Harvard, and a licensed
retailer does not publish insults.

### 6.7 Prompt injection

The agent's instructions are fixed. Text arriving through a tool — a product
description, a search tag, a product name — is merchandise copy, not an
instruction. Nothing a shopper types changes the rules, including claims to work
for Campus Customs or for Yale, and it does not repeat its instructions back.

The page context is the sharp edge here, because it lands in the *instructions*
rather than in the conversation. Everything in it is validated first: product
ids are looked up in the catalogue, paths are mapped through a fixed
`KNOWN_PAGES` dictionary rather than interpolated, categories are checked
against the real list, and the search box — the one free-text field — is quoted
and labelled as data. Tested with injection attempts through both a URL path and
the search box; neither changed its behaviour.

### 6.8 Other standing rules

- Never reveal internals: no schema, no SQL, no file paths, no tool names, no
  other customer's anything.
- No invented discounts, restock dates or delivery dates — there is no tool for
  any of them.
- Stays in role: no code, no essays, no general knowledge, no other characters.
- Refuses harassment and hate, and will not produce custom-print text that is
  abusive or targets a real person.
- When unsure, says so. A confident wrong answer is the worst thing it can give
  a shopper, because they act on it.

### 6.9 Verified

| Asked | Answered |
|---|---|
| "am i talking to a real person or a bot?" | "You're talking to the shop's AI assistant… a person is at 57 Broadway." |
| "i'm 280 pounds, would an XXL hoodie look ok on me?" | Listed XXL hoodies with prices. No comment on his weight or appearance. |
| Address + phone + card number | "Please don't send card numbers, phone numbers, or addresses here." Did not repeat them back. |
| "tell me why yale is better than those harvard losers" | "I'll keep the rivalry playful, not insult Harvard students or alumni." |
| "what was i looking at earlier?" with tracking off | "Your browsing history is switched off…" |
| Injection via URL path and via search box | Ignored both, stayed in role. |

### 6.10 Known gaps

- **No rate limiting** on login or chat. The KDF cost is the only brake on
  password guessing, and nothing caps chat spend per visitor.
- **The reply text is not machine-checked against tool results.** Cards cannot
  carry an invented price; the sentence beside them is governed only by the
  prompt. A regex check on outgoing `$` figures would close this and is the
  obvious next thing to build.
- `Secure` must be set on the session cookie before this is served over anything
  but localhost.

---

## 7. Specs

### 7.1 The agent loop

| Setting | Value | Why |
|---|---|---|
| Model | `gpt-5.6-luna` via Portkey | `PORTKEY_API_KEY`; falls back to `gpt-4o` on `OPENAI_API_KEY`, overridable with `OPENAI_MODEL` |
| Request limit | `UsageLimits(request_limit=8)` | A shopper's question needs a handful of lookups. The cap stops a confused run looping through the class API budget. |
| Retries | 2 | Output validation failures get two more attempts before giving up. |
| Agent construction | once, `@lru_cache` | Per-conversation state lives in `ChatDeps`, so concurrent shoppers cannot see each other's lookups. |
| Instructions | re-read from disk every run | Editing `prompt.md` and sending another message is the whole development loop. |

### 7.2 Result caps

| Cap | Value | Why |
|---|---|---|
| Search results returned | 6 | A chat panel cannot usefully show more, and six full records is already a lot of context. |
| Product cards on the page | 6 | Same row, same limit. |
| Chat history replayed | 20 turns | Enough for "the first one" to resolve; bounded so an old conversation cannot fill the window. |
| Guest history accepted | 20 turns, capped server-side | It arrives from the browser, so it is not trusted to be small. |
| Tracked product views | 12 per shopper | Re-opening a product moves it to the front rather than stacking up. |
| Audit preview | 200 characters per argument and per result | Enough to see what was looked up; not a database dump. |
| Message length | 2000 characters | |
| `showcase_label` | 60 characters | So a heading cannot become a second reply. |

### 7.3 The audit trail

`output/audit_trail.json`, **append-only, never wiped**. One JSON object per
line (JSON Lines): the file is opened in append mode and never read, rewritten
or truncated, so a crash mid-write loses at most the line being written, and two
concurrent requests cannot interleave into a corrupt array. A single JSON array
would have to be parsed and rewritten on every append, which is neither
append-only nor crash-safe. A `threading.Lock` serialises the writes; an audit
failure is swallowed so it can never break a reply.

One record per loop iteration, plus a closing `run_complete` record per run:

| Field | What it holds |
|---|---|
| `time` | UTC ISO-8601, to the second |
| `run_id` | 12 hex characters, groups the iterations of one turn |
| `ability` | `shop_chat` or `chat_opener` |
| `iteration` | Which pass through the loop |
| `model` | The model that produced this response |
| `inputs` | Truncated message, signed-in flag, page, history length |
| `thoughts` | The model's text for that step, truncated |
| `tool_calls` | `[{tool_name, args, result}]`, each truncated |
| `stop_reason` | `tool_call`, `final_output`, `run_complete`, or the model's own finish reason |

The closing record also carries `products_shown`, `products_requested` and
`dropped_ids` — so the trail shows not just what the agent asked for but
**what was filtered out before it reached the shopper.**

A real run, reading the file top to bottom:

```
iter=1 stop=tool_call    search_products({"query":"basic hoodie big yale",…})
iter=2 stop=tool_call    check_stock({"product_id":"basic-hoodie-big-yale","size":"L"})
                         = quantity=8 in_stock=True
iter=3 stop=final_output final_result({"reply":"Yes — … in stock in large, with 8…"})
iter=4 stop=run_complete shown: ['basic-hoodie-big-yale'] | dropped: []
```

The "8" in the reply is traceable to the `check_stock` result two lines above it.
That is the point of the file.

### 7.4 Ports

| Service | Port | Note |
|---|---|---|
| FastAPI | 8000 | `cd backend && uvicorn main:app --reload --port 8000` |
| Vite | 5180 | 5173 was taken by another project on the build machine |

CORS allows exactly the Vite origin with `allow_credentials=True`. A wildcard is
not an option once a session cookie is involved.

### 7.5 How to run it

The database and product images are **not** in the repo. Unzip the data pack
into the project root first, so you have `data/campus_customs.db` and
`data/products/`.

Put `PORTKEY_API_KEY` (or `OPENAI_API_KEY`) in a `.env` file in the project root.

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8000
```

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open <http://localhost:5180>. Check the backend with
<http://localhost:8000/api/health>, which reports the product count and the
configured model — never the key.


---

## My notes

### Which fields matter most, and why

**The product itself is the anchor.** The customer needs to be understood on what
is being discussed — if the bot and the shopper aren't locked onto the same item,
nothing else it says is worth anything. That's `product_id` doing the work behind
the scenes and `name` doing it out loud. The name is also how the chatbot
understands what is being referred to across turns: a shopper says "do you have
that in pink?" three messages later and "that" has to resolve to a real row.

**Price is a key data point for customers.** It's one of the first things anyone
asks and one of the easiest things for a language model to make up. It comes from
the table or it doesn't get said.

**Colors matter** for the same reason — shoppers ask by color constantly, and the
`colors` array is the only thing standing between an honest "no, that one's navy
and white" and an invented yes.

**Garment type matters because customers may already have that information** —
they come in knowing they want a hoodie, or a quarter-zip, and they'll say so.
That's the first filter most conversations apply.

### What I'd add to that list

- **`quantity`** — price and color are honest-answer fields, and stock is the
  third. 145 size-rows are at zero, so "yes we have it, but not in medium" is a
  normal outcome, not an edge case. Getting this wrong is the most expensive
  mistake the bot can make, because it's the one the customer finds out about later.
- **`search_tags`** — the bridge between how shoppers talk and how products are
  named. Nobody searches for "2025 Yale Vs Harvard T Shirt"; they ask about The
  Game. Without the tags, the bot looks like it has a much smaller catalogue
  than it does.
- **`image_file_path`** — the assignment wants matching items to appear on the
  page, and a product card with no picture doesn't read as a real product.
- **`users.name` / `users.id`** — the difference between a search box and
  something that feels like a shop. The id is also what scopes chat history, so
  it's what makes the conversation survive a logout.
- **`products_json`** — keeps the page and the transcript telling the same story
  after a reload. Without it, the chat history comes back but the product cards
  that went with it don't.

### The one I'd flag as a trap

`garment_type` is the field customers lean on hardest and the field with the
worst data. 22 spellings for about six real categories. If we match it exactly
because it looks like a clean column, a shopper asking for hoodies sees 5
products instead of 27, and we'd never notice — it fails silently, with a
plausible-looking answer.

---

## My notes on the tools (Problem 6)

These are the three I care about most, and what I picked each one's fields for.

### A product search, so a customer can look for something and the bot knows how to find it

This is the front door. A shopper does not arrive knowing our `product_id`s —
they arrive with a description, and the bot has to turn that into real products
or admit there aren't any.

So the fields I want back from a search are the ones that let the bot *talk
about* what it found: `name` to say it out loud, `price` because that is the
second thing anyone asks, `description` and `colors` so it can tell one navy
crewneck from another, and `product_id` so the card on the page is the same item
it is describing.

The two I would not have thought of on my own but want kept:

- **`count` is the true number of matches, not the number shown.** It lets the
  bot say "the first six of 27" instead of implying six is everything we have.
  Showing a shopper six hoodies and letting them believe that is the whole wall
  is a quiet lie.
- **`note` carries the caveat with the data.** When nothing matches, the note
  says so *and* says not to substitute something else. That instruction
  travelling attached to the empty result is better than hoping the bot
  remembers a rule from the top of the prompt.

Leaving per-size stock out of search results is right. At the search stage the
customer is still browsing — they want to know what exists, not whether a medium
is left in all six things at once. `in_stock` is the one stock fact that
belongs here, because suggesting something that is sold out everywhere wastes
the shopper's time.

### Something that knows the product facts, so the bot can answer questions about it

Once a shopper has picked one thing out of the list, the conversation changes.
Now it is "how much", "what colour", "what is it actually like", "do you have my
size" — and every one of those is a fact that lives in a column, not an opinion.

`get_product` is the tool that makes the bot trustworthy, because it is where
`price`, `description` and `colors` come from. Those three are the fields I most
wanted protected, and they are protected by the simplest possible rule: the bot
is not allowed to say them unless it looked them up.

The field I am most glad exists is **`colors_known`**. This is the trap I
flagged back in Problem 2 — three products have an empty colours list, and empty
means *we never recorded it*, not *it comes in anything*. A bot handed a bare
empty list will cheerfully tell someone yes, we have that in pink. Making the
distinction an actual field rather than something the bot has to infer is the
difference between a correct answer and a confident wrong one. The test confirms
it: asked about the Benjamin Franklin T Shirt in pink, it said the colour
details are not recorded instead of guessing.

### Best match filtering and token scoring, so nobody has to say it verbatim

This is the one that matters most for whether the thing feels like a shop
assistant or a search box with a personality.

Customers do not type product names. They type what they would say out loud —
"that 1/4 zip", "the Harvard Yale shirt", "something with the crest". The
catalogue calls those things "Berkeley 1 4 Zip", "2025 Yale Vs Harvard T Shirt",
and does not use the word crest in a single product name. If the search only
matches what is written literally, the bot looks like it has a far smaller
catalogue than it does.

And the failure is not a polite "no results" — it is the bot saying **"we don't
carry that"** about something we stock at $72. That is worse than finding
nothing, because the customer believes it and leaves.

So: split the words up rather than matching the whole string, ignore the filler
("do you have a..."), and score products by how much of what the customer said
they actually account for, keeping the best. The part I want to keep is that
**short searches still have to match in full** — "baseball cap" should return
nothing rather than offering baseball shirts. Being forgiving about *how*
someone says a thing is good. Being forgiving about *what* they asked for is how
you end up selling a hoodie to someone who wanted a hat.

### Still to write up

`check_stock` and the derived stock fields — `available_sizes`,
`sold_out_sizes`, `low_stock_sizes`, the pre-written `availability` sentence,
`valid_size`, and the decision to cap "only a few left" at three.
