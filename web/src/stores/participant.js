import { defineStore } from 'pinia'
import { participantApi } from '../api/client.js'

export const useParticipantStore = defineStore('participant', {
  state: () => ({
    token: null,
    trip: null,
    person: null,
    profileConfirmed: false,
    documents: [],
    packing: [],
    tasks: [],
    error: null
  }),
  actions: {
    async load(token) {
      this.token = token
      const capi = participantApi(token)
      try {
        const me = await capi.get('/api/participant/me')
        this.trip = me.trip
        this.person = me.person
        this.profileConfirmed = !!me.profile_confirmed
        const docs = await capi.get('/api/participant/documents')
        this.documents = docs.documents
        const checklist = await capi.get('/api/participant/checklist')
        this.packing = checklist.packing
        this.tasks = checklist.tasks
      } catch (e) {
        this.error = e.message
        throw e
      }
    },
    async saveProfile(fields) {
      const capi = participantApi(this.token)
      try {
        const res = await capi.put('/api/participant/profile', fields)
        this.person = res.person
        this.profileConfirmed = true
      } catch (e) {
        this.error = e.message
        throw e
      }
    },
    async uploadDocument(formData) {
      const capi = participantApi(this.token)
      try {
        const res = await capi.upload('/api/participant/documents', formData)
        this.documents.push(res.document)
      } catch (e) {
        this.error = e.message
        throw e
      }
    },
    async deleteDocument(id) {
      const capi = participantApi(this.token)
      try {
        await capi.del(`/api/participant/documents/${id}`)
        this.documents = this.documents.filter((d) => d.id !== id)
      } catch (e) {
        this.error = e.message
        throw e
      }
    },
    async tickItem(itemId, done) {
      const capi = participantApi(this.token)
      try {
        const item = await capi.put(`/api/participant/checklist-items/${itemId}`, { done })
        const idxPacking = this.packing.findIndex((i) => i.id === itemId)
        if (idxPacking !== -1) this.packing[idxPacking] = item
        const idxTasks = this.tasks.findIndex((i) => i.id === itemId)
        if (idxTasks !== -1) this.tasks[idxTasks] = item
      } catch (e) {
        this.error = e.message
        throw e
      }
    }
  }
})
