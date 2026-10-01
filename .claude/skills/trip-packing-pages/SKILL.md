---
name: trip-packing-pages
description: Use when turning a trip, itinerary, or travel plan into a shareable page — a packing list or checklist, a day-by-day what-to-wear brief, a luggage weight budget, or a single-file HTML trip guide to send to fellow travellers.
---

# Trip Packing Pages

A packing page is a **tool people operate while packing**, not a document. Four moving parts: a
day-by-day brief, a tickable list, `−/+` counters on anything you carry several of, and a weight
meter totalling the selection against the airline allowance.

**Core principle: never hand-write the machinery.** Copy `references/template.html` and edit only
its DATA block. Counters, meter, toggles, table, theming and persistence already work — and the
interesting failures here are the ones nobody eyeballs. An unguided attempt at this same page
shipped **142 elements below 3:1 contrast, the worst at 1.11:1**, because its dark-mode query
recoloured text but left card backgrounds hardcoded light. It also dropped the day-by-day table for
cards and gave counters to only 8 of 54 items.

**Not for:** prose travel guides with no list to operate, or booking/expense trackers.

## Workflow

1. **Pin the facts** — dates, each place and its nights, baggage allowance (checked and cabin are
   separate numbers), who is packing. Ask if the allowance or traveller is unclear.
2. **Fetch weather**, never recall it: `python3 references/weather.py --help`. Quote **apparent
   ("felt") temperature** — at 90% humidity a 33 °C day feels like 41 °C, and felt is what decides
   clothing. Pass `--elevation` for a summit or pass: a 3,000 m stop can run 20 °C colder than the
   town below and is usually the only reason a hot-country list needs a fleece. Past ~16 days use
   `--climatology` and label those days as averages.
3. **Copy the template**, edit only the DATA block. Schema is documented in comments there.
4. **Read the self-check banner** the page prints on load — stale allowance, unedited
   `storageKey`, under-used counters, orphaned categories, missing quantities. Empty banner is gate
   one. Delete the `selfCheck` block when final.
5. **Run `references/gate.js`** in the console — counters, focus, sideways scroll, contrast.
   Re-run it after flipping your OS appearance: contrast bugs live in the theme you are not using.

## Item schema

| Field | Meaning |
|---|---|
| `g` | grams **each**, not the total for a stack |
| `q` | `{L: n, N: n}` — quantity under each toggle variant |
| `s` | `"a"` both variants · one variant's key for items only that person packs |
| `bag` | `"checked"` counts to the target · `"cabin"` counted separately · `"worn"` weighs nothing |
| `step: true` | gives it a counter; **0 means not packing it** |
| `nice: true` | moves it to the Optional block, starting at zero |

**Give `step: true` to everything you would carry more than one of** — shirts, socks, underwear,
trousers, sachets, cables. A checkbox suits only a true one-off like a fleece or passport.
Under-using it is the most common miss.

Both toggles are generic: relabel `TRIP.who` and `TRIP.plan` for men's/women's, summer/winter,
carry-on-only/checked, adult/child. A single-option axis hides itself.

## Common mistakes

| Mistake | Why it bites |
|---|---|
| Writing counter/meter JS from scratch | Contrast, focus and theming break in ways a screenshot passes. |
| Re-rendering the list on each click | Destroys the button mid-press, throwing focus to the top. Patch the row in place. |
| Updating the allowance chip but not `TRIP.targetKg` | Header said 20 kg, meter still measured 15. Every verdict wrong. |
| Recolouring text for dark mode but hardcoding card backgrounds | Light text on light cards. Change **only token values** per theme. |
| Day-by-day as cards, not a table | Wear/feet/bring stop being comparable across days, which is the point. |
| `g` as the stack total | Weights come out N× too high. |
| Air temperature instead of felt | Under-packs sun, over-packs layers. |
| Forgetting the empty bag | A hard trolley is 3–4 kg before anything goes in. |
| Cotton in a humid climate | Above ~85% humidity it won't dry overnight, so the quantities are wrong. |
| One `storageKey` for two trips | Second page inherits the first's ticks. |

## Writing it well

Open on the constraint the trip actually has — the cold morning, the weight limit, the dress code —
not generic advice. Put dress codes, swim days and laundry days **on the day they apply**, in the
table. Mark climatology days as averages and elevation figures as calculated; confident wrong
numbers are what people remember. Keep the tone matter-of-fact — alarming weather copy makes the
page harder to use.

For a plain chat window or a model without skill support, `references/PROMPT.md` carries these rules
as a paste-in prompt to send with the template.
