import { computed } from 'vue'
import { useTripsStore } from '../stores/trips.js'

// An archived trip is read-only (tripper.md §2 Archived, D11): the server
// refuses its writes, so every view hides its edit/add/delete controls off this.
export function useTripReadOnly() {
  const trips = useTripsStore()
  return computed(() => trips.current?.status === 'archived')
}
