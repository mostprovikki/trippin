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
    async fetchMe() {
      try { this.organizer = (await api.get('/api/auth/me')).organizer } catch { this.organizer = null }
      await this.fetchAi()
    },
    async fetchAi() {
      try { this.aiEnabled = (await api.get('/api/ai/status')).enabled } catch { this.aiEnabled = false }
    }
  }
})
