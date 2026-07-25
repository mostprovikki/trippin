import { defineStore } from 'pinia'
import { api } from '../api/client.js'

// monotonic and module-level rather than a state field: $reset() would rewind a
// counter kept in state back to 0, so a request already in flight could end up
// holding the same number a later request is handed, and the staleness check
// below would then wave the old response through as if it were the new one.
let seq = 0

export const useArchiveStore = defineStore('archive', {
  state: () => ({
    snapshot: null,
    notes: null,
    photo_links: [],
    archived_at: null,
    actuals: [],
    error: null,
    // which trip the archive above describes, so callers can ask the store
    // rather than tracking it alongside.
    lastTripId: null,
    // newest request token per state slice; see _stale().
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
    _apply(archive) {
      this.snapshot = archive.snapshot
      this.notes = archive.notes
      this.photo_links = archive.photo_links
      this.archived_at = archive.archived_at
    },
    // The store is a singleton but the data is per-trip, and the common case —
    // "this trip is not archived" — is an ERROR (404 NOT_ARCHIVED) that leaves
    // state untouched. So without clearing first, opening an archived trip's
    // Settings and then any other trip's shows the first trip's timestamp,
    // notes and actuals, and `isArchived = !!snapshot` stays true so the second
    // trip can no longer be archived at all.
    clear() {
      this.snapshot = null
      this.notes = null
      this.photo_links = []
      this.archived_at = null
      this.actuals = []
      this.error = null
      // nothing already in flight may write into the state we just emptied.
      this.reqTokens = {}
    },
    // "This trip has no archive" as a first-class answer, for callers that can
    // already tell from the trip's own status. Asking the server instead means a
    // 404 on every visit to a live trip's Settings — the page is working, and
    // the console says otherwise, which is how genuine errors get tuned out.
    markUnarchived(tripId) {
      this.clear()
      this.lastTripId = tripId
    },
    async fetchArchive(tripId) {
      this.clear()
      // set here rather than on success, unlike the other trip-scoped stores:
      // clear() has already made the state describe this trip (as "no archive"),
      // and NOT_ARCHIVED is the normal answer for a live trip, not a failure
      // that should leave the tag pointing at the previous one.
      this.lastTripId = tripId
      const token = this._start('archive')
      try {
        const res = await api.get(`/api/trips/${tripId}/archive`)
        if (this._stale('archive', token)) return
        this._apply(res.archive)
        this.actuals = res.actuals
      } catch (e) {
        if (!this._stale('archive', token)) this.error = e.message
        throw e
      }
    },
    async archive(tripId, payload) {
      const token = this._start('archive')
      try {
        const res = await api.post(`/api/trips/${tripId}/archive`, payload)
        if (this._stale('archive', token)) return
        this._apply(res.archive)
        this.lastTripId = tripId
      } catch (e) {
        if (!this._stale('archive', token)) this.error = e.message
        throw e
      }
    },
    async saveArchiveMeta(tripId, payload) {
      const token = this._start('archive')
      try {
        const res = await api.put(`/api/trips/${tripId}/archive`, payload)
        if (this._stale('archive', token)) return
        this._apply(res.archive)
        this.lastTripId = tripId
      } catch (e) {
        if (!this._stale('archive', token)) this.error = e.message
        throw e
      }
    },
    async saveActuals(tripId, actuals) {
      // shares the 'archive' token: a fetch for another trip has already emptied
      // this list, and re-filling it from a save aimed at the trip the user left
      // would put its spend under the new trip's categories.
      const token = this._start('archive')
      try {
        const res = await api.put(`/api/trips/${tripId}/actuals`, { actuals })
        if (this._stale('archive', token)) return
        this.actuals = res.actuals
      } catch (e) {
        if (!this._stale('archive', token)) this.error = e.message
        throw e
      }
    },
    async clone(tripId, name) {
      try {
        const res = await api.post(`/api/trips/${tripId}/clone`, { name })
        return res.trip.id
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
