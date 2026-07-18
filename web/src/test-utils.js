import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

// Standard mount for component tests: Pinia + PrimeVue + its services.
// Pass extra plugins (e.g. a router) via options.global.plugins.
// Pass options.pinia to supply a pre-made pinia (setActivePinia(pinia) first,
// then stub store methods BEFORE mount — onMounted hooks fire during mount).
export function mountWithBase(component, options = {}) {
  const { global: g = {}, pinia, ...rest } = options
  return mount(component, {
    ...rest,
    global: {
      ...g,
      plugins: [pinia || createPinia(), PrimeVue, ToastService, ConfirmationService, ...(g.plugins || [])]
    }
  })
}
