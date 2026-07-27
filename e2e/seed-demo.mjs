// Populates the LIVE running app with rich, realistic demo data so every UI
// screen looks full in screenshots. Talks to the real HTTP API only — no direct
// SQLite writes. Assumes the server is already up on BASE (default :43101).
//
//   node e2e/seed-demo.mjs
//
// Idempotent-ish: people/trips/goals/candidates are matched by name and reused,
// budget lines upsert, itinerary is replaced wholesale, checklists with a
// managed name are dropped and rebuilt, participant links are re-minted (the
// link endpoint revokes the previous one itself). Re-running converges on the
// same shape. It never deletes anything it does not own by name.

const BASE = process.env.SEED_BASE || 'http://127.0.0.1:43101'
const API = `${BASE}/api`
const ORGANIZER = { email: 'demo@tripper.dev', password: 'tripper1234' }

// The pre-existing empty "Vietnam" trip — enriched into the flagship rather
// than left as a confusing duplicate.
const EXISTING_VIETNAM_ID = '8da9c5b4-b32a-4af7-984f-26258638afa0'

let COOKIE = null

async function req(method, path, { body, form, token, raw } = {}) {
  const headers = {}
  if (COOKIE && !token) headers.Cookie = COOKIE
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload })
  const text = await res.text()
  let json = null
  if (text) { try { json = JSON.parse(text) } catch { json = text } }
  if (!raw && res.status >= 400) {
    throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  }
  return { status: res.status, json, headers: res.headers }
}

const GET = (p, o) => req('GET', p, o)
const POST = (p, body, o) => req('POST', p, { body, ...o })
const PUT = (p, body, o) => req('PUT', p, { body, ...o })
const DEL = (p, o) => req('DELETE', p, o)

function log(...args) { console.log(...args) }

// ---------------------------------------------------------------- dummy files
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)
const MINI_PDF = Buffer.from(
  `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 420 595]>>endobj
trailer<</Root 1 0 R>>
%%EOF
`,
  'utf8',
)
const fileBlob = (kind) => kind === 'png'
  ? new Blob([PNG_1PX], { type: 'image/png' })
  : new Blob([MINI_PDF], { type: 'application/pdf' })

// ------------------------------------------------------------------ auth
async function login() {
  const res = await POST('/auth/login', ORGANIZER)
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')]
  const session = setCookies.find((c) => c && c.startsWith('tp_session='))
  if (!session) throw new Error('no tp_session cookie on login')
  COOKIE = session.split(';')[0]
  log(`· logged in as ${res.json.organizer.email}`)
}

// ------------------------------------------------------------------ people
// NOTE: the persons table/API has NO date_of_birth and NO passport_number /
// passport_expiry columns (see server/src/routes/people.routes.js FIELDS).
// Passport numbers + expiry dates live on DOCUMENTS instead (doc_number /
// expiry_date), which is where this script puts them.
const PEOPLE = [
  {
    name: 'Asha Kumar', // pre-existing row — enriched in place
    phone: '+91 98410 22187', email: 'asha.kumar@gmail.com',
    emergency_contact: 'Lakshmi Kumar (mother) +91 98400 71120',
    dietary: 'veg', allergies: 'Peanuts (mild)', medical_notes: 'Carries an inhaler for dust allergy',
    pace: 'moderate', interests: ['temples', 'street food', 'photography', 'markets'],
    budget_band: 'medium', home_city: 'Chennai',
  },
  {
    name: 'Ravi Menon',
    phone: '+91 99860 44012', email: 'ravi.menon@outlook.com',
    emergency_contact: 'Divya Menon (wife) +91 99860 44013',
    dietary: 'non_veg', allergies: null, medical_notes: null,
    pace: 'packed', interests: ['hiking', 'scuba diving', 'craft beer', 'motorbikes'],
    budget_band: 'high', home_city: 'Bengaluru',
  },
  {
    name: 'Priya Iyer',
    phone: '+91 90040 66591', email: 'priya.iyer@zoho.com',
    emergency_contact: 'Sundar Iyer (father) +91 90040 66500',
    dietary: 'vegan', allergies: 'Shellfish, dairy', medical_notes: 'Motion sickness on boats — needs meds',
    pace: 'relaxed', interests: ['yoga', 'art galleries', 'coffee', 'slow mornings'],
    budget_band: 'medium', home_city: 'Mumbai',
  },
  {
    name: 'Aditya Sharma',
    phone: '+91 98110 30877', email: 'aditya.sharma91@gmail.com',
    emergency_contact: 'Neha Sharma (sister) +91 98110 30878',
    dietary: 'non_veg', allergies: null, medical_notes: 'Knee injury — avoid long descents',
    pace: 'moderate', interests: ['history', 'museums', 'cycling', 'night markets'],
    budget_band: 'low', home_city: 'New Delhi',
  },
  {
    name: 'Meera Nair',
    phone: '+91 94470 51236', email: 'meera.nair@icloud.com',
    emergency_contact: 'Rajan Nair (husband) +91 94470 51200',
    dietary: 'veg', allergies: 'Gluten', medical_notes: null,
    pace: 'relaxed', interests: ['ayurveda', 'birdwatching', 'backwaters', 'cooking classes'],
    budget_band: 'high', home_city: 'Kochi',
  },
  {
    name: 'Daniel Okafor',
    phone: '+44 7700 900412', email: 'daniel.okafor@gmail.com',
    emergency_contact: 'Chioma Okafor (sister) +44 7700 900413',
    dietary: 'non_veg', allergies: null, medical_notes: null,
    pace: 'packed', interests: ['street photography', 'football', 'live music', 'diving'],
    budget_band: 'medium', home_city: 'London',
  },
  {
    name: 'Sophie Laurent',
    phone: '+33 6 12 88 45 09', email: 'sophie.laurent@protonmail.com',
    emergency_contact: 'Marc Laurent (brother) +33 6 12 88 45 10',
    dietary: 'veg', allergies: 'Penicillin', medical_notes: null,
    pace: 'moderate', interests: ['wine', 'architecture', 'hiking', 'patisserie'],
    budget_band: 'high', home_city: 'Lyon',
  },
]

const DOCS = [
  { person: 'Asha Kumar', doc_type: 'passport', doc_number: 'Z1234567', expiry_date: '2032-04-18', filename: 'asha-passport-scan.pdf', kind: 'pdf' },
  { person: 'Ravi Menon', doc_type: 'passport', doc_number: 'M8873421', expiry_date: '2027-01-20', filename: 'ravi-passport-scan.pdf', kind: 'pdf' },
  { person: 'Priya Iyer', doc_type: 'passport', doc_number: 'P5521098', expiry_date: '2026-06-30', filename: 'priya-passport-scan.pdf', kind: 'pdf' },
  { person: 'Priya Iyer', doc_type: 'visa', doc_number: 'VN-E-2026-8841', expiry_date: '2026-12-31', filename: 'priya-vietnam-evisa.pdf', kind: 'pdf' },
  { person: 'Aditya Sharma', doc_type: 'other', doc_number: 'AI-6E-2261-QJ4T', expiry_date: null, filename: 'aditya-eticket-MAA-HAN.png', kind: 'png' },
  { person: 'Meera Nair', doc_type: 'vaccination', doc_number: 'WHO-IN-4471902', expiry_date: '2029-08-01', filename: 'meera-yellow-card.png', kind: 'png' },
  { person: 'Daniel Okafor', doc_type: 'driving_license', doc_number: 'OKAFO901124DA9RT', expiry_date: '2031-11-24', filename: 'daniel-uk-licence.pdf', kind: 'pdf' },
]

