import { defineStore } from 'pinia'
import { api } from '../api/client.js'

// monotonic and module-level rather than a state field: $reset() would rewind a
// counter kept in state back to 0, so a request already in flight could end up
// holding the same number a later request is handed, and the staleness check
// below would then wave the old response through as if it were the new one.
let seq = 0

export const useBudgetStore = defineStore('budget', {
  state: () => ({
    lines: [],
    total: 0,
    equal_share: 0,
    participant_count: 0,
    overrides: [],
    draft: null,
    error: null,
    aiBusy: false,
    // which trip everything above describes. the store is a singleton shared by
    // every trip, so it answers that itself instead of each view remembering to
    // $reset() it on the way in.
    lastTripId: null,
    // newest request token per state slice. keyed rather than a single counter
    // so two requests writing different slices don't cancel each other.
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
      // numbers for a trip the user has left must not sit under the new trip's
      // header while its own request is still out: empty is honest, stale is a
      // lie. dropping the tokens invalidates everything in flight for the old
      // trip in one go, whichever slice it was going to write.
      this.lines = []
      this.total = 0
      this.equal_share = 0
      this.participant_count = 0
      this.overrides = []
      this.draft = null
      this.aiBusy = false
      this.lastTripId = null
      this.reqTokens = {}
    },
    _apply(res) {
      this.lines = res.lines
      this.total = res.total
      this.equal_share = res.equal_share
      this.participant_count = res.participant_count
      this.overrides = res.overrides
    },
    async fetchBudget(tripId) {
      this._forTrip(tripId)
      this.error = null
      const token = this._start('budget')
      try {
        const res = await api.get(`/api/trips/${tripId}/budget`)
        if (this._stale('budget', token)) return
        this._apply(res)
        this.lastTripId = tripId
      } catch (e) {
        // a failure belonging to a trip the user has already left would raise an
        // error banner over a page that in fact loaded fine.
        if (!this._stale('budget', token)) this.error = e.message
        throw e
      }
    },
    async saveLines(tripId, lines) {
      const token = this._start('budget')
      try {
        const res = await api.put(`/api/trips/${tripId}/budget`, { lines })
        if (this._stale('budget', token)) return
        this._apply(res)
        this.lastTripId = tripId
      } catch (e) {
        if (!this._stale('budget', token)) this.error = e.message
        throw e
      }
    },
    async saveOverrides(tripId, overrides) {
      const token = this._start('budget')
      try {
        const res = await api.put(`/api/trips/${tripId}/budget/overrides`, { overrides })
        if (this._stale('budget', token)) return
        this._apply(res)
        this.lastTripId = tripId
      } catch (e) {
        if (!this._stale('budget', token)) this.error = e.message
        throw e
      }
    },
    async aiDraft(tripId) {
      this.aiBusy = true
      const token = this._start('draft')
      try {
        const res = await api.post(`/api/trips/${tripId}/budget/ai-draft`)
        // suggestions computed for the trip the user has left would be applied
        // against this trip's categories, writing its numbers into the wrong
        // budget the moment "Apply" is pressed.
        if (this._stale('draft', token)) return
        this.draft = res.lines
      } catch (e) {
        if (!this._stale('draft', token)) this.error = e.message
        throw e
      } finally {
        // deliberately unguarded: a superseded request that never cleared this
        // would leave the spinner running forever, and whichever request is
        // current sets it back to true for itself.
        this.aiBusy = false
      }
    },
    async applyDraft(tripId) {
      if (!this.draft) return
      const token = this._start('budget')
      try {
        const lines = this.draft
        const res = await api.put(`/api/trips/${tripId}/budget`, { lines })
        if (this._stale('budget', token)) return
        this._apply(res)
        this.lastTripId = tripId
        this.draft = null
      } catch (e) {
        if (!this._stale('budget', token)) this.error = e.message
        throw e
      }
    }
  }
})
