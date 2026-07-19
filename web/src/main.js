import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { TripperPreset } from './theme.js'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import App from './App.vue'
import { router } from './router.js'
import './assets/main.css'
import 'primeicons/primeicons.css'

createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue, { theme: { preset: TripperPreset, options: { darkModeSelector: 'none' } } })
  .use(ToastService)
  .use(ConfirmationService)
  .mount('#app')
