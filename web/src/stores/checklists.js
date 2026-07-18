import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useChecklistsStore = defineStore('checklists', {
  state: () => ({
    checklists: [],
    templates: [],
    packingDraft: null,
    error: null,
    aiBusy: false
  }),
  actions: {
    _findChecklist(id) {
      return this.checklists.find((c) => c.id === id) || this.templates.find((c) => c.id === id)
    },
    _findChecklistWithItem(itemId) {
      return [...this.checklists, ...this.templates].find((c) => (c.items || []).some((i) => i.id === itemId))
    },

    async fetchForTrip(tripId) {
      try {
        this.checklists = (await api.get(`/api/trips/${tripId}/checklists`)).checklists
      } catch (e) { this.error = e.message; throw e }
    },
    async fetchTemplates() {
      try {
        this.templates = (await api.get('/api/checklists?template=1')).checklists
      } catch (e) { this.error = e.message; throw e }
    },
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
      try {
        const res = await api.post(`/api/checklists/${checklistId}/ai-packing-suggest`)
        this.packingDraft = { checklistId, items: res.items }
      } catch (e) { this.error = e.message; throw e }
      finally { this.aiBusy = false }
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
