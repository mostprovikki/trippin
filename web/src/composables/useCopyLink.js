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

  // Settles once: accept → true; Cancel → false. × and Escape call only onHide
  // (PrimeVue ConfirmDialog binds it to the Dialog's own close), so onHide
  // must settle too or the caller waits forever.
  const ask = (name) => new Promise((settle) => confirm.require({
    ...replaceLinkConfirm(name, () => settle(true)),
    reject: () => settle(false),
    onHide: () => settle(false)
  }))
  const mint = async (tripId, personId) =>
    location.origin + (await api.post(`/api/trips/${tripId}/participants/${personId}/link`)).url

  // The person's absolute link, or null when the organizer cancelled or it
  // failed (already reported). `replace` skips the re-read: a new link, after
  // asking when there is an active one to revoke.
  async function resolve(tripId, personId, name, { hasActiveLink = false, replace = false } = {}) {
    try {
      if (!replace) {
        try { return location.origin + (await api.get(`/api/trips/${tripId}/participants/${personId}/link`)).url }
        catch (e) { if (e.code !== 'NO_RECOVERABLE_LINK') throw e }
      }
      if (hasActiveLink && !(await ask(name))) return null
      return await mint(tripId, personId)
    } catch (e) { notify.error(e.message); return null }
  }

  // `compose(url)` turns the link into the text to copy (the message that goes
  // with it). Returns the link, or null when nothing was copied.
  async function copy(tripId, personId, name, opts = {}) {
    const url = await resolve(tripId, personId, name, opts)
    if (!url) return null
    const what = opts.compose ? 'message' : 'link'
    try {
      await navigator.clipboard.writeText(opts.compose ? opts.compose(url) : url)
      notify.success(`${name}'s ${what} copied`)
    } catch {
      notify.error(`Could not access clipboard — copy the ${what} manually`)
    }
    return url
  }

  return { copy, resolve }
}
