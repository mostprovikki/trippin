import { useConfirm } from 'primevue/useconfirm'
import { api } from '../api/client.js'
import { useNotify } from './useNotify.js'

// The one "Replace ⟨Name⟩'s link?" dialog, shared by People and the Overview.
export function replaceLinkConfirm(personName, accept) {
  const name = personName || 'this person'
  return {
    message: `${personName || 'This person'}'s current link stops working immediately — anyone using it loses access. A new link will be created.`,
    header: `Replace ${name}'s link?`,
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Replace',
    acceptClass: 'p-button-danger',
    rejectLabel: 'Cancel',
    accept
  }
}

// Copy ⟨Name⟩'s link (tripper.md §1, §4: one click, on the row). Re-reads the
// active link so copying never revokes the one the participant already has.
// Only a link that can't be re-read (minted before tokens were stored
// encrypted, or JWT_SECRET rotated) needs a new one, and replacing an active
// link always asks first.
export function useCopyLink() {
  const confirm = useConfirm()
  const notify = useNotify()

  async function write(url, name) {
    try {
      await navigator.clipboard.writeText(location.origin + url)
      notify.success(`${name}'s link copied`)
    } catch {
      notify.error('Could not access clipboard — copy the link manually')
    }
  }

  async function mintAndWrite(tripId, personId, name) {
    try {
      const { url } = await api.post(`/api/trips/${tripId}/participants/${personId}/link`)
      await write(url, name)
    } catch (e) { notify.error(e.message) }
  }

  async function copy(tripId, personId, name, { hasActiveLink }) {
    let url
    try {
      url = (await api.get(`/api/trips/${tripId}/participants/${personId}/link`)).url
    } catch (e) {
      if (e.code !== 'NO_RECOVERABLE_LINK') { notify.error(e.message); return }
      if (!hasActiveLink) return mintAndWrite(tripId, personId, name)
      confirm.require(replaceLinkConfirm(name, () => mintAndWrite(tripId, personId, name)))
      return
    }
    await write(url, name)
  }

  return { copy }
}
