<script setup>
import { computed, ref, watch } from 'vue'
import DatePicker from 'primevue/datepicker'
import InputMask from 'primevue/inputmask'
import { parseIsoDate, toIsoDate } from '../utils/dates.js'

// One date affordance for the whole app: the API speaks ISO calendar dates
// ('YYYY-MM-DD'), DatePicker speaks Date. parseIsoDate/toIsoDate keep that
// conversion in local time so a date never slides a day.
const props = defineProps({
  modelValue: { type: String, default: '' },
  inputId: { type: String, default: undefined },
  placeholder: { type: String, default: undefined },
  minDate: { type: Date, default: undefined },
  maxDate: { type: Date, default: undefined },
  size: { type: String, default: undefined },
  fluid: { type: Boolean, default: true },
  // Expiry dates are *read off a document*, not browsed for: the user already
  // knows 2035-04-30, and the calendar costs 6 clicks to reach it. `typeable`
  // swaps the picker for a masked field so the keyboard is the fast path.
  typeable: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => parseIsoDate(props.modelValue),
  set: (v) => emit('update:modelValue', toIsoDate(v))
})

const placeholderText = computed(
  () => props.placeholder ?? (props.typeable ? 'YYYY-MM-DD' : 'Pick a date')
)

// --- typeable mode ---------------------------------------------------------
// The masked field holds its own text so a half-typed date never round-trips
// through the parent. Nothing is emitted until the text is a *complete, real*
// date, which is what makes this safe where DatePicker's own manualInput
// isn't: we never rewrite the field mid-keystroke, so the caret never moves.
const text = ref(props.modelValue || '')
const focused = ref(false)
const invalid = ref(false)
const errorId = computed(() => (props.inputId ? `${props.inputId}-error` : undefined))

watch(() => props.modelValue, (v) => {
  // Never clobber what someone is actively typing.
  if (focused.value) return
  text.value = v || ''
  invalid.value = false
})

function onMaskInput(next) {
  text.value = next || ''
  if (!text.value) {
    invalid.value = false
    if (props.modelValue) emit('update:modelValue', '')
    return
  }
  // Mid-entry the unfilled slots render as the slotChar template, so a
  // complete-looking date is the only thing that can parse. A mask constrains
  // the *shape* but not the calendar: 2026-02-31 satisfies 9999-99-99, and
  // parseIsoDate rejects it rather than rolling it over to Mar 3.
  const complete = /^\d{4}-\d{2}-\d{2}$/.test(text.value)
  const parsed = complete ? parseIsoDate(text.value) : null
  invalid.value = complete && !parsed
  if (parsed) emit('update:modelValue', text.value)
}
</script>

<template>
  <!-- Expiry dates: a masked field, so the date can simply be typed. Safe
       where DatePicker's manualInput is not, because the mask only constrains
       which characters land where — it never reformats or re-parses the text
       under the caret, so nothing shifts mid-keystroke. -->
  <template v-if="typeable">
    <InputMask
      :id="inputId"
      :model-value="text"
      mask="9999-99-99"
      slot-char="yyyy-mm-dd"
      :placeholder="placeholderText"
      :size="size"
      :fluid="fluid"
      :invalid="invalid"
      :aria-describedby="invalid ? errorId : undefined"
      inputmode="numeric"
      @update:model-value="onMaskInput"
      @focus="focused = true"
      @blur="focused = false"
    />
    <!-- The slot always occupies its line, so showing the error can't shove the
         Upload button down under the pointer mid-typing. -->
    <div class="date-field-hint">
      <!-- Kept short on purpose: the narrowest field this renders in is 259px
           (participant page at 375px), and a second line would push the Upload
           button out from under the thumb. -->
      <small v-if="invalid" :id="errorId" class="date-field-error" role="alert">
        Not a real date — check month/day.
      </small>
    </div>
  </template>

  <!-- manual-input is off deliberately. DatePicker reformats the field the
       instant the typed text parses, without restoring the caret: typing
       2026-11-27 normalises at "2026-11-2" (a valid date), so the final "7"
       lands as "2026-11-072" and the field silently keeps Nov *2*. No date
       format escapes this — every format has a valid strict prefix (day "2",
       year "2") — so the keyboard path is closed rather than silently wrong.
       Reachability for far-future dates (a 2035 passport expiry) rests on the
       panel's month/year header buttons. -->
  <DatePicker
    v-else
    v-model="value"
    date-format="yy-mm-dd"
    :input-id="inputId"
    :placeholder="placeholderText"
    :min-date="minDate"
    :max-date="maxDate"
    :size="size"
    :fluid="fluid"
    :manual-input="false"
    :pt="{ panel: { class: 'date-field-panel' } }"
    show-icon
    icon-display="input"
    show-button-bar
  />
</template>

<!-- Unscoped on purpose: the panel is teleported to <body>, out of reach of
     scoped CSS. alignOverlay() imperatively sets the panel's min-width to the
     *input's* width, so a fluid field stretches the month grid to ~940px — a
     calendar with 150px between day columns. !important is required to beat
     that inline style; the inline `width` it also sets is the panel's own
     natural width, which is what we want, so only min-width is overridden. -->
<style scoped>
.date-field-hint {
  min-height: 1.25rem;
  margin-top: 0.25rem;
}
.date-field-error {
  display: block;
  color: var(--p-red-600, #dc2626);
  font-size: 0.8125rem;
  line-height: 1.25rem;
}
/* main.css paints `.field input:focus` with the brand colour, which would beat
   PrimeVue's invalid border exactly while someone is fixing the date — the one
   moment the error must stay visible. Keep red while focused and invalid. */
input.p-invalid:focus {
  border-color: var(--p-red-400, #f87171);
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.2);
}
</style>

<style>
.p-datepicker-panel.date-field-panel {
  min-width: 0 !important;
}
/* The month and year in the panel header are buttons, and now that typing is
   closed they carry the whole cost of a far-future date: 6 clicks to reach
   2035-04-30 through them, versus 105 presses of the next-month arrow for
   anyone who doesn't notice them. They shipped as 13px plain slate text —
   quieter than the day numbers beside them, i.e. the hierarchy inverted. Give
   them real affordance and size-match the grid. */
.p-datepicker-panel.date-field-panel .p-datepicker-select-month,
.p-datepicker-panel.date-field-panel .p-datepicker-select-year {
  font-size: 1rem;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: var(--p-primary-color);
}
.p-datepicker-panel.date-field-panel .p-datepicker-select-month:hover,
.p-datepicker-panel.date-field-panel .p-datepicker-select-year:hover {
  background: var(--p-primary-50);
}
</style>
