import { defineStore } from 'pinia'
import { api } from '../api/client.js'

// monotonic and module-level rather than a state field: $reset() would rewind a
// counter kept in state back to 0, so a request already in flight could end up
// holding the same number a later request is handed, and the staleness check
// below would then wave the old response through as if it were the new one.
let seq = 0

export const useReadinessStore = defineStore('readiness', {
  state: () => ({
    data: null,
    error: null,
    // The readiness API response has no trip_id, so track which trip the
    // current data belongs to (views guard refetches on it).
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
    async fetch(tripId) {
      // Data for another trip goes before the request so it can't be read as
      // this trip's, but data for THIS trip is left alone: TripLayout's sidebar
      // badges read the same store on every section change and would blink if
      // this cleared unconditionally.
      if (this.lastTripId !== tripId) {
        this.data = null
        // no longer describes any trip: leaving it on the old id would let a
        // view that guards on it ("do you already hold this trip?") skip the
        // refetch it needs after coming back.
        this.lastTripId = null
        this.reqTokens = {}
      }
      this.error = null
      const token = this._start('readiness')
      try {
        const data = await api.get(`/api/trips/${tripId}/readiness`)
        if (this._stale('readiness', token)) return
        this.data = data
        this.lastTripId = tripId
      } catch (e) {
        // a failure belonging to a trip the user has already left would raise an
        // error banner over a page that in fact loaded fine.
        if (!this._stale('readiness', token)) this.error = e.message
        throw e
      }
    }
  }
})
