import { defineStore } from 'pinia'
import { participantApi } from '../api/client.js'

// tripper.md §9 D2: the server's REQUIRED_FIELDS (server/src/lib/missing.js),
// in the labels the /p form uses.
export const REQUIRED_FIELD_LABEL = { phone: 'Phone', emergency_contact: 'Emergency contact', dietary: 'Dietary' }

export const useParticipantStore = defineStore('participant', {
  state: () => ({
    token: null,
    trip: null,
    person: null,
    profileConfirmed: false,
    missingFields: [],
    documents: [],
    packing: [],
    tasks: [],
    itinerary: [],
    budget: null,
    companions: [],
    companionCount: 0,
    error: null
  }),
  getters: {
    stillNeeded: (s) => s.missingFields.map((f) => REQUIRED_FIELD_LABEL[f] || f)
  },
  actions: {
    async load(token) {
      this.token = token
      // Cleared on entry, not just set on failure: this action is re-runnable
      // from the participant page's Try again button, and a successful retry
      // would otherwise leave the previous failure's banner on screen.
      this.error = null
      const capi = participantApi(token)
      try {
        const me = await capi.get('/api/participant/me')
        this.trip = me.trip
        this.person = me.person
        this.profileConfirmed = !!me.profile_confirmed
        this.missingFields = me.missing_fields || []
        this.itinerary = me.itinerary || []
        this.budget = me.budget || null
        this.companions = me.companions || []
        this.companionCount = me.companion_count || 0
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
        // confirmed means complete — the server decides (trip-planner-4hi)
        this.profileConfirmed = !!res.profile_confirmed
        this.missingFields = res.missing_fields || []
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
    // Step 1 of the download flow (see utils/downloadDoc.js): {url, direct}. Routed
    // through participantApi so a dead/expired link's 401 gets the same ApiError
    // shape as every other participant call — not a store-level `this.error`, since
    // a download failure belongs on the row/toast the component shows, not the
    // page-level banner.
    getDocumentUrl(id) {
      return participantApi(this.token).get(`/api/participant/documents/${id}/file-url`)
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
