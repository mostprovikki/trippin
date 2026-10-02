import { defineStore } from 'pinia'
import { api } from '../api/client.js'

// module-level for the same reason as readiness.js: $reset() must not rewind it
let seq = 0

// "Since you last looked" (tripper.md §2). fetchSeen also records the visit
// server-side, so the Overview calls it once per open.
export const useOverviewStore = defineStore('overview', {
  state: () => ({ since: null, events: [], more: 0, lastTripId: null, error: null, token: 0 }),
  actions: {
    async fetchSeen(tripId) {
      if (this.lastTripId !== tripId) {
        this.since = null
        this.events = []
        this.more = 0
        this.lastTripId = null
      }
      this.error = null
      const token = ++seq
      this.token = token
      try {
        const res = await api.post(`/api/trips/${tripId}/seen`)
        if (this.token !== token) return
        this.since = res.since
        this.events = res.events
        this.more = res.more || 0
        this.lastTripId = tripId
      } catch (e) {
        if (this.token === token) this.error = e.message
        throw e
      }
    }
  }
})
