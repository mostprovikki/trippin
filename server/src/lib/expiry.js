export function expiryWarnings(db, tripId) {
  const trip = db.prepare('SELECT * FROM trips WHERE id = ?').get(tripId)
  if (!trip) return []
  const tripEnd = trip.end_date
    || db.prepare('SELECT max(end_date) e FROM trip_date_windows WHERE trip_id = ?').get(tripId).e
    || new Date().toISOString().slice(0, 10)
  const horizon = new Date(tripEnd); horizon.setMonth(horizon.getMonth() + 6)
  const horizonIso = horizon.toISOString().slice(0, 10)
  return db.prepare(`SELECT d.id document_id, d.doc_type, d.expiry_date, p.id person_id, p.name person_name
    FROM trip_participants tp JOIN persons p ON p.id = tp.person_id
    JOIN documents d ON d.person_id = p.id
    WHERE tp.trip_id = ? AND d.expiry_date IS NOT NULL AND d.expiry_date < ?
    ORDER BY d.expiry_date`).all(tripId, horizonIso)
    .map(r => ({ ...r, level: r.expiry_date < tripEnd ? 'expired' : 'warning' }))
}
