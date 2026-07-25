import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

// Warm-travel identity: deep teal primary on warm neutral surfaces.
export const TripperPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
      500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e'
    },
    colorScheme: {
      light: {
        // Aura's surface ramp is `slate`, a *cool* neutral, and almost every
        // neutral token downstream is derived from it — text.mutedColor is
        // {surface.500}, content borders are {surface.200}, overlay chrome is
        // {surface.*} throughout. Leaving it at the default is what made
        // teleported panels (DatePicker's Today/Clear bar at slate-500
        // rgb(100,116,139), its today-marker chip at slate-200 rgb(226,232,240))
        // read as a foreign cool-grey widget sitting on warm surfaces.
        //
        // `stone` is the warm neutral the app already speaks: main.css's
        // --app-text is stone-900 (#1c1917) and --app-text-muted is stone-500
        // (#78716c). Re-pointing the ramp aligns PrimeVue's neutrals with the
        // token layer instead of patching components one at a time.
        surface: {
          0: '#ffffff',
          50: '{stone.50}', 100: '{stone.100}', 200: '{stone.200}', 300: '{stone.300}',
          400: '{stone.400}', 500: '{stone.500}', 600: '{stone.600}', 700: '{stone.700}',
          800: '{stone.800}', 900: '{stone.900}', 950: '{stone.950}'
        },
        primary: {
          color: '{primary.700}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}'
        },
        highlight: {
          background: '{primary.50}',
          focusBackground: '{primary.100}',
          color: '{primary.800}',
          focusColor: '{primary.900}'
        }
      }
    }
  }
})
