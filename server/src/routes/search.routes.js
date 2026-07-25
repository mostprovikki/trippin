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
  WHEN LOWER(${col}) LIKE LOWER(:q) || '%' ESCAPE '\\' THEN 1
  ELSE 2 END`

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
    const run = (sql) => app.db.prepare(sql).all(params)

    // --- trips (active and archived alike; archived ones are flagged) --------
    const trips = run(`
      SELECT id, name AS title, destination, status, start_date, end_date, archived_at,
             ${RANK('name')} AS rank
      FROM trips
      WHERE organizer_id = :org
        AND (name LIKE :like ESCAPE '\\' OR description LIKE :like ESCAPE '\\'
             OR destination LIKE :like ESCAPE '\\' OR origin_city LIKE :like ESCAPE '\\'
             OR vibe_tags LIKE :like ESCAPE '\\')
      ORDER BY rank, archived_at IS NOT NULL, name
      LIMIT :lim`)

    // --- people -------------------------------------------------------------
    const people = run(`
      SELECT id, name AS title, email, phone, home_city, ${RANK('name')} AS rank
      FROM persons
      WHERE organizer_id = :org
        AND (name LIKE :like ESCAPE '\\' OR email LIKE :like ESCAPE '\\'
             OR phone LIKE :like ESCAPE '\\' OR home_city LIKE :like ESCAPE '\\'
             OR interests LIKE :like ESCAPE '\\')
      ORDER BY rank, name
      LIMIT :lim`)

    // --- documents, by owner / type / number / filename ----------------------
    // The vision calls for "documents (by owner / type / expiry)", so the owner's
    // name and the doc type are both matchable, and expiry rides along so the UI
    // can show it.
    const documents = run(`
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
        AND (d.doc_number LIKE :like ESCAPE '\\' OR d.original_name LIKE :like ESCAPE '\\'
             OR d.doc_type LIKE :like ESCAPE '\\' OR p.name LIKE :like ESCAPE '\\')
      ORDER BY rank, p.name
      LIMIT :lim`)

    // --- itinerary items ----------------------------------------------------
    const itinerary = run(`
      SELECT i.id, i.title, i.location, i.category, i.time_range,
             dy.day_date, t.id AS trip_id, t.name AS trip_name,
             ${RANK('i.title')} AS rank
      FROM itinerary_items i
      JOIN itinerary_days dy ON dy.id = i.day_id
      JOIN trips t ON t.id = dy.trip_id
      WHERE t.organizer_id = :org
        AND (i.title LIKE :like ESCAPE '\\' OR i.location LIKE :like ESCAPE '\\'
             OR i.notes LIKE :like ESCAPE '\\')
      ORDER BY rank, dy.day_date, i.position
      LIMIT :lim`)

    // --- checklist templates (trip_id IS NULL / is_template) ------------------
    // Matched on the template name, its tags, or any item inside it — searching
    // for "sunscreen" should find the beach packing template that contains it.
    //
    // NOTE, and it is a real gap rather than an oversight here: `checklists` has
    // no organizer_id column, so templates are GLOBAL — every organizer sees
    // every template. This query therefore cannot scope them, and it is the one
    // group in this endpoint that is not isolated. Adding the column means a
    // second migration, and 001_init.sql is currently the only one by contract
    // (see AGENTS.md §2), so it needs a deliberate decision rather than a
    // drive-by schema change. Flagged for the owner.
    const templates = run(`
      SELECT c.id, c.name AS title, c.kind, c.trip_type_tags,
             (SELECT COUNT(*) FROM checklist_items ci WHERE ci.checklist_id = c.id) AS item_count,
             ${RANK('c.name')} AS rank
      FROM checklists c
      WHERE c.is_template = 1
        AND (c.name LIKE :like ESCAPE '\\' OR c.trip_type_tags LIKE :like ESCAPE '\\'
             OR EXISTS (SELECT 1 FROM checklist_items ci
                        WHERE ci.checklist_id = c.id AND ci.title LIKE :like ESCAPE '\\'))
      ORDER BY rank, c.name
      LIMIT :lim`)

    // --- archived trips and their notes --------------------------------------
    // Distinct from the trips group: this matches the ARCHIVE's own notes, which
    // is where the "what we learned last time" text lives.
    const archives = run(`
      SELECT a.trip_id AS id, t.name AS title, a.notes, a.archived_at,
             ${RANK('t.name')} AS rank
      FROM archives a
      JOIN trips t ON t.id = a.trip_id
      WHERE t.organizer_id = :org
        AND (a.notes LIKE :like ESCAPE '\\' OR t.name LIKE :like ESCAPE '\\')
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
