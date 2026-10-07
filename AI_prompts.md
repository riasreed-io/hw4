# AI Prompts Log — Homework 4: Campus Customs

A running log of what I typed into my vibe coder while building this project.
One section per problem, in the order I worked them. Prompts are recorded as I
typed them, typos and all.

Evidence for this assignment is the running site, the database writes, and the
screenshots. This file is the prompt record, not a separate write-up.

---

## Problem 0 — Setup

**Prompt:**

> im doing homework 4. i need a new folder do /folder-joke to prove we're working in a new folder and then we will get started

**Prompt:** (with the scenario screenshot and `data.zip` attached)

> thi sis the scenario. and ive uploaded the zip

**Result:** Created `homework 4/`, unzipped the data, and inspected
`campus_customs.db` — `catalogue` (102 products), `inventory` (612 size rows),
`users` (3), and a `chat_messages` table with a `products_json` column.
102 product images in `data/products/`.

No follow-up needed.

---

## Problem 1 — Vibe Coder Prompts

**Prompt:**

> problem 1: vibe coder prompts
>
> create AI_prompts.md at the start of the assignmen d an dkeep it updates as i work, the file is the log what i typed into the vibe coder
>
> put one section for each problem, each section must inclide:
>
> * the problem number and title
> * at least one prompt i typed, in my own words as much as possible
> * one follow up prompt if i needed it (and one sentence on what was lacking after the first)
>
> my running site, database writes, ands creenshots are the evidence, i do not need an extra proof essay beyond these prompts

**Result:** Created this file with the structure above and backfilled the setup
prompts from before the problem list started.

No follow-up needed.

---

## Problem 2 — Analyze the Database

**Prompt:**

> problem 2: anaylze the database
>
> look at the database data/campus_customs.db and understand the fields of each table. at a minimum i should understand catalogue, inventory, and users.
>
> start the file output/harness.md. write down each table and its fields, and one short line of why each field matters for the shop or the chatbot.
>
> i will keep gorwin this harness file in the later problems( models, tools, safety, specs).
>
> present to me this information in a way that i can make these comments. i need to see or visualize or skim through this information and i iwll make my comments to include in problem 2 information

**Result:** Profiled all five tables (`catalogue`, `inventory`, `users`,
`chat_messages`, `sqlite_sequence`) — row counts, distinct values, null counts,
JSON array shapes, stock distribution, and foreign-key integrity. Wrote
`output/harness.md` with a field-by-field table per table plus a "things that
will bite us" list, and stubbed the Models / Tools / Safety / Specs sections for
later problems. Reviewed the findings visually before commenting.

**Follow-up prompt:**

> so for my comments, the products are important so the customer is understood on what is ebing discussed, price is important data point for customers too, i think colors are important adn garmet types because customers might have information on that, as well as names so that the chatbot can undertand what is being referred to, in addition to whatever you think might be good to add as well

**What the first prompt was missing:** the first pass produced the full field
inventory but not the judgment about which fields a shopper actually leans on —
that ranking had to come from me, and the harness needed my comments in it.

**Result:** Added a "My notes" section to `output/harness.md` with my reasoning on
product identity, price, colors, and garment type, plus additions for `quantity`,
`search_tags`, `image_file_path`, user identity, and `products_json`, and a note
flagging `garment_type` as a silent-failure trap.


## Problem 3 — Build the Campus Customs Website

**Prompt:**

