import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useBudgetStore = defineStore('budget', {
  state: () => ({
    lines: [],
    total: 0,
    equal_share: 0,
    participant_count: 0,
    overrides: [],
    draft: null,
    error: null,
    aiBusy: false
  }),
  actions: {
    _apply(res) {
      this.lines = res.lines
      this.total = res.total
      this.equal_share = res.equal_share
      this.participant_count = res.participant_count
      this.overrides = res.overrides
    },
    async fetchBudget(tripId) {
      try {
        this._apply(await api.get(`/api/trips/${tripId}/budget`))
      } catch (e) { this.error = e.message; throw e }
    },
    async saveLines(tripId, lines) {
      try {
        this._apply(await api.put(`/api/trips/${tripId}/budget`, { lines }))
      } catch (e) { this.error = e.message; throw e }
    },
    async saveOverrides(tripId, overrides) {
      try {
        this._apply(await api.put(`/api/trips/${tripId}/budget/overrides`, { overrides }))
      } catch (e) { this.error = e.message; throw e }
    },
    async aiDraft(tripId) {
      this.aiBusy = true
      try {
        this.draft = (await api.post(`/api/trips/${tripId}/budget/ai-draft`)).lines
      } catch (e) { this.error = e.message; throw e }
      finally { this.aiBusy = false }
    },
    async applyDraft(tripId) {
      if (!this.draft) return
      try {
        const lines = this.draft
        this._apply(await api.put(`/api/trips/${tripId}/budget`, { lines }))
        this.draft = null
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
