# Portable prompt

For any model or tool that cannot load skills — a plain chat window, an open-source model, a
different agent harness. Paste **Part A** as the instruction, paste the whole of
`template.html` after it, and fill in **Part B** with the trip.

Weak models do get a working counter and meter unaided. What they get wrong is quieter: an
unguided attempt at this page shipped 142 elements below 3:1 contrast (worst 1.11:1) because its
dark-mode rules recoloured text but hardcoded card backgrounds, dropped the day-by-day table for
cards, and gave counters to 8 items out of 54. Part A exists to stop that — the rule carrying most
of the weight is *edit only the data block*.

---

## Part A — instruction

```
You are given a complete, working HTML template for a trip packing page. It already implements a
day-by-day table, a tickable list, -/+ counters, a live luggage weight meter, two variant toggles,
light/dark theming and saved state.

YOUR TASK: return the same file with only its DATA block replaced, describing the trip below.

RULES — these matter more than anything else:
1. Edit ONLY the block marked "EDIT ONLY THIS DATA BLOCK" (the TRIP, DAYS, CATS and ITEMS
   variables). Do NOT rewrite, improve, reformat or "simplify" any HTML, CSS or JavaScript below
   the line marked "END DATA BLOCK". Copy all of it through byte for byte.
2. Do NOT write your own counter or weight-meter code, theming, or layout. It already exists and
   works in both light and dark. Rewriting it is how this task fails: hardcode one card colour and
   dark mode gives you light text on a light card, which no screenshot of your own theme reveals.
3. Return the ENTIRE file, opening <!doctype html> to closing </html>. No commentary, no
   markdown fences, no "...rest unchanged" placeholders.

FILLING THE DATA:
- g is grams EACH, never the total for a stack.
- q is {L: n, N: n} - the quantity under each of the two toggle variants.
- s is "a" for both variants, or one variant's key for items only that person packs.
- bag is "checked" (counts toward the target), "cabin" (counted separately), or "worn" (weighs
  nothing, you have it on).
- step: true gives an item a -/+ counter, and 0 then means not packing it. Give step: true to
  EVERYTHING you would carry more than one of - shirts, socks, underwear, trousers, sachets,
  cables. Use a plain checkbox only for a true one-off like a fleece or a passport.
- nice: true moves an item to the Optional block, starting at zero.
- Set TRIP.storageKey to something unique for this trip.
- Set TRIP.targetKg, TRIP.ceilingKg and TRIP.cabinKg from the stated allowance.
- Give the two toggles labels that suit the trip via TRIP.who and TRIP.plan. They are generic:
  men's/women's, summer/winter, carry-on-only/checked, adult/child.

WRITING THE CONTENT:
- One DAYS row per day. Put each day's dress code, activity and what to carry on that day's row -
  not in a separate section. feels is the FELT temperature (apparent, humidity-adjusted), which is
  what decides clothing; use a number, or a string like "34 -> 24" plus band: "cold"|"mild"|"hot".
- Mark at most one day with hi: true - the single most unusual day, if there is one.
- Open TRIP.lede on the constraint this trip actually has: the cold morning, the weight limit, the
  dress code. Not generic travel advice.
- Include the empty bag itself as an item. A hard trolley is 3-4 kg before anything goes in.
- Keep the tone matter-of-fact. Do not write alarming weather copy.
- Say which numbers are uncertain. Label any day beyond forecast range as an average.

BEFORE YOU FINISH, verify the arithmetic: for two or three categories, check the subtotal equals
the sum of g x quantity. Then confirm the default total lands under the allowance. State both
results in one closing line after the file.
```

---

## Part B — the trip

Fill in and append:

```
TRIP DETAILS
- Destination and route (each place, nights in each):
- Exact dates:
- Baggage allowance (checked and cabin are separate numbers):
- Who is packing (and any second variant worth a toggle):
- Fixed activities with a dress or kit implication (temples, beach, hiking, formal dinner, onsen):
- Any altitude stop, and its height:
- Known weather, felt temperatures if you have them:
- Laundry available mid-trip? Where and which day:
```

## Getting the weather without an API key

Open-Meteo needs no key. Ask for `apparent_temperature_max` — the felt figure, which at 90%
humidity runs 6–8 °C above the air temperature and is what actually decides clothing:

```
https://api.open-meteo.com/v1/forecast?latitude=21.03&longitude=105.85
  &daily=temperature_2m_max,apparent_temperature_max,precipitation_sum,relative_humidity_2m_mean
  &timezone=auto&forecast_days=16
```

Add `&elevation=3143` for a summit or pass. A grid forecast reports the valley, and an altitude stop
can run 20 °C colder than the town below — usually the only reason a hot-country list needs a
fleece. Beyond ~16 days there is no forecast: use
`https://archive-api.open-meteo.com/v1/archive` for the same dates in past years and label those
days as averages.

`weather.py` in this folder does all of the above.