> problem 3, build the campus customs website
>
> scaffold a react + vite + typescript front end for campus customs. put a nav bar at teh top that links to the main pages:
>
> * home
> * products
> * about us
> * log in
> * create account
>
> pull campus customs-style working from https://yalebulldogblue.com/ for home and about us, but write these pages in my own voice (do not copy the original site text).
>
> on the products page, show product images from the catalogue (use the image paths in teh database) with basic product info (name, price, short description)
>
> make each product open a single-item page (large image on one side, full product text on the other - description, price, sizes/stock when you have them). clicking a card on products should take the shopper there.
>
> add a chat interface in the bottom right of the site (a floating chat panel is fine. it does not need to talk to an agent yet - a stub that will call your backend later is enough for my problem
>
> i will need a small API soon to read the database. it is fine to start a simple FastAPI app in backend/main.py just to serve products and images, then grow it into the agent backend in Problem 5.

**Result:** Researched yalebulldogblue.com and Campus Customs' history for tone
and facts, then wrote original copy for Home and About. Built `backend/db.py`
and `backend/main.py` (FastAPI) serving `/api/categories`, `/api/products`,
`/api/products/{id}` and the product images at `/images`. Scaffolded the Vite +
React + TypeScript front end with a navy nav bar, Home, Products (category chips
and search), single-product pages with per-size stock, About, Log in, Create
account, and a floating chat panel that already POSTs to `/api/chat`. Verified
every page in the browser. Added `.gitignore` so the database and images stay
out of the repo.

No follow-up needed.


## Problem 4 — Create Account and Login

**Prompt:**

> problem 4: create account and login
>
> build a normal create-account / login flow
>
> create account: first name, last name, email, password (confirm password is a nice touch)
> log in: email and password
>
> new accounts go into the users table. make sure to store passwords securely so no hackers (humans or AI) cannot access them.
>
> the seed database already has a test user you can use while building:
>
> email: test@campuscustoms.yale.edu
> password: password
>
> confirm you can log in as that user, and that a brand new account you create aslso works
>
> update output/harness.md with how auth works (what you store for a suer and how passwords are protected)

**Result:** Reverse-engineered the seeded hash as PBKDF2-HMAC-SHA256 with a
per-user salt at 120,000 iterations, then built `backend/auth.py` to match that
exact format so the provided test account and new accounts share one verify path.
Added `/api/auth/signup`, `/login`, `/logout` and `/me` with an `HttpOnly`,
`SameSite=Lax` session cookie whose token is stored only as a SHA-256 in a new
`sessions` table. Wired `AuthContext` into the React app so the nav bar greets
the signed-in shopper and offers log out. Confirmed through the browser: the
seeded user logs in, a new account written through the signup form persists to
`users`, the session survives a reload, logout clears it, a wrong password is
rejected, and the new account logs back in. Documented all of it in
`output/harness.md` section 2.

No follow-up needed.


## Problem 5 — PydanticAI Agent Backend

**Prompt:**

> problem 5: pydanticAI agent backend
>
> build the shop chatbotu as apydanticAI agent behind fast API, plugged into my front-end chat widget. put the aPI app in backend/main.py - that is the file i run with uvicorn. keep the agent as these four files next to it (same idea as homework 3)
>
> * backend/prompts/prompt.md - system prompt (grow this same file later
> * backend/agent.py
> * backend/tools.py
> * backend/models.py
>
> in main.py, expose a chat route so a message from the website returns a reply from the agent (and whatever else i need for products/auth). i will need my ai model api key for the agent
>
> put campus customs voice and safety basics into prompts/prompt.md (i will expand tools and safety later). start or update types in models.py for chat replies/product cards as needed.
>
> in output/harness.md, note how the front end talks to FastAPI and how the agent is loaded (prmoot file+model)
>
> make sure the backend runs from the backend/ folder like this uvicorn main:app --reload --port 8000

**Result:** Built the agent across the four files. `prompts/prompt.md` holds the
Campus Customs voice and the safety rules, with the tool-grounding rule first.
`models.py` gained `AgentAnswer`, `ChatRequest`/`ChatResponse`, `ProductCard` and
the tool result types. `tools.py` builds the model from `PORTKEY_API_KEY`
(`gpt-5.6-luna` via Portkey, falling back to OpenAI) and holds three SQLite
lookups: `search_products`, `get_product`, `check_stock`. `agent.py` loads the
prompt from disk each run, attaches the tools, and returns both the answer and
the set of product ids a tool actually produced. `main.py` exposes `POST /api/chat`
and `GET /api/chat/history`, persisting both turns to `chat_messages` for
signed-in shoppers. The chat panel now renders real product cards that link to
the product page. Verified every answer against the database: hoodie count,
gym shorts refusal, pink refusal, per-size stock, the cheapest jacket, Handsome
Dan, and two attempts to pull the agent out of role.

No follow-up needed.


## Problem 6 — Tools: Product Info and Stock

**Prompt:**

> problem 6: tools product info and stock
>
> give the agent tools that look up real information from campus_customs.db
>
> * product description
> * price
> * how many are in stock (by size when the customer asks)
>
> the agent must use the database - it shoudl not invent prices and quantities. if a size is out of stock, say so clearly
>
> expand prompts/prompt.md so the agent knows to call these tools for price and stock questions. add or update return types in models.py
>
> in output/harness.md, list each tool and explain which model fields you chose for look up results and why
>
> give me the list of the things i need to make descriptions on and why i might consider them so i can then put this info into the out put harness thing

**Result:** Expanded the return types with derived fields that replace inferences
the model would otherwise make: `in_stock` on every size, `available_sizes`,
`sold_out_sizes`, `low_stock_sizes`, a pre-written `availability` sentence,
`colors_known` (empty colours means unrecorded, not "any colour"), and
`valid_size` (a size we don't make is a different no from a size that's sold
out). Added a "Your tools, and when you must use them" section to
`prompts/prompt.md` requiring a tool call for every price, stock, description
and colour question. Found and fixed a real bug along the way: the original
strict AND search returned zero for "Berkeley 1/4-zip", so the agent told a
shopper we don't carry a product that's in the catalogue at $72 — replaced with
token scoring, now passing 24/24 in-scope and out-of-scope queries. Wrote
harness section 4 with each tool's fields and the reasoning behind them.

**Follow-up prompt:**

> so for the output harness thing each tool and eplain which model fiels i chose for look up results and why
>
> lets start with
>
> * a product search so that a customer can search for something and the bot knows how to find it
> * somethign that knows the product facts so that a chat bot can answer questions about it
> * best match filtering and token scoring so that a customer doet need to mention an item verbatim each time and it can recognize more like what someone might morw natuarally refer to it as

**What the first prompt was missing:** section 4 explained the field choices in
my build voice, but the harness also needed my own reasoning about why each tool
exists from the customer's side — that framing had to come from me.

**Result:** Added "My notes on the tools (Problem 6)" to `output/harness.md`
covering the product search, the product-facts lookup, and best-match filtering
with token scoring, in my own framing. `check_stock` and the derived stock
fields are flagged as still to write up.


## Problem 7 — Chat Search That Updates the Page

**Prompt:**

> problem 7: chat search that updates the page
>
> now we will add a neat feature, when a custer asks about a type of item - for example what hoodies do i have, the agent should search teh catalogue and the website should dynamically show those matching items as product cards (image, name, price, short info). this is an API contract: the agent returns structured product matches and then the front end renders them on the website. it looks cool
>
> after the dynamic product cards ar loaded by my new feature, make sure the same isngle item page behavior i build in problem 3 still works: each product card including the ones the chat just put on the page, should still open that detail view (large image and full info) when clicked
>
> update prompts/promt.md and output/harness.md so it is clear how search resutls reach the page

**Result:** Formalised the contract — `POST /api/chat` now returns
`{ reply, products[], match_label, persisted }`, where `products[]` is rebuilt
from SQLite after the agent chooses ids, and `match_label` comes from a new
`showcase_label` field on `AgentAnswer`. Added `ChatResultsContext` and
`ChatResultsBand`, which renders the matches above the page content using the
*same* `ProductCard` component as the catalogue grid — so a chat-created card
opens the same detail view by construction, not by coincidence. Updated
`prompts/prompt.md` with a section explaining that `product_ids` put products on
the page. Found and fixed a concurrency bug in the process: the app held one
shared SQLite connection, which raised `InterfaceError` as soon as the agent
fired parallel tool calls — now every request and every tool opens its own via
`db.session()`.

No follow-up needed.


## Problem 8 — Customer Memory

**Prompt:**

> problem 8: customer memory
>
> when a shopper is logged in, save their chat histoy in the database in an apporpirate table and reload it when they return, the agent should know hwo is hcatting (name,email) put atht agent feps (or an queiivalnet clear pattern and/or tools the agent can call.
>
> Allso pas enoguh apge context atht if someone is on a product page, and asks "do you have thsi in pink? " the agent know swhich item tehy mean: hint: you cna put code into the agent context
>
> guest can still chat, but history only needs to presist for logged in users
>
> Document in output/harness.md how user chat history is stored, what customer fields the agent see,s and how page context is passed

**Result:** Added `CustomerContext` (signed_in, first_name, full_name, email —
never `password_hash`) and `PageContext` (path, product_id, category,
search_query), both carried on `ChatDeps` and rendered into the agent's
instructions as separate per-request blocks. `usePageContext()` derives the
context from the router so it cannot drift from what is on screen. Every field
from the browser is validated before it reaches the prompt: product ids are
looked up in the catalogue, paths are mapped through a fixed dictionary,
categories are checked against the real list, and the search box is quoted and
labelled as data. Confirmed "do you have this in pink?" resolves on a product
page and asks "which product?" without one, that history survives a completely
fresh login with no client-sent history, that guests write zero rows, and that
injection attempts through the URL path and the search box both fail.

No follow-up needed.


## Problem 9 — Usability Improvements

**Prompt:**

> problem 9: usability improvemnents
>
> now that the core shop words, improve it, chose and implement:
> 2 front end usability improvements
> 2 agent/backend usability improvement
> [...]
> so before doing any of this, sho wme the site so i can test run it. and then give me a list of options that i can consider for improvements, i will come with my own ideas, then i will choose 2 and 2 to make the improvements, do this first then we can implement

**Follow-up prompt (my choices):**

> for front end, i want a bar that lets you filter more easily, by size, style, mens/womens, etc adn all thso ecategories bc right now i just see them categorized by type of garment.
>
> i also want to put a price filter so that people can filter by price
>
> these will help the user in navigating to their desired end product much faster, this will make the user experience much nicer and wil laloow people to spend less time shopping and more time actually finding things they want to buy
>
> i also want a related products so that people who are shopping can see a related or similar item and look into purchasing it rather than going back to the group of items. i believ e this will result in higher sales and more profits
>
> for the back end, i want the messenger/chat to pop up unprompted and ask a question something that will invite the user to chat, something taht says something like what can i help you with? or something like that so that the user knows better that a chatbot is
>
> and also i want somethign that will track what the user looks at, and then can then recommend something like. are you still looking at this? or are you interested in this item again kind of thing, ths iwll try to secure purchases that werent a actually completed yet, this will convert previous interest into future profits

**What the first prompt was missing:** the options list was mine; which four to
build had to be my call, and the reasoning about why each helps the shopper or
the business is what the write-up is graded on.

**Result:** Built all four and wrote `output/usability.md`. Front end: a
five-facet filter bar (garment, collection, size, colour, price) with live
counts, URL-backed state and removable pills, plus loading skeletons; and a
"More like this" row on every product page. Backend: an unprompted chat opener
generated by the same agent with the same catalogue tools, written for the page
the shopper is on; and `product_views` tracking with a `recently_viewed` agent
tool and a "Pick up where you left off" row. Dropped the planned mens/womens
facet after checking the data — only 3 of 102 products carry a gender label and
none carry a women's one — and substituted Collection, which classifies all 102.
Fixed two silent bugs found along the way: a StrictMode double-mount that stopped
the opener firing in dev, and "crew" matching "crewneck" in the collection
classifier.


## Problem 10 — Style the Website

**Prompt:**

> problem 10: style the website
>
> Add createive design so the site feels like a real campus customs storefront - fonts, color heirharchy, motion prodcut presentaiton and chat feel
>
> you will get more points for imaginative and innovative design
>
> write output/design.md: waht i changed an why it shoudl help customers stcik around and buy. keep ti concrete and short
>
> for this, i want to style this in super old gothic architecture kind of vibe, i want it to feel like old campus of yale campus and playing into the ivy league stly.e i also want ivy kind of foliage on the page crawling up the webpage. thi sis to make the branding more established and aligned with teh ivy league brand, which iwll help boost interests and sales
>
> i also wan tthe cursor to be somethign related to yale, maybe a bulldog. you cansurprise me, this will make it fun. and when you click, it can be a bark sound. this is createive and will bring people interest. you should laso allow for user to turn it off so that it doent get too annoying tohugh

**Result:** Rebuilt the site as Old Campus. Three typefaces with distinct jobs:
Cinzel (Roman inscriptional caps) for headings, Cormorant Garamond for body, and
real blackletter rationed to two places. Parchment ground over a drawn limestone
grain, navy structure, and aged brass as the single accent reserved for prices
and calls to action. Gothic architecture drawn entirely in CSS and inline SVG -
product cards are lancet windows with a keystone that appears on hover, the hero
carries a traceried quatrefoil window, category tiles are niches, and the About
page opens with an illuminated blackletter initial. Ivy climbs both margins as
two SVG vines whose stroke is revealed by scroll position, so the ivy grows up
the page as you read down it. Handsome Dan is the cursor, drawn as inline SVG,
and clicking produces a bark synthesised in the Web Audio API - a falling
sawtooth through a sweeping bandpass plus a noise burst, no audio file. Both are
switchable from a Dan menu in the nav and the choice persists; it never barks on
a text input or on its own toggle. Everything motion-related is cancelled by
prefers-reduced-motion. Wrote `output/design.md`.

No follow-up needed.


## Problem 11 — Site Testing (App Check)

**Prompt:**

> problem 11: site testing (app check)
>
> Test the live site and document it in output/app_check.html (a page you can double click open). include clear screenshots and short captsion for
>
> 1. chat checking the inventory level of an item (honet stock/price from the DB)
> 2. the dynamic search result cards appearing after a category question (eg hoodies)
> 3. one of the ubsility features you added in problem 9
>
> make the html easy to grade: heading for each check, screenshot, on eor two sentnece on what the screenshot proves
>
> put the screenshot image ifles in output/app_check_images/ and link them from app_check.html with relative paths (for example app_check_images/invesntory.png).
>
> okay here are the screenshots of 1-3.

**Result:** Saved the five screenshots to `output/app_check_images/` (converting
the two WebP files to PNG) and built `output/app_check.html` — a self-contained
page in the site's own Old Campus styling that opens by double-click. Three
numbered checks, each with a heading, the screenshot, one or two sentences on
what it proves, and a table checking the numbers in the screenshot against the
database. Two extra sections are clearly labelled as not part of the required
three. Every figure verified: 27 hoodies, all six prices, stock totals 60–80,
Crewnecks 29, and the three related crewnecks at $58 with 60/71/17 units.
Confirmed the page renders and all five images load.

No follow-up needed.

