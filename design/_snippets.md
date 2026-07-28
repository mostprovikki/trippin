# Build notes — the shared skeleton every page copies

Not a deliverable. This is the pattern I hold constant across all 22 pages so the set reads as one
product. If a page deviates it is a defect.

## Head

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PAGE · Tripper</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="system.css">
<link rel="stylesheet" href="overrides.css">
</head>
<body>
<span id="live" class="sronly" aria-live="polite"></span>
```

## Tail

```html
<div class="scrim" id="scrim"></div>
<script src="app.js"></script>
</body>
</html>
```

## Sample data — held identical on every page

**Trip: Vietnam & Cambodia 2026** · `active` · 6–15 Nov 2026 (10 days) · Vietnam & Cambodia ·
base INR · origin Bengaluru · tags: street food, temples, boats, photography, first-time SE Asia.

Six participants:

| Person | Home | Profile | Documents | Link |
|---|---|---|---|---|
| Asha Kumar | Chennai | confirmed | Passport exp 14 Mar 2032 | active |
| Meera Iyer | Bengaluru | confirmed | Passport exp 12 Jan 2027 → **warning** | active |
| Daniel Weiss | Berlin | confirmed | Passport 2031 · Cambodia e-visa exp 20 Nov 2026 → **warning** | active |
| Lena Hoffmann | Munich | confirmed | Passport 2029 | active, expires in 12 days |
| Ravi Menon | Bengaluru | not confirmed | none | active |
| Nikhil Rao | Mumbai | not confirmed | Passport exp 2 Nov 2026 → **expired** | revoked 14 Jul |

Expiry reference = trip end 15 Nov 2026; horizon = 15 May 2027.

**Budget** — trip totals, INR base:

| Category | Estimate | Basis |
|---|---|---|
| Primary transport | 1,68,000 | 6 × return BLR–HAN and REP–BLR, Nov fares |
| Secondary transport | 39,000 | 2 internal flights, 1 sleeper train, Grab everywhere |
| Stay | 1,08,000 | 9 nights × 3 twin rooms × ₹4,000 |
| Food | 57,600 | 10 days × 6 people × ₹960, street food led |
| Activities | 50,400 | Ha Long junk, Angkor 3-day pass, cooking class |
| Shopping | 36,000 | Hoi An tailoring, about ₹6,000 each |
| Leisure | 12,000 | one beach afternoon, one spa evening |
| Misc | 9,000 | buffer and visa-on-arrival fees |
| **Total** | **4,80,000** | |

Equal split ₹80,000 × 6. With Lena overridden to ₹64,000 (skips the Cambodia leg):
₹4,16,000 ÷ 5 = **₹83,200** each.

**Rates** — 1 EUR = 109.01 INR, as of 29 Jul 2026. 1 VND source: ECB has none.

| INR | ≈ EUR | ≈ VND (161-currency source) |
|---|---|---|
| 4,80,000 | €4,400 | ₫142,300,000 |
| 1,68,000 | €1,540 | ₫49,800,000 |
| 1,08,000 | €990 | ₫32,000,000 |
| 83,200 | €760 | ₫24,700,000 |
| 80,000 | €730 | ₫23,700,000 |
| 64,000 | €590 | ₫19,000,000 |
| 57,600 | €530 | ₫17,100,000 |
| 50,400 | €460 | ₫14,900,000 |
| 39,000 | €360 | ₫11,600,000 |
| 36,000 | €330 | ₫10,700,000 |
| 12,000 | €110 | ₫3,560,000 |
| 9,000 | €83 | ₫2,670,000 |

**Overdue tasks** (today 29 Jul 2026): Book the Ha Long junk (due 15 Jul, mine, 14 days) ·
Get Cambodia e-visas (due 20 Jul, Ravi, 9 days) · Confirm the Hoi An tailor (due 25 Jul,
unassigned, 4 days).

**Sibling trips:** Kerala Backwaters (idea, broad window Oct, 3 candidates) · Rajasthan in
February (planning, mid-chase) · Sri Lanka 2025 (archived, actuals recorded) · Goa New Year
(confirmed) · Bhutan someday (idea, empty).