const PERSON_FIELDS = ['name', 'phone', 'email', 'emergency_contact', 'dietary', 'allergies', 'medical_notes', 'pace', 'interests', 'budget_band', 'home_city']

async function seedPeople() {
  const existing = (await GET('/people')).json.people
  const byName = new Map(existing.map((p) => [p.name, p]))
  const out = new Map()
  for (const spec of PEOPLE) {
    const body = Object.fromEntries(PERSON_FIELDS.map((f) => [f, spec[f] ?? null]))
    body.interests = spec.interests || []
    const found = byName.get(spec.name)
    if (found) {
      const res = await PUT(`/people/${found.id}`, body)
      out.set(spec.name, res.json.person)
    } else {
      const res = await POST('/people', body)
      out.set(spec.name, res.json.person)
    }
  }
  log(`· people: ${out.size} (${PEOPLE.length - existing.filter((p) => out.has(p.name)).length} new, rest enriched)`)

  let uploaded = 0
  for (const d of DOCS) {
    const person = out.get(d.person)
    const have = (await GET(`/people/${person.id}/documents`)).json.documents
    if (have.some((x) => x.original_name === d.filename)) continue
    const form = new FormData()
    form.append('file', fileBlob(d.kind), d.filename)
    form.append('doc_type', d.doc_type)
    if (d.doc_number) form.append('doc_number', d.doc_number)
    if (d.expiry_date) form.append('expiry_date', d.expiry_date)
    await POST(`/people/${person.id}/documents`, undefined, { form })
    uploaded++
  }
  log(`· documents: ${uploaded} uploaded (${DOCS.length} total specced)`)
  return out
}

// ------------------------------------------------------------------ trip helpers
const STATUS_ORDER = ['idea', 'planning', 'confirmed', 'active', 'archived']

async function findOrCreateTrip(name, createBody) {
  const trips = (await GET('/trips')).json.trips
  const found = trips.find((t) => t.name === name)
  if (found) return (await GET(`/trips/${found.id}`)).json.trip
  const res = await POST('/trips', { name, ...createBody })
  return res.json.trip
}

async function advanceTo(tripId, target) {
  let trip = (await GET(`/trips/${tripId}`)).json.trip
  while (STATUS_ORDER.indexOf(trip.status) < STATUS_ORDER.indexOf(target)) {
    const next = STATUS_ORDER[STATUS_ORDER.indexOf(trip.status) + 1]
    if (next === 'archived') break // archiving goes through /archive, never /status
    trip = (await POST(`/trips/${tripId}/status`, { status: next })).json.trip
  }
  return trip
}

async function ensureParticipants(trip, personIds) {
  const have = new Set(trip.participants.map((p) => p.person_id))
  for (const id of personIds) {
    if (have.has(id)) continue
    await POST(`/trips/${trip.id}/participants`, { person_id: id })
  }
  return (await GET(`/trips/${trip.id}`)).json.trip
}

async function ensureGoals(trip, goals) {
  const have = new Set(trip.goals.map((g) => g.title))
  for (const g of goals) {
    if (have.has(g.title)) continue
    await POST(`/trips/${trip.id}/goals`, g)
  }
}

async function ensureCandidates(tripId, candidates, decideName) {
  const have = (await GET(`/trips/${tripId}/candidates`)).json.candidates
  const byName = new Map(have.map((c) => [c.name, c]))
  for (const c of candidates) {
    if (byName.has(c.name)) continue
    const res = await POST(`/trips/${tripId}/candidates`, c)
    byName.set(c.name, res.json.candidate)
  }
  if (decideName) {
    const target = byName.get(decideName)
    if (target && !target.decided) await POST(`/candidates/${target.id}/decide`, {})
  }
  return byName
}

// Drops any checklist on the trip whose name we manage, then rebuilds it so
// done/assignee/due-date state is deterministic across re-runs.
async function rebuildChecklist(tripId, { kind, name, items }) {
  const have = (await GET(`/trips/${tripId}/checklists`)).json.checklists
  for (const c of have) if (c.name === name) await DEL(`/checklists/${c.id}`)
  const created = (await POST('/checklists', { kind, name, trip_id: tripId })).json.checklist
  const made = []
  for (const it of items) {
    const res = await POST(`/checklists/${created.id}/items`, {
      title: it.title,
      assignee_person_id: it.assignee ?? null,
      due_date: it.due_date ?? null,
    })
    made.push(res.json)
    if (it.done) await PUT(`/checklist-items/${res.json.id}`, { done: true })
  }
  return { checklist: created, items: made }
}

async function applyItinerary(tripId, days) {
  await POST(`/trips/${tripId}/itinerary/init`, {})
  await POST(`/trips/${tripId}/itinerary/apply-draft`, { days })
}

// Mints a fresh participant link (the endpoint revokes the previous active one)
// and, when confirm is set, submits the participant profile — the ONLY way to
// flip trip_participants.profile_confirmed, which readiness reads.
async function linkAndMaybeConfirm(tripId, personId, { confirm, profile } = {}) {
  const res = await POST(`/trips/${tripId}/participants/${personId}/link`, {})
  const token = res.json.token
  if (confirm) await PUT('/participant/profile', profile || {}, { token })
  return { token, url: res.json.url }
}

// =================================================================== FLAGSHIP
const FLAGSHIP_NAME = 'Vietnam & Cambodia 2026'
const F_START = '2026-11-06'
const F_END = '2026-11-15'

