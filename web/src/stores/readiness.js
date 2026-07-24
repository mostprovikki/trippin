import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useReadinessStore = defineStore('readiness', {
  state: () => ({
    data: null,
    error: null,
    // The readiness API response has no trip_id, so track which trip the
    // current data belongs to (views guard refetches on it).
    lastTripId: null
  }),
  actions: {
    async fetch(tripId) {
      try {
        this.data = await api.get(`/api/trips/${tripId}/readiness`)
        this.lastTripId = tripId
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
