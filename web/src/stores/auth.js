import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({ organizer: null, aiEnabled: false }),
  actions: {
    async login(email, password) {
      this.organizer = (await api.post('/api/auth/login', { email, password })).organizer
      await this.fetchAi()
    },
    async logout() { await api.post('/api/auth/logout'); this.organizer = null },
    // Both of these are probes, so they opt out of the 401 redirect. Without
    // that, fetchMe() on a signed-out visitor dispatches tripper:unauthorized,
    // whose handler routes to /login, whose guard calls fetchMe() again — a loop
    // that fires thousands of times a second. A 401 here is the answer, not an
    // error: it means "not signed in", which is exactly what this sets.
    async fetchMe() {
      try { this.organizer = (await api.get('/api/auth/me', { redirectOn401: false })).organizer } catch { this.organizer = null }
      await this.fetchAi()
    },
    async fetchAi() {
      try { this.aiEnabled = (await api.get('/api/ai/status', { redirectOn401: false })).enabled } catch { this.aiEnabled = false }
    }
  }
})