const FLAGSHIP_ITINERARY = [
  { day_date: '2026-11-06', items: [
    { title: 'MAA → Hanoi (VN 6-hop via BKK)', time_range: '01:40–11:25', location: 'Noi Bai Intl (HAN)', category: 'travel', est_cost: 57000, notes: 'Group check-in at Chennai T2 by 23:30 the night before. Aisle seats blocked for Ravi and Daniel.' },
    { title: 'Airport transfer + hotel check-in', time_range: '12:00–13:30', location: 'La Siesta Premium, Hang Be', category: 'logistics', est_cost: 2400, notes: 'Pre-booked 7-seater. Three twin rooms, early check-in confirmed by email.' },
    { title: 'Bun cha lunch on Hang Manh', time_range: '13:45–15:00', location: 'Hang Manh, Old Quarter', category: 'food', est_cost: 1800, notes: 'Vegan bowl pre-ordered for Priya; tofu version, no fish sauce.' },
    { title: 'Nap + reset', time_range: '15:00–17:30', location: 'Hotel', category: 'rest', notes: 'Non-negotiable. Everyone lands on 4 hours of sleep.' },
    { title: 'Hoan Kiem lake walk & night market', time_range: '18:00–21:00', location: 'Hoan Kiem / Dong Xuan', category: 'activity', est_cost: 900 },
  ] },
  { day_date: '2026-11-07', items: [
    { title: 'Old Quarter street-food walk', time_range: '08:30–11:30', location: 'Hanoi Old Quarter', category: 'food', est_cost: 9600, notes: 'Guided, 6 pax. Guide briefed on one vegan + one gluten-free.', link: 'https://example.com/hanoi-street-food-walk' },
    { title: 'Temple of Literature', time_range: '12:00–13:30', location: 'Quoc Tu Giam', category: 'activity', est_cost: 1200 },
    { title: 'Train Street coffee stop', time_range: '14:00–15:15', location: 'Tran Phu rail crossing', category: 'food', est_cost: 1100, notes: 'Train passes ~15:20 — be seated by 15:05.' },
    { title: 'Thang Long water puppet show', time_range: '18:00–19:00', location: 'Dinh Tien Hoang', category: 'activity', est_cost: 3600, link: 'https://example.com/thang-long-puppets' },
    { title: 'Dinner: Cha Ca La Vong', time_range: '19:30–21:00', location: 'Duong Thanh', category: 'food', est_cost: 5400 },
  ] },
  { day_date: '2026-11-08', items: [
    { title: 'Coach to Ha Long City', time_range: '07:30–10:30', location: 'Hanoi → Ha Long', category: 'travel', est_cost: 4800 },
    { title: 'Board overnight junk cruise', time_range: '11:30–12:30', location: 'Tuan Chau Marina', category: 'logistics', est_cost: 84000, notes: '3 cabins. Deposit paid 12 Aug, balance due at boarding.', link: 'https://example.com/halong-junk' },
    { title: 'Kayaking at Luon Cave', time_range: '15:00–16:30', location: 'Bai Tu Long Bay', category: 'activity', notes: 'Priya sitting this one out — motion sickness. Sun deck instead.' },
    { title: 'Sunset spring rolls class on deck', time_range: '17:30–18:30', location: 'Cruise deck', category: 'food' },
    { title: 'Squid fishing off the stern', time_range: '20:30–21:30', location: 'Cruise deck', category: 'activity' },
  ] },
  { day_date: '2026-11-09', items: [
    { title: 'Tai chi at sunrise', time_range: '06:15–06:45', location: 'Cruise sun deck', category: 'activity' },
    { title: 'Sung Sot (Surprise) Cave', time_range: '08:00–09:30', location: 'Bo Hon Island', category: 'activity', notes: 'Wet steps — Aditya to take the handrail route, knee.' },
    { title: 'Disembark + coach back to Hanoi', time_range: '11:00–15:00', location: 'Ha Long → Hanoi', category: 'travel' },
    { title: 'HAN → DAD domestic hop', time_range: '18:20–19:35', location: 'Da Nang (DAD)', category: 'travel', est_cost: 21600 },
    { title: 'Transfer to Hoi An + late check-in', time_range: '20:00–21:15', location: 'Hoi An Ancient Town', category: 'logistics', est_cost: 3000 },
  ] },
  { day_date: '2026-11-10', items: [
    { title: 'Ancient Town lantern walk', time_range: '09:00–11:30', location: 'Hoi An Ancient Town', category: 'activity', est_cost: 2400, notes: 'Town entry ticket covers 5 heritage houses.' },
    { title: 'Tailor fitting #1', time_range: '12:00–13:00', location: 'Bebe Tailor, Tran Phu', category: 'logistics', est_cost: 27000, notes: 'Meera + Sophie + Ravi. Second fitting tomorrow evening, collect on the 12th.' },
    { title: 'Cao lau + white rose lunch', time_range: '13:15–14:30', location: 'Thanh Ha', category: 'food', est_cost: 3600 },
    { title: 'Cooking class at Tra Que herb village', time_range: '16:00–19:30', location: 'Tra Que', category: 'food', est_cost: 16200, notes: 'Fully vegan menu option requested for Priya; gluten-free swap for Meera.', link: 'https://example.com/tra-que-cooking' },
  ] },
  { day_date: '2026-11-11', items: [
    { title: 'My Son sanctuary day trip', time_range: '07:00–12:30', location: 'My Son, Quang Nam', category: 'activity', est_cost: 12600, notes: 'Leave early — the site is brutal after 10:00.' },
    { title: 'An Bang beach afternoon', time_range: '14:00–17:00', location: 'An Bang Beach', category: 'rest', est_cost: 2100 },
    { title: 'Tailor fitting #2 + collection', time_range: '17:30–18:30', location: 'Bebe Tailor, Tran Phu', category: 'logistics' },
    { title: 'Riverside dinner, Nguyen Phuc Chu', time_range: '19:30–21:30', location: 'Hoi An riverfront', category: 'food', est_cost: 6000 },
  ] },
  { day_date: '2026-11-12', items: [
    { title: 'DAD → SGN flight', time_range: '09:45–11:15', location: 'Tan Son Nhat (SGN)', category: 'travel', est_cost: 19800 },
    { title: 'Check in, District 1', time_range: '12:15–13:00', location: 'Le Thanh Ton, D1', category: 'logistics' },
    { title: 'War Remnants Museum', time_range: '14:00–16:30', location: 'Vo Van Tan, D3', category: 'activity', est_cost: 1500, notes: 'Heavy. Budget quiet time after — no plans until dinner.' },
    { title: 'Rooftop evening at Chill Skybar', time_range: '19:00–21:30', location: 'Le Thanh Ton, D1', category: 'activity', est_cost: 9600, notes: 'Smart-casual dress code, no shorts. Daniel booked the table.' },
  ] },
  { day_date: '2026-11-13', items: [
    { title: 'Mekong Delta day tour (Ben Tre)', time_range: '07:30–17:00', location: 'Ben Tre', category: 'activity', est_cost: 21600, notes: 'Small-boat segment ~40 min — Priya has meds.', link: 'https://example.com/mekong-bentre' },
    { title: 'Banh mi + ca phe sua da stop', time_range: '17:30–18:15', location: 'Nguyen Trai, D1', category: 'food', est_cost: 1200 },
    { title: 'Pack + repack for Cambodia', time_range: '20:00–21:00', location: 'Hotel', category: 'logistics', notes: 'Cambodia e-visa printouts into passports tonight. Daniel checks all six.' },
  ] },
  { day_date: '2026-11-14', items: [
    { title: 'SGN → REP flight', time_range: '08:20–09:30', location: 'Siem Reap (REP)', category: 'travel', est_cost: 22800 },
    { title: 'Angkor 3-day pass + tuk-tuk crew', time_range: '10:30–11:30', location: 'Angkor ticket office', category: 'logistics', est_cost: 31200, notes: 'Two tuk-tuks for the whole stay, same drivers. Passport photos needed.' },
    { title: 'Angkor Thom + Bayon faces', time_range: '13:30–16:30', location: 'Angkor Thom', category: 'activity' },
    { title: 'Ta Prohm at golden hour', time_range: '16:45–18:00', location: 'Ta Prohm', category: 'activity', notes: 'Uneven stone throughout — slow route for Aditya.' },
    { title: 'Khmer amok dinner, Kandal village', time_range: '19:30–21:00', location: 'Kandal Village', category: 'food', est_cost: 6600 },
  ] },
  { day_date: '2026-11-15', items: [
    { title: 'Angkor Wat sunrise', time_range: '05:00–07:30', location: 'Angkor Wat west causeway', category: 'activity', notes: 'Tuk-tuks at the lobby 04:40. Torches, and coffee in flasks from the hotel.' },
    { title: 'Breakfast + late checkout', time_range: '08:30–11:30', location: 'Hotel, Siem Reap', category: 'rest', notes: 'Late checkout confirmed to 12:00, no charge.' },
    { title: 'Old Market souvenir run', time_range: '12:00–14:00', location: 'Psar Chas', category: 'activity', est_cost: 9000 },
    { title: 'REP → MAA via BKK', time_range: '16:10–23:55', location: 'Siem Reap → Chennai', category: 'travel', est_cost: 57000, notes: 'Sophie and Daniel split off at BKK for their own onward legs.' },
  ] },
]

