import fp from 'fastify-plugin'

// Organizer data isolation. Routes resolve trips/persons through these instead
// of bare by-id lookups, so another organizer's ids read as 404 (no existence
// leak). Participant-token routes are unaffected — they authorize via the link.
export default fp(async function ownershipPlugin(app) {
  app.decorate('ownedTrip', (req, tripId) =>
    app.db.prepare('SELECT * FROM trips WHERE id = ? AND organizer_id = ?').get(tripId, req.organizer.id))
  app.decorate('ownedPerson', (req, personId) =>
    app.db.prepare('SELECT * FROM persons WHERE id = ? AND organizer_id = ?').get(personId, req.organizer.id))
})
