import { defineStore } from 'pinia'
import { api } from '../api/client.js'

// monotonic and module-level rather than a state field: $reset() would rewind a
// counter kept in state back to 0, so a request already in flight could end up
// holding the same number a later request is handed, and the staleness check
// below would then wave the old response through as if it were the new one.
let seq = 0

export const useItineraryStore = defineStore('itinerary', {
  state: () => ({
    days: [],
    draft: null,
    dayDrafts: {},
    error: null,
    aiBusy: false,
    // which trip the days and drafts above belong to. the store is a singleton
    // shared by every trip, so it answers that itself instead of each view
    // remembering to $reset() it on the way in.
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
      // days and drafts for a trip the user has left must not sit under the new
      // trip's header, and an unapplied draft left behind would be written into
      // whichever trip is open when "Apply" is pressed. dropping the tokens
      // invalidates everything in flight for the old trip in one go.
      this.days = []
      this.draft = null
      this.dayDrafts = {}
      this.aiBusy = false
      this.lastTripId = null
      this.reqTokens = {}
    },
    async fetchItinerary(tripId) {
      this._forTrip(tripId)
      this.error = null
      const token = this._start('days')
      try {
        const res = await api.get(`/api/trips/${tripId}/itinerary`)
        if (this._stale('days', token)) return
        this.days = res.days
        this.lastTripId = tripId
      } catch (e) {
        // a failure belonging to a trip the user has already left would raise an
        // error banner over a page that in fact loaded fine.
        if (!this._stale('days', token)) this.error = e.message
        throw e
      }
    },
    async init(tripId) {
      const token = this._start('days')
      try {
        const res = await api.post(`/api/trips/${tripId}/itinerary/init`)
        if (this._stale('days', token)) return
        this.days = res.days
        this.lastTripId = tripId
      } catch (e) {
        if (!this._stale('days', token)) this.error = e.message
        throw e
      }
    },
    // The per-item actions below deliberately carry no token: they merge a
    // single server row into whatever collection is loaded, addressed by id, so
    // after a trip change the lookup simply finds nothing and they no-op. A
    // shared token would instead make two quick edits on different rows cancel
    // each other's UI update.
    async addItem(dayId, item) {
      try {
        const created = await api.post(`/api/days/${dayId}/items`, item)
        const day = this.days.find((d) => d.id === dayId)
        if (day) { day.items.push(created); day.items.sort((a, b) => a.position - b.position) }
        return created
      } catch (e) { this.error = e.message; throw e }
    },
    async updateItem(itemId, item) {
      try {
        const updated = await api.put(`/api/items/${itemId}`, item)
        for (const day of this.days) {
          const idx = day.items.findIndex((it) => it.id === itemId)
          if (idx !== -1) { day.items[idx] = updated; break }
        }
        return updated
      } catch (e) { this.error = e.message; throw e }
    },
    async deleteItem(itemId) {
      try {
        await api.del(`/api/items/${itemId}`)
        for (const day of this.days) {
          const idx = day.items.findIndex((it) => it.id === itemId)
          if (idx !== -1) { day.items.splice(idx, 1); break }
        }
      } catch (e) { this.error = e.message; throw e }
    },
    async reorder(dayId, itemIds) {
      try {
        const res = await api.put(`/api/days/${dayId}/items/order`, { item_ids: itemIds })
        const day = this.days.find((d) => d.id === dayId)
        if (day) day.items = res.items
      } catch (e) { this.error = e.message; throw e }
    },
    async aiDraft(tripId) {
      this.aiBusy = true
      const token = this._start('draft')
      try {
        const res = await api.post(`/api/trips/${tripId}/itinerary/ai-draft`)
        // a plan generated for the trip the user has left would be applied
        // against this trip's days, writing the wrong itinerary into it.
        if (this._stale('draft', token)) return res
        this.draft = res.days
        return res
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
      const token = this._start('days')
      try {
        const res = await api.post(`/api/trips/${tripId}/itinerary/apply-draft`, { days: this.draft })
        if (this._stale('days', token)) return
        this.days = res.days
        this.lastTripId = tripId
        this.draft = null
      } catch (e) {
        if (!this._stale('days', token)) this.error = e.message
        throw e
      }
    },
    async aiRegenDay(dayId, instruction) {
      this.aiBusy = true
      try {
        const res = await api.post(`/api/days/${dayId}/ai-regen`, instruction ? { instruction } : {})
        // keyed by day, and a trip change empties dayDrafts, so a suggestion for
        // a day the user has navigated away from can only reappear as an orphan
        // entry no card reads.
        this.dayDrafts[dayId] = res.items
        return res
      } catch (e) { this.error = e.message; throw e }
      finally { this.aiBusy = false }
    },
    async applyDay(dayId) {
      try {
        const res = await api.post(`/api/days/${dayId}/apply`, { items: this.dayDrafts[dayId] })
        const idx = this.days.findIndex((d) => d.id === dayId)
        if (idx !== -1) this.days[idx] = res.day
        delete this.dayDrafts[dayId]
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