const FLAGSHIP_BUDGET = [
  { category: 'primary_transport', estimate: 342000, basis: '6 pax x ₹57,000 return — MAA→HAN out, REP→MAA back, both via BKK' },
  { category: 'secondary_transport', estimate: 68400, basis: '3 domestic hops (HAN→DAD, DAD→SGN, SGN→REP) + all airport and Ha Long transfers' },
  { category: 'stay', estimate: 216000, basis: '9 nights x 3 twin rooms x ₹8,000 avg (incl. 1 night on the junk)' },
  { category: 'food', estimate: 118800, basis: '6 pax x 10 days x ₹1,980/day — two sit-down dinners, rest street/local' },
  { category: 'activities', estimate: 96500, basis: 'Ha Long cruise activities, Angkor 3-day pass, My Son, cooking class, Mekong tour' },
  { category: 'shopping', estimate: 45000, basis: 'Hoi An tailoring (3 orders) + silk, lacquerware and Psar Chas souvenirs' },
  { category: 'leisure', estimate: 32000, basis: 'Spa afternoon, coffee stops, two rooftop evenings, An Bang beach loungers' },
  { category: 'misc', estimate: 51600, basis: 'Cambodia e-visas 6 x ₹2,900, travel insurance, eSIMs, ₹15k contingency buffer' },
]

async function seedFlagship(people) {
  // Reuse the pre-existing empty "Vietnam" trip if it is still there.
  let trip = null
  const probe = await GET(`/trips/${EXISTING_VIETNAM_ID}`, { raw: true })
  if (probe.status === 200 && ['Vietnam', FLAGSHIP_NAME].includes(probe.json.trip.name)) {
    trip = probe.json.trip
  }
  if (!trip) trip = await findOrCreateTrip(FLAGSHIP_NAME, {})

  await PUT(`/trips/${trip.id}`, {
    name: FLAGSHIP_NAME,
    description: 'Ten days north-to-south through Vietnam, then over the border for the Angkor temples. '
      + 'Six of us, two joining from Europe. Street food first, museums second, one proper beach afternoon.',
    vibe_tags: ['street food', 'temples', 'boats', 'photography', 'first-time SE Asia'],
    origin_city: 'Chennai',
    date_mode: 'confirmed',
    start_date: F_START,
    end_date: F_END,
    flex_days: 0,
  })

  const participantNames = ['Asha Kumar', 'Ravi Menon', 'Priya Iyer', 'Aditya Sharma', 'Daniel Okafor', 'Sophie Laurent']
  const pids = participantNames.map((n) => people.get(n).id)
  trip = await ensureParticipants(trip, pids)

  await ensureCandidates(trip.id, [
    {
      name: 'Vietnam & Cambodia', rationale: 'Two countries on one visa run, sub-6h flights, and the strongest street-food case of the shortlist. Angkor covers the "one wow site" ask.',
      best_dates: 'Late Oct – mid Nov (dry in the north, shoulder season prices)',
      est_budget_per_person: 162000,
      caveats: 'Long travel day at each end; Cambodia e-visa needed 3+ weeks ahead.',
    },
    {
      name: 'Sri Lanka loop', rationale: 'Cheapest flights of the lot from Chennai and an easy train-based itinerary — Kandy, Ella, the south coast.',
      best_dates: 'Dec – Mar for the south and west coasts',
      est_budget_per_person: 98000,
      caveats: 'Three of the group have already done the hill country. Lower novelty.',
    },
    {
      name: 'Northern Thailand + Laos', rationale: 'Chiang Mai, Pai and the slow boat down to Luang Prabang. Very relaxed pacing, excellent for the vegan and gluten-free constraints.',
      best_dates: 'Nov – Feb (avoid the March burning season)',
      est_budget_per_person: 141000,
      caveats: 'The slow boat eats two full days; Ravi wants more activity density.',
    },
    {
      name: 'Georgia & Armenia', rationale: 'Wine, mountains and Caucasus food, and it would suit Sophie and Daniel flying from Europe better than anyone else.',
      best_dates: 'May – Jun or Sep – Oct',
      est_budget_per_person: 188000,
      caveats: 'Awkward routings from Chennai (2 stops), and November is already cold at altitude.',
    },
  ], 'Vietnam & Cambodia')

  await ensureGoals(trip, [
    { title: 'Angkor Wat at sunrise — the whole reason for the Cambodia leg', fixed_date: '2026-11-15', fixed_place: 'Angkor Wat, Siem Reap', notes: 'Non-negotiable. 3-day pass bought the afternoon before; tuk-tuks booked for 04:40.' },
    { title: 'One night on a Ha Long Bay junk', fixed_date: '2026-11-08', fixed_place: 'Bai Tu Long Bay', notes: 'Bai Tu Long rather than the main bay — fewer boats. 3 cabins held.' },
    { title: 'Hoi An tailoring with time for two fittings', fixed_place: 'Hoi An Ancient Town', notes: 'Needs 2 clear days in Hoi An or it does not work. Meera, Sophie and Ravi are ordering.' },
    { title: 'A proper Vietnamese cooking class, vegan-friendly', fixed_place: 'Tra Que herb village', notes: 'Confirmed the kitchen can do a fully vegan menu and a gluten-free swap.' },
    { title: 'Keep two half-days completely unplanned', notes: 'Nov 11 afternoon and Nov 15 morning are deliberately loose.' },
  ])

  await advanceTo(trip.id, 'confirmed')

  await PUT(`/trips/${trip.id}/budget`, { lines: FLAGSHIP_BUDGET })
  await PUT(`/trips/${trip.id}/budget/overrides`, {
    overrides: [
      { person_id: people.get('Sophie Laurent').id, amount: 128000, note: 'Flies in from Lyon on her own ticket — pays land costs and internal flights only' },
      { person_id: people.get('Daniel Okafor').id, amount: 145000, note: 'Joining from London, own long-haul; taking the single room so pays the supplement' },
    ],
  })

  await applyItinerary(trip.id, FLAGSHIP_ITINERARY)

  const P = (n) => people.get(n).id
  // 12 packing items (9 done) + 10 task items (4 done) = 22 items, 13 done.
  await rebuildChecklist(trip.id, {
    kind: 'packing', name: 'Packing — Vietnam & Cambodia',
    items: [
      { title: 'Passport + 2 photocopies, kept separately', assignee: null, done: true },
      { title: 'Printed Cambodia e-visa (one per person)', assignee: null, done: true },
      { title: 'Rain shell — Hoi An can still get wet in November', assignee: null, done: true },
      { title: 'Long trousers + covered shoulders for temple days', assignee: null, done: true },
      { title: 'Reef-safe sunscreen SPF50', assignee: P('Asha Kumar'), done: true },
      { title: 'Head torch for the Angkor sunrise walk-in', assignee: P('Daniel Okafor'), done: true },
      { title: 'Motion-sickness tablets', assignee: P('Priya Iyer'), done: true },
      { title: 'Knee support + ibuprofen gel', assignee: P('Aditya Sharma'), done: true },
      { title: 'Universal adapter (VN/KH type A/C)', assignee: P('Ravi Menon'), done: true },
      { title: 'Dry bag for the kayaking session', assignee: P('Ravi Menon'), done: false },
      { title: 'Gluten-free snack stash for travel days', assignee: P('Meera Nair'), done: false },
      { title: 'Small gifts for the tuk-tuk drivers', assignee: P('Sophie Laurent'), done: false },
    ],
  })
  await rebuildChecklist(trip.id, {
    kind: 'tasks', name: 'Pre-departure Tasks',
    items: [
      { title: 'Pay the Ha Long junk balance', assignee: P('Asha Kumar'), due_date: '2026-10-20', done: true },
      { title: 'Book the MAA→HAN group ticket', assignee: P('Asha Kumar'), due_date: '2026-07-05', done: true },
      { title: 'Apply for Cambodia e-visas (all 6)', assignee: P('Daniel Okafor'), due_date: '2026-10-10', done: true },
      { title: 'Confirm vegan + gluten-free with the cooking class', assignee: P('Priya Iyer'), due_date: '2026-09-01', done: true },
      { title: 'Renew passport — expires before the trip ends', assignee: P('Priya Iyer'), due_date: '2026-07-15', done: false },
      { title: 'Share emergency contact sheet with everyone', assignee: P('Meera Nair'), due_date: '2026-07-18', done: false },
      { title: 'Buy travel insurance for the group', assignee: P('Ravi Menon'), due_date: '2026-10-05', done: false },
      { title: 'Send tailor measurements ahead to Bebe', assignee: P('Sophie Laurent'), due_date: '2026-10-25', done: false },
      { title: 'Book the Mekong Delta small-group tour', assignee: P('Aditya Sharma'), due_date: '2026-10-15', done: false },
      { title: 'Sort eSIMs for Vietnam and Cambodia', assignee: P('Aditya Sharma'), due_date: '2026-11-01', done: false },
    ],
  })

  // 4 of 6 profiles confirmed → readiness lands short of 100%.
  const links = []
  const confirmPlan = [
    ['Asha Kumar', { dietary: 'veg', pace: 'moderate', interests: ['temples', 'street food', 'photography', 'markets'], allergies: 'Peanuts (mild)' }],
    ['Ravi Menon', { dietary: 'non_veg', pace: 'packed', interests: ['hiking', 'scuba diving', 'craft beer', 'motorbikes'] }],
    ['Priya Iyer', { dietary: 'vegan', pace: 'relaxed', interests: ['yoga', 'art galleries', 'coffee', 'slow mornings'], medical_notes: 'Motion sickness on boats — needs meds' }],
    ['Daniel Okafor', { dietary: 'non_veg', pace: 'packed', interests: ['street photography', 'football', 'live music', 'diving'] }],
  ]
  for (const [name, profile] of confirmPlan) {
    const r = await linkAndMaybeConfirm(trip.id, people.get(name).id, { confirm: true, profile })
    links.push({ person: name, ...r, confirmed: true })
  }
  // Two live links whose owners have NOT filled anything in yet.
  for (const name of ['Aditya Sharma', 'Sophie Laurent']) {
    const r = await linkAndMaybeConfirm(trip.id, people.get(name).id, { confirm: false })
    links.push({ person: name, ...r, confirmed: false })
  }

  log(`· flagship "${FLAGSHIP_NAME}" ${trip.id}`)
  return { trip: (await GET(`/trips/${trip.id}`)).json.trip, links }
}

