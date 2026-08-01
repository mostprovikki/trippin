// Global search across the group's world: trips, people, documents, itinerary
// items, checklist templates and archived trips + their notes.
//
// Everything is scoped by organizer_id in the same way as the ownership plugin,
// including the joined rows: a document is reached through its person and an
// itinerary item through its day's trip, so neither can surface another
// organizer's data via a join that forgot to re-check.
//
// Results are returned as `kind` + ids, deliberately NOT as frontend paths —
// routing belongs to the client, and the server has no business knowing that a
// person lives at /people/:id.
import { httpError } from '../lib/errors.js'

// Below this a query matches most of the database and the result is noise, not
// search. Two characters is enough for "GB", "UK", "id".
const MIN_QUERY = 2
const DEFAULT_PER_KIND = 5
const MAX_PER_KIND = 25

// LIKE treats % and _ as wildcards, so a user searching for "50%" or "a_b" would
// otherwise get a pattern rather than a literal. Escape them and declare the
// escape character on every LIKE.
function likePattern(q) {
  return '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%'
}

// Rank so the most literal match wins: exact title, then prefix, then anything.
// Applied as a SQL expression rather than in JS so LIMIT keeps the BEST n rows
// rather than an arbitrary n.
const RANK = (col) => `CASE
  WHEN LOWER(${col}) = LOWER(:q) THEN 0
  WHEN LOWER(${col}) ILIKE LOWER(:q) || '%' ESCAPE '\\' THEN 1
  ELSE 2 END`

// The db layer (server/src/db.js) only compiles positional '?' placeholders
// into '$n' — it has no notion of the ':name' binds used below. Rewrite each
// ':name' token (skipping single-quoted text, same as compileSql) into '?' in
// occurrence order and build the matching positional params array, so the
// query text handed to app.db.all still keeps '?' per the conversion recipe.
function bindNamed(sql, named) {
  let text = '', inStr = false
  const values = []
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    if (c === "'") { inStr = !inStr; text += c; continue }
    if (!inStr && c === ':') {
      // '::' is Postgres's cast operator (e.g. COUNT(*)::int) — not a bind.
      // Emit it as literal text so the following identifier ("int") is never
      // mistaken for a ':int'-style named param.
      if (sql[i + 1] === ':') { text += '::'; i++; continue }
      const m = /^:(\w+)/.exec(sql.slice(i))
      if (m) { values.push(named[m[1]]); text += '?'; i += m[0].length - 1; continue }
    }
    text += c
  }
  return [text, values]
}

