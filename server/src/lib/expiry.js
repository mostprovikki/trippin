export async function expiryWarnings(db, tripId) {
  const trip = await db.get('SELECT * FROM trips WHERE id = ?', [tripId])
  if (!trip) return []
  const tripEnd = trip.end_date
    || (await db.get('SELECT max(end_date) e FROM trip_date_windows WHERE trip_id = ?', [tripId])).e
    || new Date().toISOString().slice(0, 10)
  const horizon = new Date(tripEnd); horizon.setMonth(horizon.getMonth() + 6)
  const horizonIso = horizon.toISOString().slice(0, 10)
  const rows = await db.all(`SELECT d.id AS document_id, d.doc_type, d.expiry_date, p.id AS person_id, p.name AS person_name
    FROM trip_participants tp JOIN persons p ON p.id = tp.person_id
    JOIN documents d ON d.person_id = p.id
    WHERE tp.trip_id = ? AND d.expiry_date IS NOT NULL AND d.expiry_date < ?
    ORDER BY d.expiry_date`, [tripId, horizonIso])
  return rows.map(r => ({ ...r, level: r.expiry_date < tripEnd ? 'expired' : 'warning' }))
}