// =================================================================== OTHER TRIPS
async function seedIdeaTrip(people) {
  const name = 'Ladakh Overland Expedition'
  let trip = await findOrCreateTrip(name, {
    description: 'Manali to Leh over the passes, a few days around Pangong, then fly out of Leh. '
      + 'Still arguing about dates and whether we self-drive or hire a convoy.',
    vibe_tags: ['high altitude', 'road trip', 'camping', 'monasteries'],
    origin_city: 'New Delhi',
  })
  await PUT(`/trips/${trip.id}`, {
    date_mode: 'broad',
    flex_days: 4,
  })
  await PUT(`/trips/${trip.id}/windows`, {
    windows: [
      { start_date: '2027-06-12', end_date: '2027-06-24', note: 'Passes usually open by mid-June; Ravi has leave then' },
      { start_date: '2027-07-03', end_date: '2027-07-15', note: 'Warmest option but monsoon risk on the Manali side' },
      { start_date: '2027-09-05', end_date: '2027-09-17', note: 'Best light for photography, coldest nights at Pangong' },
    ],
  })
  trip = await ensureParticipants(trip, [
    people.get('Ravi Menon').id, people.get('Aditya Sharma').id, people.get('Daniel Okafor').id,
  ])
  await ensureGoals(trip, [
    { title: 'Drive Khardung La ourselves, not in a tour van', notes: 'Two Thars or a Gypsy + support vehicle. Needs a mechanic-ish person in the group.' },
    { title: 'Two nights camped at Pangong Tso', fixed_place: 'Pangong Tso, Ladakh', notes: 'One night is not enough for the light we want.' },
    { title: 'Hemis and Thiksey monasteries at prayer time', fixed_place: 'Leh district' },
    { title: 'Build in two full acclimatisation days in Leh', notes: 'Non-negotiable — Aditya had AMS in Spiti.' },
  ])
  await ensureCandidates(trip.id, [
    { name: 'Manali → Leh (self-drive)', rationale: 'The classic. Gains altitude gradually, and Baralacha La / Nakee La are the whole point.', best_dates: 'Mid-Jun to mid-Sep', est_budget_per_person: 74000, caveats: 'Two very long driving days; Rohtang permits needed.' },
    { name: 'Srinagar → Leh (Zoji La)', rationale: 'Gentler acclimatisation profile and Kargil/Drass en route.', best_dates: 'Jun to Sep', est_budget_per_person: 69000, caveats: 'Adds a Srinagar flight; road closures at short notice.' },
    { name: 'Fly into Leh, hire a convoy', rationale: 'Saves four days and all the driving fatigue.', best_dates: 'May to Oct', est_budget_per_person: 88000, caveats: 'Skips the passes entirely — Ravi is against it. Altitude hits on day one.' },
  ], null) // deliberately undecided: this trip is still an idea
  log(`· idea trip "${name}" ${trip.id}`)
  return (await GET(`/trips/${trip.id}`)).json.trip
}

