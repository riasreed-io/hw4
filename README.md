# Campus Customs

A Yale apparel storefront with an AI shop assistant, built for MGT 409 Homework 4.

React + Vite + TypeScript on the front, FastAPI on the back, a PydanticAI agent
in the middle, SQLite underneath. The assistant answers questions about price,
colour and stock by querying the store database — it is not allowed to guess any
of them.

---

## 1. Place the data pack

**The database and product images are not in this repo** and never will be.
Download `data.zip` and unzip it into the root of this folder, so that you have:

```
hw4/
└── data/
    ├── campus_customs.db       # catalogue, inventory, users, chat_messages
    └── products/               # 102 product images
```

Nothing will run without this. `/api/health` will tell you if the database is
missing.

## 2. Add your API key

```bash
cp .env.example .env
```

Then open `.env` and put in your own `PORTKEY_API_KEY` (or `OPENAI_API_KEY`).
`.env` is gitignored.

## 3. Run the backend

From the repo root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Then start it **from inside `backend/`**:

```bash
cd backend
uvicorn main:app --reload --port 8000
```

Check it with <http://localhost:8000/api/health> — it reports the product count
and which model is configured (never the key itself).

## 4. Run the front end

In a second terminal, from the repo root:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Open <http://localhost:5180>.

> Vite uses 5180 rather than the default 5173, which was taken on the machine
> this was built on. If you need a different API origin, set `VITE_API_BASE`.

## 5. Log in

The data pack ships with a test account:

```
test@campuscustoms.yale.edu  /  password
```

Or create your own from **Create account** — signup writes to the `users` table
with a salted PBKDF2 hash.

---

## Layout

```
hw4/
├── AI_prompts.md            Log of what was typed into the vibe coder
├── requirements.txt
├── .env.example
├── .gitignore
├── README.md
├── frontend/                Vite React TypeScript app
│   └── src/
│       ├── api.ts           Typed client for the backend
│       ├── AuthContext.tsx  Session state
│       ├── components/      NavBar, ProductCard, ChatPanel, FilterBar,
│       │                    Ivy, HandsomeDan, PrivacyPanel, …
│       └── pages/           Home, Products, ProductDetail, About, Login, …
├── backend/
│   ├── main.py              FastAPI app — run with: uvicorn main:app --reload --port 8000
│   ├── agent.py             The agent: instructions, tools, one-turn runner, audit
│   ├── tools.py             Model setup and the catalogue lookups
│   ├── models.py            Pydantic types for the API and the agent
│   ├── prompts/
│   │   └── prompt.md        The agent's system prompt — voice, tools, safety
│   ├── auth.py              Password hashing, signup/login, sessions
│   └── db.py                SQLite access, category/colour normalisation
└── output/
    ├── harness.md           How the whole system works
    ├── design.md            The Old Campus visual design
    ├── usability.md         The four usability improvements
    ├── app_check.html       Live-site test report (double-click to open)
    ├── app_check_images/
    └── audit_trail.json     Append-only agent-loop audit (JSON Lines)
```

**The agent is four files under `backend/`:** `prompts/prompt.md`, `agent.py`,
`tools.py`, `models.py`.

---

## API

| Route | What it does |
|---|---|
| `GET /api/health` | Product count and the configured model |
| `GET /api/facets` | Every filter value with a live count |
| `GET /api/categories` | The six normalised garment categories |
| `GET /api/products?category=&collection=&color=&size=&price_band=&q=&in_stock=` | The catalogue, filtered |
| `GET /api/products/{id}` | One product plus per-size stock |
| `GET /api/products/{id}/related` | "More like this" |
| `GET /images/{file}` | Product photos from `data/products/` |
| `POST /api/auth/signup` · `/login` · `/logout` · `GET /api/auth/me` | Accounts |
| `POST /api/chat` | One turn with the assistant → `{ reply, products[], match_label }` |
| `GET /api/chat/history` | A signed-in shopper's saved conversation |
| `POST /api/views/{id}` · `GET /api/views/recent` | Recently viewed |
| `GET/PUT /api/preferences` · `POST /api/preferences/forget` | Privacy controls |

---

## Notes worth knowing

**The agent cannot invent a price.** It returns `product_ids`; every card is
rebuilt from `catalogue` and `inventory` afterwards. An id it did not look up is
dropped before anything renders.

**`catalogue.garment_type` is dirty** — 22 spellings of about six categories. So
`db.categorize()` normalises it. Matching the raw column would return 5 hoodies
instead of 27.

**Every request gets its own SQLite connection** (`db.session()`). A shared one
raises `InterfaceError` as soon as two agent tool calls run at once.

**Shoppers can switch off what the site remembers**, from the footer. Switching
it off deletes what is already stored, rather than only stopping collection.

Full write-up in [`output/harness.md`](output/harness.md).
