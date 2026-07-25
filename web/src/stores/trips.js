import { defineStore } from 'pinia'
import { api } from '../api/client.js'

// monotonic and module-level rather than a state field: $reset() would rewind a
// counter kept in state back to 0, so a request already in flight could end up
// holding the same number a later request is handed, and the staleness check
// below would then wave the old response through as if it were the new one.
let seq = 0

export const useTripsStore = defineStore('trips', {
  state: () => ({
    // the organizer's whole list. deliberately outside everything the trip tag
    // below governs: it is not one trip's data and must survive a trip change,
    // or the trips list would blank itself every time a trip page is opened.
    trips: [],
    current: null,
    candidates: [],
    links: [],
    error: null,
    aiBusy: false,
    // which trip `current`, `candidates` and `links` describe. the store is a
    // singleton shared by every trip, so it answers that itself instead of each
    // view remembering to hand-clear the slice it reads on the way in.
    lastTripId: null,
    // newest request token per state slice. keyed rather than a single counter
    // because three separate views load three different slices of the same trip
    // at once — the layout the trip, Destination the candidates, People the
    // links — and one store-wide counter would make each of them look superseded
    // by the next and silently drop a list that was on its way in.
    reqTokens: {}
  }),
  actions: {
    _start(key) {
      this.reqTokens[key] = ++seq
      return this.reqTokens[key]
    },
    _stale(key, token) {
      // something newer claimed this slice while the request was out — usually
      // the user switched trips mid-flight. what the newer request writes is the
      // answer to the question being asked now, so this older, slower response
      // has to be dropped instead of landing on top of it.
      return this.reqTokens[key] !== token
    },
    _forTrip(tripId) {
      if (this.lastTripId === tripId) return
      // one trip's header, candidates and links must not sit under another
      // trip's id while its own requests are still out: empty is honest, stale
      // is a lie, and a stale `current` is worse than cosmetic — TripDatesView
      // saves windows to `current.id`, so leaving the previous trip in place
      // makes an ordinary save write to the wrong trip.
      this.current = null
      this.candidates = []
      this.links = []
      this.aiBusy = false
      // dropping the tokens invalidates everything in flight for the old trip in
      // one go, whichever slice it was going to write. the trips list is not
      // trip-scoped, so its token is carried over rather than dropped.
      this.reqTokens = { list: this.reqTokens.list }
      // tagged here rather than when the first response lands, unlike the other
      // trip-scoped stores: those have a single per-trip fetch, this one has
      // three that fire together. with the tag left null until success, the
      // second fetch to start would find `lastTripId !== tripId` still true,
      // clear the tokens again, and the first fetch's response would come back
      // to a slice nothing is waiting for and be discarded as stale.
      this.lastTripId = tripId
    },
    async fetchTrips() {
      // its own token, kept out of _forTrip's reset: the list belongs to the
      // organizer rather than to any trip, so a trip change must not cancel it,
      // and two overlapping refreshes — a "Try again" on top of a slow first
      // load — still have to resolve in the order they were asked for.
      const token = this._start('list')
      try {
        const res = await api.get('/api/trips')
        if (this._stale('list', token)) return
        this.trips = res.trips
      } catch (e) {
        if (!this._stale('list', token)) this.error = e.message
        throw e
      }
    },
    async fetchTrip(id) {
      this._forTrip(id)
      this.error = null
      const token = this._start('trip')
      try {
        const trip = (await api.get(`/api/trips/${id}`)).trip
        if (this._stale('trip', token)) return
        this.current = trip
        return trip
      } catch (e) {
        // a failure belonging to a trip the user has already left would raise an
        // error banner over a page that in fact loaded fine.
        if (!this._stale('trip', token)) this.error = e.message
        throw e
      }
    },
    async createTrip(payload) {
      try {
        const trip = (await api.post('/api/trips', payload)).trip
        // the list is not trip-scoped, so a newly created trip always belongs in
        // it. `current` is: the wizard routes straight to the new trip, so
        // tagging it here keeps the tag naming whichever trip `current` holds.
        this.trips.push(trip)
        this.current = trip
        this.lastTripId = trip.id
        return trip
      } catch (e) { this.error = e.message; throw e }
    },
    async updateTrip(id, partial) {
      const token = this._start('trip')
      try {
        const trip = (await api.put(`/api/trips/${id}`, partial)).trip
        // the response is a whole trip record that replaces the header, so a
        // save landing after the user opened another trip would rename that
        // trip on screen. returning nothing rather than the record matters too:
        // TripSettingsView feeds the return value back into a draft keyed by the
        // trip now in the route, which would be the wrong trip's draft.
        if (this._stale('trip', token)) return
        this.current = trip
        this.lastTripId = id
        return trip
      } catch (e) {
        if (!this._stale('trip', token)) this.error = e.message
        throw e
      }
    },
    async setStatus(id, status) {
      const token = this._start('trip')
      try {
        const trip = (await api.post(`/api/trips/${id}/status`, { status })).trip
        if (this._stale('trip', token)) return
        this.current = trip
        this.lastTripId = id
        return trip
      } catch (e) {
        if (!this._stale('trip', token)) this.error = e.message
        throw e
      }
    },
    // The five actions below deliberately carry no token: each merges one server
    // row into `current` addressed by id, or is already gated on
    // `current.id === id`, so after a trip change the lookup finds nothing and
    // they quietly no-op. A shared token would instead make two quick edits to
    // different goals cancel each other's UI update.
    async saveWindows(id, windows) {
      try {
        const saved = (await api.put(`/api/trips/${id}/windows`, { windows })).windows
        if (this.current && this.current.id === id) this.current.windows = saved
        return saved
      } catch (e) { this.error = e.message; throw e }
    },
    async addGoal(id, goal) {
      try {
        const created = await api.post(`/api/trips/${id}/goals`, goal)
        if (this.current && this.current.id === id) this.current.goals.push(created)
        return created
      } catch (e) { this.error = e.message; throw e }
    },
    async updateGoal(goalId, goal) {
      try {
        const updated = await api.put(`/api/goals/${goalId}`, goal)
        if (this.current) {
          const idx = this.current.goals.findIndex((g) => g.id === goalId)
          if (idx !== -1) this.current.goals.splice(idx, 1, updated)
        }
        return updated
      } catch (e) { this.error = e.message; throw e }
    },
    async deleteGoal(goalId) {
      try {
        await api.del(`/api/goals/${goalId}`)
        if (this.current) this.current.goals = this.current.goals.filter((g) => g.id !== goalId)
      } catch (e) { this.error = e.message; throw e }
    },
    async removeParticipant(id, personId) {
      try {
        await api.del(`/api/trips/${id}/participants/${personId}`)
        if (this.current && this.current.id === id) {
          this.current.participants = this.current.participants.filter((p) => p.person_id !== personId)
        }
      } catch (e) { this.error = e.message; throw e }
    },
    async addParticipant(id, personId) {
      // tokened, unlike removeParticipant: the response is a whole trip record
      // that replaces `current` outright rather than a row looked up by id.
      const token = this._start('trip')
      try {
        const trip = (await api.post(`/api/trips/${id}/participants`, { person_id: personId })).trip
        if (this._stale('trip', token)) return
        this.current = trip
        this.lastTripId = id
        return trip
      } catch (e) {
        if (!this._stale('trip', token)) this.error = e.message
        throw e
      }
    },
    async fetchCandidates(id) {
      this._forTrip(id)
      this.error = null
      const token = this._start('candidates')
      try {
        const res = await api.get(`/api/trips/${id}/candidates`)
        if (this._stale('candidates', token)) return
        this.candidates = res.candidates
      } catch (e) {
        if (!this._stale('candidates', token)) this.error = e.message
        throw e
      }
    },
    // Not a superseded fetch but a create: the row exists on the server whatever
    // the client decides, so the question is ownership rather than staleness.
    // It is appended only when it belongs to the trip on screen; when it doesn't
    // the action still resolves with the created row, so the caller can report
    // the create as the success it was, and the row shows up the next time its
    // own trip is opened. A token here would instead drop it whenever any newer
    // candidates request had started, including a refetch of the same trip.
    async addCandidate(id, fields) {
      try {
        const candidate = (await api.post(`/api/trips/${id}/candidates`, fields)).candidate
        if (this.lastTripId === id) this.candidates.push(candidate)
        return candidate
      } catch (e) { this.error = e.message; throw e }
    },
    async aiSuggest(id) {
      this.aiBusy = true
      const token = this._start('candidates')
      try {
        const res = await api.post(`/api/trips/${id}/candidates/ai-suggest`)
        // destinations generated for the trip the user has left would be listed
        // as this trip's shortlist and could be decided on from here.
        if (this._stale('candidates', token)) return
        this.candidates = res.candidates
        return this.candidates
      } catch (e) {
        if (!this._stale('candidates', token)) this.error = e.message
        throw e
      } finally {
        // deliberately unguarded: a superseded request that never cleared this
        // would leave the spinner running forever, and whichever request is
        // current sets it back to true for itself.
        this.aiBusy = false
      }
    },
    async decide(candidateId) {
      // rides the 'trip' token because the header is what it overwrites; the
      // candidate rewrite rides along because both describe one trip, and a
      // fresh 'trip' token proves no other trip has been asked for since. The
      // rewrite could not be left id-addressed like the goal actions: it clears
      // `decided` on every row it touches, so run against another trip's
      // shortlist it would silently un-decide that trip's chosen destination.
      const token = this._start('trip')
      try {
        const trip = (await api.post(`/api/candidates/${candidateId}/decide`)).trip
        if (this._stale('trip', token)) return
        this.current = trip
        this.lastTripId = trip.id
        this.candidates = this.candidates.map((c) => ({ ...c, decided: c.id === candidateId ? 1 : 0 }))
        return trip
      } catch (e) {
        if (!this._stale('trip', token)) this.error = e.message
        throw e
      }
    },
    async deleteCandidate(candidateId) {
      // no token: a removal addressed by id no-ops against another trip's list.
      try {
        await api.del(`/api/candidates/${candidateId}`)
        this.candidates = this.candidates.filter((c) => c.id !== candidateId)
      } catch (e) { this.error = e.message; throw e }
    },
    async createLink(tripId, personId) {
      // writes no store state — the one-time URL is shown by the caller and
      // deliberately never kept here.
      try {
        return await api.post(`/api/trips/${tripId}/participants/${personId}/link`)
      } catch (e) { this.error = e.message; throw e }
    },
    async fetchLinks(tripId) {
      this._forTrip(tripId)
      this.error = null
      const token = this._start('links')
      try {
        const res = await api.get(`/api/trips/${tripId}/links`)
        if (this._stale('links', token)) return
        this.links = res.links
      } catch (e) {
        if (!this._stale('links', token)) this.error = e.message
        throw e
      }
    },
    async revokeLink(linkId) {
      // no token: addressed by id, so it no-ops against another trip's links.
      try {
        await api.post(`/api/links/${linkId}/revoke`)
        const link = this.links.find((l) => l.id === linkId)
        if (link) link.revoked_at = new Date().toISOString()
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