async function seedActiveTrip(people) {
  const name = 'Kerala Backwaters Reunion'
  let trip = await findOrCreateTrip(name, {
    description: 'Six days of doing very little. Houseboat out of Alleppey, two nights in Fort Kochi, '
      + 'and one ayurveda afternoon nobody is allowed to skip.',
    vibe_tags: ['slow', 'backwaters', 'food', 'family'],
    origin_city: 'Chennai',
  })
  await PUT(`/trips/${trip.id}`, {
    date_mode: 'confirmed', start_date: '2026-08-14', end_date: '2026-08-19', flex_days: 0,
  })
  trip = await ensureParticipants(trip, [
    people.get('Meera Nair').id, people.get('Asha Kumar').id, people.get('Priya Iyer').id, people.get('Aditya Sharma').id,
  ])
  await ensureGoals(trip, [
    { title: 'One full night on a houseboat, engine off', fixed_place: 'Alleppey / Kumarakom', notes: 'Anchored in a side canal, not the main channel.' },
    { title: 'Sadya on a banana leaf', fixed_date: '2026-08-16', fixed_place: 'Fort Kochi' },
    { title: 'Kathakali performance, the short tourist version', fixed_place: 'Fort Kochi' },
  ])
  await ensureCandidates(trip.id, [
    { name: 'Alleppey & Fort Kochi', rationale: 'Shortest transfers, best food, and the houseboat operators here are the most reliable.', best_dates: 'Aug – Sep (green season, low rates)', est_budget_per_person: 41000, caveats: 'Monsoon showers most afternoons.' },
    { name: 'Kumarakom & Thekkady', rationale: 'Quieter water and adds the spice plantations.', best_dates: 'Oct – Feb', est_budget_per_person: 47000, caveats: 'Long ghat drive to Thekkady eats a day.' },
  ], 'Alleppey & Fort Kochi')
  await advanceTo(trip.id, 'active')
  await PUT(`/trips/${trip.id}/budget`, {
    lines: [
      { category: 'primary_transport', estimate: 34000, basis: '4 pax return MAA→COK on the Tejas / one flight' },
      { category: 'secondary_transport', estimate: 12500, basis: 'Kochi–Alleppey car both ways + local autos' },
      { category: 'stay', estimate: 68000, basis: '1 houseboat night (₹22k) + 4 nights x 2 rooms in Fort Kochi' },
      { category: 'food', estimate: 26400, basis: '4 pax x 6 days x ₹1,100 — houseboat meals included separately' },
      { category: 'activities', estimate: 14200, basis: 'Kathakali, ayurveda session, Chinese-net walk, spice market tour' },
      { category: 'shopping', estimate: 9000, basis: 'Spices, coir, a couple of Aranmula mirrors' },
      { category: 'leisure', estimate: 7500, basis: 'Two long café afternoons, one sunset ferry' },
      { category: 'misc', estimate: 6800, basis: 'Tips, laundry, buffer' },
    ],
  })
  await applyItinerary(trip.id, [
    { day_date: '2026-08-14', items: [
      { title: 'MAA → COK', time_range: '07:15–08:35', location: 'Cochin Intl (COK)', category: 'travel', est_cost: 8500 },
      { title: 'Drive to Alleppey', time_range: '09:15–11:00', location: 'Alappuzha', category: 'travel', est_cost: 3200 },
      { title: 'Board houseboat', time_range: '12:00–12:30', location: 'Punnamada jetty', category: 'logistics', est_cost: 22000, notes: 'Two bedrooms, cook aboard. Engine off by 18:00 in a side canal.' },
      { title: 'Karimeen fry lunch on deck', time_range: '13:00–14:00', location: 'Backwaters', category: 'food' },
      { title: 'Canoe through the narrow canals', time_range: '16:30–18:00', location: 'Kainakary', category: 'activity' },
    ] },
    { day_date: '2026-08-15', items: [
      { title: 'Sunrise on the deck', time_range: '06:00–07:00', location: 'Backwaters', category: 'rest' },
      { title: 'Disembark + drive to Fort Kochi', time_range: '09:30–12:00', location: 'Fort Kochi', category: 'travel' },
      { title: 'Check in, Princess Street', time_range: '12:15–13:00', location: 'Fort Kochi', category: 'logistics' },
      { title: 'Chinese fishing nets at low tide', time_range: '17:00–18:30', location: 'Vasco da Gama Square', category: 'activity' },
    ] },
    { day_date: '2026-08-16', items: [
      { title: 'Sadya on a banana leaf', time_range: '12:30–14:00', location: 'Fort Kochi', category: 'food', est_cost: 4800, notes: 'Onam-style spread. Booked for four.' },
      { title: 'Mattancherry + Jew Town walk', time_range: '15:00–17:00', location: 'Mattancherry', category: 'activity' },
      { title: 'Kathakali performance', time_range: '18:00–19:30', location: 'Kerala Kathakali Centre', category: 'activity', est_cost: 2400 },
    ] },
    { day_date: '2026-08-17', items: [
      { title: 'Ayurveda session (2h, all four)', time_range: '10:00–12:00', location: 'Fort Kochi', category: 'activity', est_cost: 7600, notes: 'Meera booked it. No arguing.' },
      { title: 'Long lunch at Kashi Art Café', time_range: '13:00–14:30', location: 'Burgher Street', category: 'food' },
      { title: 'Nothing planned', time_range: '15:00–19:00', location: 'Fort Kochi', category: 'rest', notes: 'Deliberately empty.' },
    ] },
    { day_date: '2026-08-18', items: [
      { title: 'Ernakulam spice market', time_range: '09:30–11:30', location: 'Broadway, Ernakulam', category: 'activity' },
      { title: 'Ferry back at sunset', time_range: '18:00–18:40', location: 'Ernakulam → Fort Kochi', category: 'travel', est_cost: 200 },
      { title: 'Seafood dinner, Fort House', time_range: '19:30–21:00', location: 'Fort Kochi', category: 'food', est_cost: 5200 },
    ] },
    { day_date: '2026-08-19', items: [
      { title: 'Last coffee + pack', time_range: '08:00–10:00', location: 'Hotel', category: 'rest' },
      { title: 'COK → MAA', time_range: '13:40–15:00', location: 'Chennai', category: 'travel', est_cost: 8500 },
    ] },
  ])
  await rebuildChecklist(trip.id, {
    kind: 'packing', name: 'Kerala Packing',
    items: [
      { title: 'Umbrella — green season, it will rain', assignee: null, done: true },
      { title: 'Mosquito repellent for the houseboat night', assignee: null, done: true },
      { title: 'Loose cotton for the ayurveda session', assignee: null, done: true },
      { title: 'Gluten-free crackers', assignee: people.get('Meera Nair').id, done: false },
      { title: 'Waterproof phone pouch for the canoe', assignee: people.get('Aditya Sharma').id, done: false },
    ],
  })
  await linkAndMaybeConfirm(trip.id, people.get('Meera Nair').id, {
    confirm: true,
    profile: { dietary: 'veg', pace: 'relaxed', interests: ['ayurveda', 'birdwatching', 'backwaters', 'cooking classes'], allergies: 'Gluten' },
  })
  await linkAndMaybeConfirm(trip.id, people.get('Asha Kumar').id, {
    confirm: true,
    profile: { dietary: 'veg', pace: 'moderate', interests: ['temples', 'street food', 'photography', 'markets'] },
  })
  log(`· active trip "${name}" ${trip.id}`)
  return (await GET(`/trips/${trip.id}`)).json.trip
}

