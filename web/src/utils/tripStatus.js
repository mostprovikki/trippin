// The one forward step from each status (server: POST /trips/:id/status).
// Lives on Settings › Status; the trip header shows the chip only (tripper.md §5, owner D9).
export const NEXT_STATUS = {
  idea: { label: 'Start planning', target: 'planning' },
  planning: { label: 'Confirm trip', target: 'confirmed' },
  confirmed: { label: 'Activate', target: 'active' }
}
