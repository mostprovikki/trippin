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

// BYO-AI (trip-planner-d5d): open a ⋯ menu, pick "Draft with your own AI…",
// paste `reply` into PromptPasteDialog and import it. PrimeVue teleports both
// the popup menu and the dialog to <body>, hence document queries.
export async function pasteViaMenu(wrapper, menuButtonLabel, reply, flush) {
  await wrapper.find(`[aria-label="${menuButtonLabel}"]`).trigger('click')
  await flush()
  const item = [...document.body.querySelectorAll('.p-menu-item')].find((el) => el.textContent.includes('Draft with your own AI…'))
  if (!item) throw new Error('no "Draft with your own AI…" item in the menu')
  if (item.classList.contains('p-disabled') || item.getAttribute('aria-disabled') === 'true') throw new Error('"Draft with your own AI…" is disabled')
  item.querySelector('.p-menu-item-content').click()
  await flush()
  const ta = document.body.querySelector('[data-test="paste-reply"]')
  ta.value = reply
  ta.dispatchEvent(new Event('input'))
  await flush()
  document.body.querySelector('[data-test="paste-import"]').click()
  await flush()
}