async function seedArchivedTrip(people) {
  const name = 'Bali Family Escape'
  let trip = await findOrCreateTrip(name, {
    description: 'Eight days split between Ubud and Seminyak. Two families, one very over-scheduled '
      + 'middle weekend. Went better than the group chat suggested it would.',
    vibe_tags: ['beach', 'temples', 'family', 'rice terraces'],
    origin_city: 'Bengaluru',
  })

  const already = (await GET(`/trips/${trip.id}`)).json.trip
  if (already.status !== 'archived') {
    await PUT(`/trips/${trip.id}`, { date_mode: 'confirmed', start_date: '2026-03-07', end_date: '2026-03-14', flex_days: 0 })
    trip = await ensureParticipants(trip, [
      people.get('Ravi Menon').id, people.get('Priya Iyer').id, people.get('Meera Nair').id,
      people.get('Sophie Laurent').id, people.get('Asha Kumar').id,
    ])
    await ensureGoals(trip, [
      { title: 'Tegallalang rice terraces before the coaches arrive', fixed_place: 'Tegallalang, Ubud', notes: 'Worked — we were there at 06:30 and had it to ourselves.' },
      { title: 'One surf lesson each for the kids', fixed_place: 'Kuta Beach' },
      { title: 'Sunset at Tanah Lot', fixed_date: '2026-03-12', fixed_place: 'Tanah Lot' },
    ])
    await ensureCandidates(trip.id, [
      { name: 'Ubud & Seminyak', rationale: 'One inland base, one beach base, one transfer. Least driving for the number of people.', best_dates: 'Apr – Oct dry season, or Mar shoulder', est_budget_per_person: 96000, caveats: 'Seminyak traffic is genuinely bad at 17:00.' },
      { name: 'Canggu & Nusa Penida', rationale: 'Better for the surfers, and Penida is the best scenery on the island.', best_dates: 'May – Sep', est_budget_per_person: 104000, caveats: 'The Penida crossing is rough — ruled out with young kids.' },
    ], 'Ubud & Seminyak')
    await advanceTo(trip.id, 'active')
    await PUT(`/trips/${trip.id}/budget`, {
      lines: [
        { category: 'primary_transport', estimate: 285000, basis: '5 pax x ₹57,000 return BLR→DPS via KUL' },
        { category: 'secondary_transport', estimate: 41000, basis: 'Airport transfers, Ubud→Seminyak van, two scooter rentals' },
        { category: 'stay', estimate: 172000, basis: '3 nights Ubud villa + 4 nights Seminyak villa, both whole-house' },
        { category: 'food', estimate: 78000, basis: '5 pax x 8 days x ₹1,950 — warungs mostly, three nicer dinners' },
        { category: 'activities', estimate: 62000, basis: 'Surf lessons, Tegallalang, Tirta Empul, Tanah Lot, one spa day' },
        { category: 'shopping', estimate: 34000, basis: 'Ubud market textiles, wood carvings, coffee' },
        { category: 'leisure', estimate: 21000, basis: 'Beach clubs, pool days, sunset drinks' },
        { category: 'misc', estimate: 18000, basis: 'Visa on arrival, tourism levy, tips, SIMs' },
      ],
    })
    await applyItinerary(trip.id, [
      { day_date: '2026-03-07', items: [
        { title: 'BLR → DPS via KUL', time_range: '00:35–13:20', location: 'Ngurah Rai (DPS)', category: 'travel', est_cost: 57000 },
        { title: 'Visa on arrival + transfer to Ubud', time_range: '13:20–15:30', location: 'Ubud', category: 'logistics', est_cost: 3800 },
        { title: 'Villa check-in and pool', time_range: '15:30–19:00', location: 'Penestanan, Ubud', category: 'rest' },
      ] },
      { day_date: '2026-03-08', items: [
        { title: 'Tegallalang rice terraces at first light', time_range: '06:15–08:30', location: 'Tegallalang', category: 'activity', notes: 'Left at 05:50. Empty. Best call of the trip.' },
        { title: 'Breakfast at Sari Organik', time_range: '09:00–10:30', location: 'Ubud', category: 'food' },
        { title: 'Ubud art market', time_range: '11:00–13:00', location: 'Ubud centre', category: 'activity' },
        { title: 'Tirta Empul water temple', time_range: '15:00–17:00', location: 'Tampaksiring', category: 'activity', est_cost: 3200 },
      ] },
      { day_date: '2026-03-09', items: [
        { title: 'Campuhan ridge walk', time_range: '07:00–08:30', location: 'Ubud', category: 'activity' },
        { title: 'Balinese cooking class', time_range: '10:00–14:00', location: 'Laplapan', category: 'food', est_cost: 14000 },
        { title: 'Spa afternoon', time_range: '16:00–18:00', location: 'Ubud', category: 'rest', est_cost: 11000 },
      ] },
      { day_date: '2026-03-10', items: [
        { title: 'Transfer Ubud → Seminyak', time_range: '10:00–12:00', location: 'Seminyak', category: 'travel', est_cost: 4200 },
        { title: 'Second villa check-in', time_range: '12:00–13:00', location: 'Seminyak', category: 'logistics' },
        { title: 'Beach afternoon at Double Six', time_range: '15:00–18:30', location: 'Double Six Beach', category: 'rest' },
      ] },
      { day_date: '2026-03-11', items: [
        { title: 'Surf lessons (all five)', time_range: '08:00–10:30', location: 'Kuta Beach', category: 'activity', est_cost: 16000 },
        { title: 'Long lunch, Sisterfields', time_range: '12:30–14:00', location: 'Seminyak', category: 'food' },
        { title: 'Pool + nothing', time_range: '14:30–18:00', location: 'Villa', category: 'rest' },
      ] },
      { day_date: '2026-03-12', items: [
        { title: 'Sunset at Tanah Lot', time_range: '16:00–19:00', location: 'Tanah Lot', category: 'activity', est_cost: 6400, notes: 'Left at 15:30 to beat the traffic. Just about worked.' },
        { title: 'Seafood grill at Jimbaran', time_range: '19:45–21:30', location: 'Jimbaran Bay', category: 'food', est_cost: 12000 },
      ] },
      { day_date: '2026-03-13', items: [
        { title: 'Last market run', time_range: '10:00–12:00', location: 'Seminyak', category: 'activity' },
        { title: 'Beach club afternoon', time_range: '13:00–18:00', location: 'Potato Head', category: 'rest', est_cost: 9000 },
        { title: 'Pack', time_range: '20:00–21:00', location: 'Villa', category: 'logistics' },
      ] },
      { day_date: '2026-03-14', items: [
        { title: 'DPS → BLR via KUL', time_range: '09:55–19:40', location: 'Bengaluru', category: 'travel', est_cost: 57000 },
      ] },
    ])
    await rebuildChecklist(trip.id, {
      kind: 'tasks', name: 'Bali Wrap-up',
      items: [
        { title: 'Settle the villa damage deposit', assignee: people.get('Ravi Menon').id, due_date: '2026-03-20', done: true },
        { title: 'Split the group kitty and send the sheet round', assignee: people.get('Priya Iyer').id, due_date: '2026-03-22', done: true },
        { title: 'Share the photo album', assignee: people.get('Sophie Laurent').id, due_date: '2026-03-25', done: true },
        { title: 'Review the Ubud villa for the next group', assignee: people.get('Meera Nair').id, due_date: '2026-04-01', done: true },
      ],
    })
    await POST(`/trips/${trip.id}/archive`, {
      notes: 'Best decision was splitting the stay — three nights inland then four on the coast, one transfer only. '
        + 'Worst was Tanah Lot on a Thursday; go earlier or skip it. The Ubud villa (Penestanan) is worth rebooking; '
        + 'the Seminyak one was fine but noisy from the lane. Came in about ₹49k under the estimate, mostly because '
        + 'we ate at warungs far more than planned.',
      photo_links: [
        'https://photos.example.com/albums/bali-2026-ubud',
        'https://photos.example.com/albums/bali-2026-seminyak',
        'https://photos.example.com/albums/bali-2026-tanah-lot',
      ],
    })
  }

  // Actuals only render on an archived trip (Settings → Archive), so they go last.
  await PUT(`/trips/${trip.id}/actuals`, {
    actuals: [
      { category: 'primary_transport', amount: 279400 },
      { category: 'secondary_transport', amount: 46800 },
      { category: 'stay', amount: 172000 },
      { category: 'food', amount: 58900 },
      { category: 'activities', amount: 59200 },
      { category: 'shopping', amount: 41500 },
      { category: 'leisure', amount: 24600 },
      { category: 'misc', amount: 19100 },
    ],
  })
  log(`· archived trip "${name}" ${trip.id}`)
  return (await GET(`/trips/${trip.id}`)).json.trip
}

