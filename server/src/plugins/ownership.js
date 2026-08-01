import fp from 'fastify-plugin'

// Organizer data isolation. Routes resolve trips/persons through these instead
// of bare by-id lookups, so another organizer's ids read as 404 (no existence
// leak). Participant-token routes are unaffected — they authorize via the link.
export default fp(async function ownershipPlugin(app) {
  app.decorate('ownedTrip', async (req, tripId) =>
    app.db.get('SELECT * FROM trips WHERE id = ? AND organizer_id = ?', [tripId, req.organizer.id]))
  app.decorate('ownedPerson', async (req, personId) =>
    app.db.get('SELECT * FROM persons WHERE id = ? AND organizer_id = ?', [personId, req.organizer.id]))
})
