import { defineStore } from 'pinia'
import { api } from '../api/client.js'

// monotonic and module-level rather than a state field: $reset() would rewind a
// counter kept in state back to 0, so a request already in flight could end up
// holding the same number a later request is handed, and the staleness check
// below would then wave the old response through as if it were the new one.
let seq = 0

export const useChecklistsStore = defineStore('checklists', {
  state: () => ({
    checklists: [],
    templates: [],
    packingDraft: null,
    error: null,
    aiBusy: false,
    // which trip `checklists` belongs to (templates are organizer-scoped, not
    // trip-scoped). the store is a singleton shared by every trip, so it answers
    // that itself instead of each view hand-clearing it on the way in.
    lastTripId: null,
    // newest request token per state slice. keyed rather than a single counter
    // because the checklists view fires the trip fetch and the template fetch
    // together, and a shared counter would make them cancel each other.
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
      // lists for a trip the user has left must not sit under the new trip's
      // header while its own request is out, and a packing suggestion is tied to
      // a checklist that no longer exists here.
      this.checklists = []
      this.packingDraft = null
      this.aiBusy = false
      this.lastTripId = null
      // invalidates everything in flight for the old trip. templates survive a
      // trip change, so their token is carried over rather than dropped.
      this.reqTokens = { templates: this.reqTokens.templates }
    },
    _findChecklist(id) {
      return this.checklists.find((c) => c.id === id) || this.templates.find((c) => c.id === id)
    },
    _findChecklistWithItem(itemId) {
      return [...this.checklists, ...this.templates].find((c) => (c.items || []).some((i) => i.id === itemId))
    },

    async fetchForTrip(tripId) {
      this._forTrip(tripId)
      this.error = null
      const token = this._start('checklists')
      try {
        const res = await api.get(`/api/trips/${tripId}/checklists`)
        if (this._stale('checklists', token)) return
        this.checklists = res.checklists
        this.lastTripId = tripId
      } catch (e) {
        // a failure belonging to a trip the user has already left would raise an
        // error banner over a page that in fact loaded fine.
        if (!this._stale('checklists', token)) this.error = e.message
        throw e
      }
    },
    async fetchTemplates() {
      this.error = null
      const token = this._start('templates')
      try {
        const res = await api.get('/api/checklists?template=1')
        if (this._stale('templates', token)) return
        this.templates = res.checklists
      } catch (e) {
        if (!this._stale('templates', token)) this.error = e.message
        throw e
      }
    },
    // The actions below deliberately carry no token: each appends or removes one
    // row addressed by id, so after a trip change they act on a list that no
    // longer contains it and quietly no-op. A shared token would instead make
    // two quick edits on different rows cancel each other's UI update.
    async createChecklist(payload) {
      try {
        const checklist = (await api.post('/api/checklists', payload)).checklist
        if (checklist.is_template) this.templates.push(checklist)
        else this.checklists.push(checklist)
        return checklist
      } catch (e) { this.error = e.message; throw e }
    },
    async deleteChecklist(id) {
      try {
        await api.del(`/api/checklists/${id}`)
        this.checklists = this.checklists.filter((c) => c.id !== id)
        this.templates = this.templates.filter((c) => c.id !== id)
      } catch (e) { this.error = e.message; throw e }
    },
    async addItem(checklistId, item) {
      try {
        const newItem = await api.post(`/api/checklists/${checklistId}/items`, item)
        const checklist = this._findChecklist(checklistId)
        if (checklist) checklist.items.push(newItem)
        return newItem
      } catch (e) { this.error = e.message; throw e }
    },
    async updateItem(itemId, fields) {
      try {
        const updated = await api.put(`/api/checklist-items/${itemId}`, fields)
        const checklist = this._findChecklistWithItem(itemId)
        if (checklist) {
          const idx = checklist.items.findIndex((i) => i.id === itemId)
          if (idx !== -1) checklist.items.splice(idx, 1, updated)
        }
        return updated
      } catch (e) { this.error = e.message; throw e }
    },
    async deleteItem(itemId) {
      try {
        const checklist = this._findChecklistWithItem(itemId)
        await api.del(`/api/checklist-items/${itemId}`)
        if (checklist) checklist.items = checklist.items.filter((i) => i.id !== itemId)
      } catch (e) { this.error = e.message; throw e }
    },
    async fromTemplate(tripId, templateId) {
      try {
        const checklist = (await api.post(`/api/trips/${tripId}/checklists/from-template`, { template_id: templateId })).checklist
        this.checklists.push(checklist)
        return checklist
      } catch (e) { this.error = e.message; throw e }
    },
    async promoteToTemplate(checklistId, name) {
      try {
        const checklist = (await api.post(`/api/checklists/${checklistId}/promote-to-template`, { name })).checklist
        this.templates.push(checklist)
        return checklist
      } catch (e) { this.error = e.message; throw e }
    },
    async aiPackingSuggest(checklistId) {
      this.aiBusy = true
      const token = this._start('packing')
      try {
        const res = await api.post(`/api/checklists/${checklistId}/ai-packing-suggest`)
        // suggestions for a checklist the user has navigated away from would sit
        // in the one draft slot the cards share and be applied to the wrong list.
        if (this._stale('packing', token)) return
        this.packingDraft = { checklistId, items: res.items }
      } catch (e) {
        if (!this._stale('packing', token)) this.error = e.message
        throw e
      } finally {
        // deliberately unguarded: a superseded request that never cleared this
        // would leave the spinner running forever, and whichever request is
        // current sets it back to true for itself.
        this.aiBusy = false
      }
    },
    async applyPackingDraft(checklistId) {
      try {
        const draft = this.packingDraft
        if (!draft || draft.checklistId !== checklistId) return
        const checklist = this._findChecklist(checklistId)
        for (const item of draft.items) {
          const newItem = await api.post(`/api/checklists/${checklistId}/items`, { title: item.title })
          if (checklist) checklist.items.push(newItem)
        }
        this.packingDraft = null
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
