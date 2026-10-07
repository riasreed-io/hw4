# Design — Old Campus

Campus Customs sits at 57 Broadway, one street from Old Campus, and has been
there since 1975. The site now looks like that: carved stone, parchment, brass,
and ivy on the walls. The point is not decoration. A shop that has been on the
same block for fifty years should not look like a template, and looking
established is what makes a $98 fleece feel like a reasonable price.

---

## Type: three faces, each doing one job

**Cinzel** for every heading, button and label. It is cut from Roman
inscriptional capitals — the lettering carved over a gate — so headings read as
masonry rather than as web text.

**Cormorant Garamond** for body copy at 17.5px. A book face, generously leaded.
Product descriptions now read like a catalogue entry instead of UI text.

**UnifrakturMaguntia** — actual blackletter — used in exactly two places: the
"Yale Bulldog Blue" line under the wordmark, and the illuminated initial that
opens the About page. Blackletter is close to unreadable in quantity, so it is
rationed to the two spots where it signals age in a single glance.

**Why it helps:** type is the fastest signal of whether a shop is real. Three
coordinated faces with clear jobs reads as a brand with a history; a single
system sans reads as a project.

---

## Colour: a hierarchy with only one accent

Nothing on this site is `#ffffff`. The ground is parchment `#faf7f0` over a
drawn limestone grain, so the page has the warmth of paper under a lamp.

The hierarchy is deliberately shallow so that one colour can do all the work:

| Role | Colour | Where |
|---|---|---|
| Structure | Yale navy, deepened to `#002147` | Nav, footer, hero, primary buttons |
| **Attention** | **Aged brass `#c9a227`** | **Prices, the primary call to action, active state, every rule** |
| Ground | Parchment and limestone | Page, cards, panels |
| Life | Ivy green | The vines only |

**Gold means money or action, and nothing else.** Every price on the site is
gold; so is "Shop the catalogue"; so is the rule under each section heading.
Because it is never spent on decoration, a shopper's eye lands on the price and
the buy button without being told to.

**Why it helps:** one accent used consistently is worth more than five used
prettily. It means the thing we want clicked is always the brightest thing on
the screen.

---

## Gothic architecture, built from CSS

No images were added. Every architectural element is drawn:

- **Product cards are lancet windows.** The image sits in a pointed arch made
  with an elliptical `border-radius` on the top two corners. On hover a small
  gold lozenge appears at the crown of the arch — a keystone — and the garment
  scales up 5.5% behind the frame.
- **A traceried window in the hero**: a pointed arch with two sub-lancets, a
  quatrefoil in the head, mullions and a sill, in gold line at 32% opacity.
  Inline SVG, about 20 path commands.
- **Category tiles are niches**, the same arch at a smaller radius.
- **Masonry courses** across the hero, drawn with two repeating gradients.
- **Double-rule borders in brass** above the footer and below the nav, the way a
  title page is ruled.
- **An illuminated initial** opening the About page.

**Why it helps:** the arch repeats at four scales — hero window, product card,
category tile, product page frame — so the whole site feels built rather than
assembled. That coherence is what makes a storefront feel permanent, and
permanence is what makes a shopper willing to hand over a card.

---

## Ivy that grows as you read

Two vines climb the left and right margins. Each is an SVG path whose stroke is
revealed with `stroke-dashoffset`, tied to scroll position — **the ivy grows up
the page as you scroll down it**, the way it grows up a wall over years. Leaves
are three-lobed and unfurl individually, each one opening just after the stem
reaches its height.

It starts 42% grown so the page is never bare, reaches the top before the
footer, thins on narrow screens and disappears below 660px where the margins do.
It is `aria-hidden`, `pointer-events: none`, and freezes fully grown for anyone
who has asked for reduced motion.

**Why it helps:** it rewards scrolling with something that visibly responds, and
it is the Ivy League in one image without ever saying the words.

---

## Motion: restrained, and it respects the setting

- Sections fade and rise 22px as they are scrolled to (IntersectionObserver).
  Anything already on screen at load shows instantly — nothing below the fold
  can get stranded invisible.
- Product images scale behind their arch on hover; the keystone fades in.
- Nav underlines grow outward from the centre, like a rule being ruled.
- The chat panel unfurls from its bottom-right corner.
- **Every one of these is cancelled by `prefers-reduced-motion`.**

---

## Handsome Dan, and a bark

**The cursor is Handsome Dan** — the Yale bulldog, drawn as inline SVG with
folded ears, a heavy brow, a white muzzle and a navy collar with a brass tag. It
is a data URI, so there is no asset to load and no flash of the default arrow.

**Clicking barks.** The bark is synthesised in the Web Audio API rather than
shipped as a file: a sawtooth that falls 340Hz → 108Hz in 130ms for the voice, a
square underneath for the chest, both through a bandpass filter sweeping
1150Hz → 420Hz — the formant sweep is what makes it read as an animal rather
than a beep — plus a 50ms filtered noise burst for the breath at the front.
About forty lines of maths, no megabyte of audio.

**Both are switchable, and the choice persists.** The control is a Dan button in
the nav bar, where it can actually be found. Two independent toggles: follow my
cursor, bark when I click. Stored in `localStorage`.

Three details that keep it from becoming the thing people hate about the site:

1. **It never barks on a text input.** A dog yapping while you type your
   password is the fastest way to lose a signup.
2. **It never barks on its own toggle.** Barking at someone turning barking off
   would be a cruel joke.
3. **A failed audio context is swallowed.** A sound effect must never be the
   thing that breaks a click.

**Why it helps:** it is the one part of the site people will mention to someone
else, and a shop people describe to a friend is a shop that gets visited. The
toggle is what makes that safe — delight that cannot be switched off stops being
delight at about the tenth click.
