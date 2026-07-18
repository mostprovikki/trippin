import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useReadinessStore = defineStore('readiness', {
  state: () => ({
    data: null,
    error: null
  }),
  actions: {
    async fetch(tripId) {
      try {
        this.data = await api.get(`/api/trips/${tripId}/readiness`)
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