// ------------------------------------------------------------------ templates
async function seedTemplates() {
  const specs = [
    { kind: 'packing', name: 'Template — Beach Trip Essentials', trip_type_tags: ['beach', 'warm'], items: ['Reef-safe sunscreen', 'Rash guard', 'Dry bag', 'Flip-flops + one closed pair', 'After-sun lotion', 'Snorkel mask', 'Beach towel (quick-dry)'] },
    { kind: 'tasks', name: 'Template — International Flight Prep', trip_type_tags: ['international'], items: ['Check passport validity (6+ months)', 'Apply for visa / e-visa', 'Buy travel insurance', 'Web check-in 48h before', 'Notify bank of travel dates', 'Download offline maps', 'Arrange airport transfer'] },
  ]
  const have = (await GET('/checklists?template=1')).json.checklists
  for (const s of specs) {
    if (have.some((c) => c.name === s.name)) continue
    const created = (await POST('/checklists', { kind: s.kind, name: s.name, is_template: true, trip_type_tags: s.trip_type_tags })).json.checklist
    for (const title of s.items) await POST(`/checklists/${created.id}/items`, { title })
  }
  log(`· checklist templates: ${specs.length} ensured`)
}

// ------------------------------------------------------------------ verify
// Mirrors web/src/utils/tripNav.js readinessPercent().
function readinessPercent(data) {
  const d = data.decisions || {}
  const participants = data.participants || []
  const checklists = data.checklists || {}
  const components = [
    d.dates_confirmed ? 1 : 0,
    d.destination_decided ? 1 : 0,
    d.budget_drafted ? 1 : 0,
    (d.itinerary_days || 0) > 0 ? 1 : 0,
  ]
  if (participants.length) components.push(participants.filter((p) => p.profile_confirmed).length / participants.length)
  if (checklists.total_items) components.push((checklists.done_items || 0) / checklists.total_items)
  return Math.round((components.reduce((a, b) => a + b, 0) / components.length) * 100)
}

function must(cond, msg) { if (!cond) throw new Error(`VERIFY FAILED: ${msg}`) }

async function verify(flagshipId) {
  const people = (await GET('/people')).json.people
  must(people.length >= 6, `expected >= 6 people, got ${people.length}`)

  const trip = (await GET(`/trips/${flagshipId}`)).json.trip
  must(trip.destination_mode === 'decided' && trip.destination, 'flagship destination not decided')
  must(trip.date_mode === 'confirmed' && trip.start_date && trip.end_date, 'flagship dates not confirmed')
  must(trip.participants.length >= 5, `flagship participants ${trip.participants.length}`)
  must(trip.goals.length >= 4, `flagship goals ${trip.goals.length}`)

  const candidates = (await GET(`/trips/${flagshipId}/candidates`)).json.candidates
  must(candidates.length >= 3 && candidates.some((c) => c.decided), 'flagship candidates/decision missing')

  const budget = (await GET(`/trips/${flagshipId}/budget`)).json
  must(budget.total > 0 && budget.overrides.length >= 2, `flagship budget total=${budget.total} overrides=${budget.overrides.length}`)

  const itinerary = (await GET(`/trips/${flagshipId}/itinerary`)).json.days
  const filledDays = itinerary.filter((d) => d.items.length > 0).length
  must(itinerary.length >= 9 && filledDays >= 9, `flagship itinerary days=${itinerary.length} filled=${filledDays}`)

  const checklists = (await GET(`/trips/${flagshipId}/checklists`)).json.checklists
  must(checklists.length >= 2, `flagship checklists ${checklists.length}`)
  const allItems = checklists.flatMap((c) => c.items)
  must(allItems.some((i) => i.done) && allItems.some((i) => !i.done), 'flagship checklist needs both done and pending items')

  const readiness = (await GET(`/trips/${flagshipId}/readiness`)).json
  const pct = readinessPercent(readiness)
  must(pct > 0 && pct < 100, `readiness ${pct}% is not strictly between 1 and 99`)
  const warned = readiness.participants.filter((p) => p.doc_warnings.length)
  const links = readiness.participants.filter((p) => p.has_active_link)

  const trips = (await GET('/trips')).json.trips
  log('')
  log('── VERIFIED ─────────────────────────────────────────────')
  log(`people                : ${people.length}`)
  log(`trips                 : ${trips.length}`)
  for (const t of trips) log(`  ${t.status.padEnd(9)} ${t.id}  ${t.name}${t.destination ? ` → ${t.destination}` : ''}`)
  log(`flagship readiness    : ${pct}%`)
  log(`  decisions           : ${JSON.stringify(readiness.decisions)}`)
  log(`  profiles confirmed  : ${readiness.participants.filter((p) => p.profile_confirmed).length}/${readiness.participants.length}`)
  log(`  checklist items     : ${readiness.checklists.done_items}/${readiness.checklists.total_items} done, ${readiness.checklists.overdue.length} overdue`)
  log(`  doc warnings        : ${warned.map((p) => `${p.name} [${p.doc_warnings.map((w) => `${w.doc_type}:${w.level}`).join(' ')}]`).join(', ') || 'none'}`)
  log(`  active links        : ${links.length}`)
  log(`budget total / share  : ${budget.total} / ${budget.equal_share}`)
  log(`itinerary             : ${itinerary.length} days, ${itinerary.reduce((n, d) => n + d.items.length, 0)} items`)
  return { pct, trips }
}

// ------------------------------------------------------------------ main
async function main() {
  await login()
  const people = await seedPeople()
  const { trip: flagship, links } = await seedFlagship(people)
  const idea = await seedIdeaTrip(people)
  const active = await seedActiveTrip(people)
  const archived = await seedArchivedTrip(people)
  await seedTemplates()
  await verify(flagship.id)

  log('')
  log('── PARTICIPANT LINKS (flagship) ─────────────────────────')
  for (const l of links) log(`  ${l.person.padEnd(16)} ${l.confirmed ? 'confirmed' : 'pending  '}  ${l.url}`)
  log('')
  log('── IDS ──────────────────────────────────────────────────')
  log(`flagship : ${flagship.id}  ${flagship.name}`)
  log(`idea     : ${idea.id}  ${idea.name}`)
  log(`active   : ${active.id}  ${active.name}`)
  log(`archived : ${archived.id}  ${archived.name}`)
  for (const [name, p] of people) log(`person   : ${p.id}  ${name}`)
  log('')
  log('SEED DEMO OK')
}

main().catch((err) => {
  console.error('SEED DEMO FAILED:', err)
  process.exit(1)
})
