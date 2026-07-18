import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useTripsStore = defineStore('trips', {
  state: () => ({ trips: [], current: null, candidates: [], links: [], error: null, aiBusy: false }),
  actions: {
    async fetchTrips() {
      try {
        this.trips = (await api.get('/api/trips')).trips
      } catch (e) { this.error = e.message; throw e }
    },
    async fetchTrip(id) {
      try {
        this.current = (await api.get(`/api/trips/${id}`)).trip
        return this.current
      } catch (e) { this.error = e.message; throw e }
    },
    async createTrip(payload) {
      try {
        const trip = (await api.post('/api/trips', payload)).trip
        this.trips.push(trip)
        this.current = trip
        return trip
      } catch (e) { this.error = e.message; throw e }
    },
    async updateTrip(id, partial) {
      try {
        const trip = (await api.put(`/api/trips/${id}`, partial)).trip
        this.current = trip
        return trip
      } catch (e) { this.error = e.message; throw e }
    },
    async setStatus(id, status) {
      try {
        const trip = (await api.post(`/api/trips/${id}/status`, { status })).trip
        this.current = trip
        return trip
      } catch (e) { this.error = e.message; throw e }
    },
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
    async addParticipant(id, personId) {
      try {
        const trip = (await api.post(`/api/trips/${id}/participants`, { person_id: personId })).trip
        this.current = trip
        return trip
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
    async fetchCandidates(id) {
      try {
        this.candidates = (await api.get(`/api/trips/${id}/candidates`)).candidates
      } catch (e) { this.error = e.message; throw e }
    },
    async addCandidate(id, fields) {
      try {
        const candidate = (await api.post(`/api/trips/${id}/candidates`, fields)).candidate
        this.candidates.push(candidate)
        return candidate
      } catch (e) { this.error = e.message; throw e }
    },
    async aiSuggest(id) {
      this.aiBusy = true
      try {
        this.candidates = (await api.post(`/api/trips/${id}/candidates/ai-suggest`)).candidates
        return this.candidates
      } catch (e) { this.error = e.message; throw e }
      finally { this.aiBusy = false }
    },
    async decide(candidateId) {
      try {
        const trip = (await api.post(`/api/candidates/${candidateId}/decide`)).trip
        this.current = trip
        this.candidates = this.candidates.map((c) => ({ ...c, decided: c.id === candidateId ? 1 : 0 }))
        return trip
      } catch (e) { this.error = e.message; throw e }
    },
    async deleteCandidate(candidateId) {
      try {
        await api.del(`/api/candidates/${candidateId}`)
        this.candidates = this.candidates.filter((c) => c.id !== candidateId)
      } catch (e) { this.error = e.message; throw e }
    },
    async createLink(tripId, personId) {
      try {
        return await api.post(`/api/trips/${tripId}/participants/${personId}/link`)
      } catch (e) { this.error = e.message; throw e }
    },
    async fetchLinks(tripId) {
      try {
        this.links = (await api.get(`/api/trips/${tripId}/links`)).links
      } catch (e) { this.error = e.message; throw e }
    },
    async revokeLink(linkId) {
      try {
        await api.post(`/api/links/${linkId}/revoke`)
        const link = this.links.find((l) => l.id === linkId)
        if (link) link.revoked_at = new Date().toISOString()
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