export default async function routes(app) {
  app.get('/search', {
    preHandler: app.requireOrganizer,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: MAX_PER_KIND }
        }
      }
    }
  }, async (req, reply) => {
    const raw = (req.query.q || '').trim()
    const limit = req.query.limit || DEFAULT_PER_KIND
    const organizerId = req.organizer.id

    if (raw.length && raw.length < MIN_QUERY) {
      return httpError(reply, 400, 'QUERY_TOO_SHORT', `Search needs at least ${MIN_QUERY} characters`)
    }
    if (!raw.length) return { query: '', total: 0, groups: [] }

    const params = { q: raw, like: likePattern(raw), org: organizerId, lim: limit }
    const run = async (sql) => {
      const [text, values] = bindNamed(sql, params)
      return app.db.all(text, values)
    }

    // --- trips (active and archived alike; archived ones are flagged) --------
    const trips = await run(`
      SELECT id, name AS title, destination, status, start_date, end_date, archived_at,
             ${RANK('name')} AS rank
      FROM trips
      WHERE organizer_id = :org
        AND (name ILIKE :like ESCAPE '\\' OR description ILIKE :like ESCAPE '\\'
             OR destination ILIKE :like ESCAPE '\\' OR origin_city ILIKE :like ESCAPE '\\'
             OR vibe_tags ILIKE :like ESCAPE '\\')
      ORDER BY rank, archived_at IS NOT NULL, name
      LIMIT :lim`)

    // --- people -------------------------------------------------------------
    const people = await run(`
      SELECT id, name AS title, email, phone, home_city, ${RANK('name')} AS rank
      FROM persons
      WHERE organizer_id = :org
        AND (name ILIKE :like ESCAPE '\\' OR email ILIKE :like ESCAPE '\\'
             OR phone ILIKE :like ESCAPE '\\' OR home_city ILIKE :like ESCAPE '\\'
             OR interests ILIKE :like ESCAPE '\\')
      ORDER BY rank, name
      LIMIT :lim`)

    // --- documents, by owner / type / number / filename ----------------------
    // The vision calls for "documents (by owner / type / expiry)", so the owner's
    // name and the doc type are both matchable, and expiry rides along so the UI
    // can show it.
    const documents = await run(`
      SELECT d.id, d.doc_type, d.doc_number, d.expiry_date,
             -- Aliased to "title" like every other group. Without this the UI
             -- rendered every document row as "(untitled)", because the client
             -- reads r.title and original_name alone does not satisfy it.
             d.original_name AS title, d.original_name,
             p.id AS person_id, p.name AS person_name,
             ${RANK('d.original_name')} AS rank
      FROM documents d
      JOIN persons p ON p.id = d.person_id
      WHERE p.organizer_id = :org
        AND (d.doc_number ILIKE :like ESCAPE '\\' OR d.original_name ILIKE :like ESCAPE '\\'
             OR d.doc_type ILIKE :like ESCAPE '\\' OR p.name ILIKE :like ESCAPE '\\')
      ORDER BY rank, p.name
      LIMIT :lim`)

    // --- itinerary items ----------------------------------------------------
    const itinerary = await run(`
      SELECT i.id, i.title, i.location, i.category, i.time_range,
             dy.day_date, t.id AS trip_id, t.name AS trip_name,
             ${RANK('i.title')} AS rank
      FROM itinerary_items i
      JOIN itinerary_days dy ON dy.id = i.day_id
      JOIN trips t ON t.id = dy.trip_id
      WHERE t.organizer_id = :org
        AND (i.title ILIKE :like ESCAPE '\\' OR i.location ILIKE :like ESCAPE '\\'
             OR i.notes ILIKE :like ESCAPE '\\')
      ORDER BY rank, dy.day_date, i.position
      LIMIT :lim`)

    // --- checklist templates (trip_id IS NULL / is_template) ------------------
    // Matched on the template name, its tags, or any item inside it — searching
    // for "sunscreen" should find the beach packing template that contains it.
    //
    // Templates have no trip to scope through, so they carry their own
    // organizer_id (migration 003) — that column is the isolation boundary here.
    const templates = await run(`
      SELECT c.id, c.name AS title, c.kind, c.trip_type_tags,
             (SELECT COUNT(*)::int FROM checklist_items ci WHERE ci.checklist_id = c.id) AS item_count,
             ${RANK('c.name')} AS rank
      FROM checklists c
      WHERE c.is_template = 1
        AND c.organizer_id = :org
        AND (c.name ILIKE :like ESCAPE '\\' OR c.trip_type_tags ILIKE :like ESCAPE '\\'
             OR EXISTS (SELECT 1 FROM checklist_items ci
                        WHERE ci.checklist_id = c.id AND ci.title ILIKE :like ESCAPE '\\'))
      ORDER BY rank, c.name
      LIMIT :lim`)

    // --- archived trips and their notes --------------------------------------
    // Distinct from the trips group: this matches the ARCHIVE's own notes, which
    // is where the "what we learned last time" text lives.
    const archives = await run(`
      SELECT a.trip_id AS id, t.name AS title, a.notes, a.archived_at,
             ${RANK('t.name')} AS rank
      FROM archives a
      JOIN trips t ON t.id = a.trip_id
      WHERE t.organizer_id = :org
        AND (a.notes ILIKE :like ESCAPE '\\' OR t.name ILIKE :like ESCAPE '\\')
      ORDER BY rank, a.archived_at DESC
      LIMIT :lim`)

    const strip = (rows) => rows.map(({ rank, ...rest }) => rest)
    const groups = [
      { kind: 'trip', label: 'Trips', results: strip(trips) },
      { kind: 'person', label: 'People', results: strip(people) },
      { kind: 'document', label: 'Documents', results: strip(documents) },
      { kind: 'itinerary', label: 'Itinerary', results: strip(itinerary) },
      { kind: 'template', label: 'Checklist templates', results: strip(templates) },
      { kind: 'archive', label: 'Archive', results: strip(archives) }
    ].filter((g) => g.results.length)

    return {
      query: raw,
      total: groups.reduce((n, g) => n + g.results.length, 0),
      groups
    }
  })
}
