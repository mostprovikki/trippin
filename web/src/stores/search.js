import { defineStore } from 'pinia'
import { api } from '../api/client.js'
import { flatten } from '../utils/searchResults.js'

// Below this the server rejects the query, so the client should not send it —
// keep the two in step with server/src/routes/search.routes.js MIN_QUERY.
export const MIN_QUERY = 2
const DEBOUNCE_MS = 180

export const useSearchStore = defineStore('search', {
  state: () => ({
    query: '',
    groups: [],
    total: 0,
    loading: false,
    error: null,
    // Incremented per request so a slow early response cannot overwrite the
    // results of a later, faster one — the classic search race where deleting a
    // character leaves you looking at the longer query's hits.
    requestId: 0,
    _timer: null
  }),
  getters: {
    // One flat, ordered list so keyboard navigation is a single index.
    items: (s) => flatten(s.groups),
    tooShort: (s) => s.query.trim().length > 0 && s.query.trim().length < MIN_QUERY,
    // `!error` matters: a failed request also leaves total at 0, and without this
    // a 500 rendered "Nothing found" next to the error message — telling the user
    // their query matched nothing when in fact the search never ran.
    isEmpty: (s) => !s.loading && !s.error && s.query.trim().length >= MIN_QUERY && s.total === 0
  },
  actions: {
    // Typing calls this on every keystroke; the request is debounced so a
    // six-letter word is one round trip rather than six.
    setQuery(q, { immediate = false } = {}) {
      this.query = q
      if (this._timer) { clearTimeout(this._timer); this._timer = null }
      const trimmed = q.trim()
      if (trimmed.length < MIN_QUERY) {
        this.groups = []
        this.total = 0
        this.loading = false
        this.error = null
        return Promise.resolve()
      }
      if (immediate) return this.run()
      return new Promise((resolve) => {
        this._timer = setTimeout(() => resolve(this.run()), DEBOUNCE_MS)
      })
    },

    async run(limit) {
      const q = this.query.trim()
      if (q.length < MIN_QUERY) return
      const id = ++this.requestId
      this.loading = true
      this.error = null
      try {
        const params = new URLSearchParams({ q })
        if (limit) params.set('limit', String(limit))
        const data = await api.get(`/api/search?${params.toString()}`)
        // A stale response: a newer request has already been issued.
        if (id !== this.requestId) return
        this.groups = data.groups || []
        this.total = data.total || 0
      } catch (e) {
        if (id !== this.requestId) return
        this.error = e.message
        this.groups = []
        this.total = 0
      } finally {
        if (id === this.requestId) this.loading = false
      }
    },

    reset() {
      if (this._timer) { clearTimeout(this._timer); this._timer = null }
      this.query = ''
      this.groups = []
      this.total = 0
      this.loading = false
      this.error = null
      // Bump so any in-flight response is discarded rather than repopulating a
      // palette the user has already closed.
      this.requestId++
    }
  }
})
