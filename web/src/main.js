import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { TripperPreset } from './theme.js'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import App from './App.vue'
import { router } from './router.js'
import { initThemeMode, DARK_CLASS } from './composables/useThemeMode.js'
import './assets/main.css'
import 'primeicons/primeicons.css'

// Re-assert the scheme now that the app owns it. index.html already set the
// class from an inline script to avoid a light flash before this module runs;
// this call adds the media-query listener and keeps colorScheme in sync.
initThemeMode()

createApp(App)
  .use(createPinia())
  .use(router)
  // darkModeSelector was 'none', which switched dark mode OFF entirely — the
  // dark half of every generated token was simply never emitted, so the vision
  // doc's "dark mode throughout" had no chance of working. Pointing it at the
  // same class useThemeMode toggles means PrimeVue's tokens and the app's own
  // --app-* tokens flip together.
  .use(PrimeVue, { theme: { preset: TripperPreset, options: { darkModeSelector: `.${DARK_CLASS}` } } })
  .use(ToastService)
  .use(ConfirmationService)
  .mount('#app')
