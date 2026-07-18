import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const useItineraryStore = defineStore('itinerary', {
  state: () => ({ days: [], draft: null, dayDrafts: {}, error: null, aiBusy: false }),
  actions: {
    async fetchItinerary(tripId) {
      try {
        const res = await api.get(`/api/trips/${tripId}/itinerary`)
        this.days = res.days
      } catch (e) { this.error = e.message; throw e }
    },
    async init(tripId) {
      try {
        const res = await api.post(`/api/trips/${tripId}/itinerary/init`)
        this.days = res.days
      } catch (e) { this.error = e.message; throw e }
    },
    async addItem(dayId, item) {
      try {
        const created = await api.post(`/api/days/${dayId}/items`, item)
        const day = this.days.find((d) => d.id === dayId)
        if (day) { day.items.push(created); day.items.sort((a, b) => a.position - b.position) }
        return created
      } catch (e) { this.error = e.message; throw e }
    },
    async updateItem(itemId, item) {
      try {
        const updated = await api.put(`/api/items/${itemId}`, item)
        for (const day of this.days) {
          const idx = day.items.findIndex((it) => it.id === itemId)
          if (idx !== -1) { day.items[idx] = updated; break }
        }
        return updated
      } catch (e) { this.error = e.message; throw e }
    },
    async deleteItem(itemId) {
      try {
        await api.del(`/api/items/${itemId}`)
        for (const day of this.days) {
          const idx = day.items.findIndex((it) => it.id === itemId)
          if (idx !== -1) { day.items.splice(idx, 1); break }
        }
      } catch (e) { this.error = e.message; throw e }
    },
    async reorder(dayId, itemIds) {
      try {
        const res = await api.put(`/api/days/${dayId}/items/order`, { item_ids: itemIds })
        const day = this.days.find((d) => d.id === dayId)
        if (day) day.items = res.items
      } catch (e) { this.error = e.message; throw e }
    },
    async aiDraft(tripId) {
      this.aiBusy = true
      try {
        const res = await api.post(`/api/trips/${tripId}/itinerary/ai-draft`)
        this.draft = res.days
        return res
      } catch (e) { this.error = e.message; throw e }
      finally { this.aiBusy = false }
    },
    async applyDraft(tripId) {
      try {
        const res = await api.post(`/api/trips/${tripId}/itinerary/apply-draft`, { days: this.draft })
        this.days = res.days
        this.draft = null
      } catch (e) { this.error = e.message; throw e }
    },
    async aiRegenDay(dayId, instruction) {
      this.aiBusy = true
      try {
        const res = await api.post(`/api/days/${dayId}/ai-regen`, instruction ? { instruction } : {})
        this.dayDrafts[dayId] = res.items
        return res
      } catch (e) { this.error = e.message; throw e }
      finally { this.aiBusy = false }
    },
    async applyDay(dayId) {
      try {
        const res = await api.post(`/api/days/${dayId}/apply`, { items: this.dayDrafts[dayId] })
        const idx = this.days.findIndex((d) => d.id === dayId)
        if (idx !== -1) this.days[idx] = res.day
        delete this.dayDrafts[dayId]
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
