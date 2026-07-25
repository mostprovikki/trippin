import { defineStore } from 'pinia'
import { api } from '../api/client.js'

export const usePeopleStore = defineStore('people', {
  state: () => ({ people: [], current: null, documents: [], error: null }),
  actions: {
    async fetchPeople() {
      try {
        this.people = (await api.get('/api/people')).people
      } catch (e) { this.error = e.message; throw e }
    },
    // `current` is cleared BEFORE the request, not just on success: this store
    // outlives the route, so a failed load used to leave the previously viewed
    // person rendered under the new id — and PersonDetailView's save then PUT
    // that person's field values to the id in the URL, writing one person's
    // details over another's.
    async fetchPerson(id) {
      this.current = null
      this.documents = []
      this.error = null
      try {
        this.current = (await api.get(`/api/people/${id}`)).person
        await this.fetchDocuments(id)
      } catch (e) { this.error = e.message; throw e }
    },
    async fetchDocuments(id) {
      try {
        this.documents = (await api.get(`/api/people/${id}/documents`)).documents
      } catch (e) { this.error = e.message; throw e }
    },
    async createPerson(fields) {
      try {
        const person = (await api.post('/api/people', fields)).person
        this.people.push(person)
        return person
      } catch (e) { this.error = e.message; throw e }
    },
    async updatePerson(id, fields) {
      try {
        const person = (await api.put(`/api/people/${id}`, fields)).person
        this.current = person
        const idx = this.people.findIndex(p => p.id === id)
        if (idx !== -1) this.people[idx] = person
        return person
      } catch (e) { this.error = e.message; throw e }
    },
    async deletePerson(id) {
      try {
        await api.del(`/api/people/${id}`)
        this.people = this.people.filter(p => p.id !== id)
      } catch (e) { this.error = e.message; throw e }
    },
    async uploadDocument(personId, formData) {
      try {
        const document = (await api.upload(`/api/people/${personId}/documents`, formData)).document
        this.documents.push(document)
        return document
      } catch (e) { this.error = e.message; throw e }
    },
    async deleteDocument(docId) {
      try {
        await api.del(`/api/documents/${docId}`)
        this.documents = this.documents.filter(d => d.id !== docId)
      } catch (e) { this.error = e.message; throw e }
    }
  }
})
