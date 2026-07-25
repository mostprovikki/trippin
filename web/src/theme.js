import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

// Warm-travel identity: deep teal primary on warm neutral surfaces.
export const TripperPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf',
      500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e'
    },
    // Aura ships form fields — and every Button, which derives its radius from
    // this same token — at 6px. That is not a step on this app's scale: cards
    // are 12px, nav rows and the plain .field inputs 8px, kbd caps 4px. A button
    // with a tighter corner than the field containing it is the kind of mismatch
    // you feel without being able to name. Set here rather than per-component so
    // buttons, inputs and selects all move together.
    formField: {
      borderRadius: 'var(--app-radius-sm)'
    },
    // The other half of the same problem: everything Aura calls "content"
    // (progress bars, panels, the surfaces its components draw) also defaults to
    // 6px. Pointing both semantic radii at the 8px step is what actually removes
    // the off-scale value, rather than overriding each component that happens to
    // read one of them.
    content: {
      borderRadius: 'var(--app-radius-sm)'
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
      },

      dark: {
        // Aura's dark ramp is `zinc` — a neutral grey, cooler than the warm
        // identity and inconsistent with the stone used in light. Same reasoning
        // as above: point it at stone so both schemes are the same family.
        // surface.0 stays #ffffff because Aura's dark scheme uses it as the TEXT
        // colour ({text.color}: {surface.0}), not as a background.
        surface: {
          0: '#ffffff',
          50: '{stone.50}', 100: '{stone.100}', 200: '{stone.200}', 300: '{stone.300}',
          400: '{stone.400}', 500: '{stone.500}', 600: '{stone.600}', 700: '{stone.700}',
          800: '{stone.800}', 900: '{stone.900}', 950: '{stone.950}'
        },
        // Teal-700 is the light-mode primary and far too dark to sit on a dark
        // surface; step up the ramp so the brand stays legible. contrastColor
        // inverts to match — text ON the primary is now dark, not white.
        primary: {
          color: '{primary.400}',
          contrastColor: '{surface.950}',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}'
        },
        // A 50/100 tint would be a near-white block in dark mode, so the
        // highlight is a transparency of the primary over whatever is behind it.
        highlight: {
          background: 'color-mix(in srgb, {primary.400}, transparent 84%)',
          focusBackground: 'color-mix(in srgb, {primary.400}, transparent 76%)',
          color: '{primary.100}',
          focusColor: '{primary.50}'
        }
      }
    }
  },
  components: {
    tag: {
      // Aura's 6px is off this app's scale. Tags are small inline chips — the
      // same size class as the kbd caps in the search trigger, which use the
      // 4px step — so they take that rather than the 8px control radius. Status
      // tags override this to a full pill in main.css, matching the overview
      // stepper that shows the same values.
      //
      // Nested under `root` because that is the shape of a component preset
      // ({ root, icon, colorScheme }) — a bare borderRadius here merges as a new
      // top-level key that no token reads, and silently does nothing.
      root: { borderRadius: 'var(--app-radius-xs)' }
    },
    button: {
      colorScheme: {
        light: {
          // Aura paints text/outlined danger buttons in {red.500} (#ef4444),
          // which is 3.76:1 on white and 3.58:1 on --app-bg — both under AA for
          // the 14–16px labels these buttons carry ("Remove", "Delete person",
          // "Archive trip"). red.600 takes them to 4.83:1 / 4.59:1.
          //
          // Light only, deliberately: in dark the same #ef4444 sits on a near
          // black surface where it already passes comfortably, and darkening it
          // there would push it the wrong way.
          outlined: { danger: { color: '{red.600}' } },
          text: { danger: { color: '{red.600}' } }
        }
      }
    }
  }
})
