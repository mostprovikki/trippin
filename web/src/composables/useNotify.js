import { useToast } from 'primevue/usetoast'

export function useNotify() {
  const toast = useToast()
  return {
    success: (detail, summary = 'Done') => toast.add({ severity: 'success', summary, detail, life: 3000 }),
    error: (detail, summary = 'Error') => toast.add({ severity: 'error', summary, detail, life: 6000 })
  }
}
