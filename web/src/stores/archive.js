import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useArchiveStore = defineStore('archive', {
  state: () => ({
    snapshot: null,
    notes: null,
    photo_links: [],
    archived_at: null,
    actuals: [],
    error: null
  }),
  actions: {
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
    },
    async fetchArchive(tripId) {
      this.clear()
      try {
        const res = await api.get(`/api/trips/${tripId}/archive`)
        this._apply(res.archive)
        this.actuals = res.actuals
      } catch (e) { this.error = e.message; throw e }
    },
    async archive(tripId, payload) {
      try {
        const res = await api.post(`/api/trips/${tripId}/archive`, payload)
        this._apply(res.archive)
      } catch (e) { this.error = e.message; throw e }
    },
    async saveArchiveMeta(tripId, payload) {
      try {
        const res = await api.put(`/api/trips/${tripId}/archive`, payload)
        this._apply(res.archive)
      } catch (e) { this.error = e.message; throw e }
    },
    async saveActuals(tripId, actuals) {
      try {
        const res = await api.put(`/api/trips/${tripId}/actuals`, { actuals })
        this.actuals = res.actuals
      } catch (e) { this.error = e.message; throw e }
    },
    async clone(tripId, name) {
      try {
        const res = await api.post(`/api/trips/${tripId}/clone`, { name })
        return res.trip.id
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
