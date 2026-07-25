// Day-by-day arrow navigation for the DateField calendar.
//
// PrimeVue resolves ArrowLeft/ArrowRight against the current WEEK ROW only —
// primevue/datepicker's onDateCellKeydown reads `cell.parentElement.children`,
// and at a row edge previous/nextElementSibling is null, so it falls through to
// navigateToMonth() and pages a whole month. Measured in Chrome before this fix:
//
//   ArrowRight from 2026-03-07 (a Saturday) focused 2026-03-29  — +22 days
//   ArrowLeft  from 2026-07-26 (a Sunday)   focused 2026-08-01  —  +6 days
//
// Roving focus across a date grid has to be continuous, one day per press.
//
// The fix leans on a property the markup already has: the grid's DOM order is
// chronological, because it renders the grey leading/trailing filler days too.
// So "the next day" is simply the next <td>. When that day belongs to an
// adjacent month we page the panel and land on the same date as a real in-month
// cell — which also means focus never comes to rest on a grey filler day, where
// Enter would do nothing (other-month days are unselectable unless
// selectOtherMonths is set).
//
// Installed as a single capture-phase listener on document: the panel is
// teleported to <body>, so it is out of reach of a component's own template
// handlers, and capture is what lets us pre-empt PrimeVue's handler on the day
// span (stopPropagation during capture means the target's listener never runs).
import { nextTick } from 'vue'

// Only our own panels are touched — DateField tags them via a PT class.
const PANEL_SELECTOR = '.p-datepicker-panel.date-field-panel'

function dayCells(panel) {
  return Array.from(panel.querySelectorAll('.p-datepicker-calendar tbody td'))
}
function spanOf(td) {
  return td ? td.querySelector('.p-datepicker-day') : null
}
// Two different markers mean "not selectable", and they are not interchangeable:
// a min/max-excluded day gets data-p-disabled="true", while the grey filler days
// of the adjacent month get only the `p-disabled` CLASS. Callers must therefore
// test for other-month BEFORE asking whether a cell is disabled, or every month
// edge looks like a hard boundary and nothing ever pages.
function isDisabled(span) {
  return !span || span.getAttribute('data-p-disabled') === 'true' ||
    span.classList.contains('p-disabled')
}
function isOtherMonth(td) {
  // PrimeVue puts this on the <td>, not the day <span> — and only on the filler
  // days: in-month cells build their meta without an `otherMonth` key at all, so
  // the attribute is absent rather than "false". Compare against 'true' so both
  // shapes read correctly.
  return td.getAttribute('data-p-other-month') === 'true'
}
function moveFocus(from, to) {
  if (from) from.tabIndex = -1
  to.tabIndex = 0
  to.focus()
}

// Page the panel one month and put focus on `dayNumber` as an in-month cell.
// The re-render is Vue's, so poll a few frames rather than assuming one tick.
async function pageAndFocus(panel, forward, dayNumber) {
  // The class is what this build actually renders; the data-pc-section attribute
  // is NOT present on these buttons, and querying for it alone made this whole
  // function no-op silently (arrow at a month edge just didn't move).
  const btn = panel.querySelector(
    forward
      ? '.p-datepicker-next-button, [data-pc-section="nextbutton"]'
      : '.p-datepicker-prev-button, [data-pc-section="prevbutton"]'
  )
  if (!btn) return false
  btn.click()

  const frame = () => new Promise((r) => requestAnimationFrame(r))
  const targetSpan = () => {
    const td = dayCells(panel).find(
      (c) => !isOtherMonth(c) && Number((spanOf(c)?.textContent || '').trim()) === dayNumber
    )
    const span = spanOf(td)
    return span && !isDisabled(span) ? span : null
  }

  // onNextButtonClick sets navigationState.button, so PrimeVue's updateFocus()
  // — which runs from its own updated() hook, i.e. AFTER we get control back —
  // pulls focus onto the nav button. Focusing and then checking activeElement
  // immediately always "succeeds", because focus() is synchronous; the theft
  // happens a tick later. So the check has to come a frame after the set, and
  // we re-assert until it sticks.
  for (let i = 0; i < 15; i++) {
    const span = targetSpan()
    if (span) moveFocus(null, span)
    await nextTick()
    await frame()
    const settled = targetSpan()
    if (settled && document.activeElement === settled) return true
  }
  return false
}

export async function handleCalendarArrowKey(event) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return false
  // Let the browser's own text-caret movement win when a modifier is held.
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  const span = event.target
  if (!span || !span.classList || !span.classList.contains('p-datepicker-day')) return false
  const panel = span.closest(PANEL_SELECTOR)
  if (!panel) return false

  const td = span.parentElement
  const cells = dayCells(panel)
  const index = cells.indexOf(td)
  if (index < 0) return false

  const forward = event.key === 'ArrowRight'
  const neighbour = cells[index + (forward ? 1 : -1)]

  // Claim the event before PrimeVue's row-scoped handler can page a month.
  event.preventDefault()
  event.stopPropagation()

  // No neighbour means the grid rendered without filler days (showOtherMonths
  // off). Nothing sensible to move to without paging blind, so stay put.
  if (!neighbour) return true

  const neighbourSpan = spanOf(neighbour)
  if (!neighbourSpan) return true

  if (isOtherMonth(neighbour)) {
    // A grey filler day. Page to the month it really belongs to and land on it
    // as a proper in-month cell, so focus never rests somewhere Enter is a no-op.
    // Checked before isDisabled() on purpose — filler days always carry
    // `p-disabled`, so the other order would treat every month edge as a wall.
    await pageAndFocus(panel, forward, Number(neighbourSpan.textContent.trim()))
  } else if (isDisabled(neighbourSpan)) {
    // A real min/max boundary: stop the caret rather than leaping the range.
    return true
  } else {
    moveFocus(span, neighbourSpan)
  }
  return true
}

// One document listener no matter how many DateFields are mounted: the handler
// is driven entirely by the DOM, so per-instance copies would just each do the
// same work for whichever panel happens to be open.
let mounted = 0

export function installCalendarArrowNav() {
  if (mounted++ === 0) document.addEventListener('keydown', handleCalendarArrowKey, true)
}

export function uninstallCalendarArrowNav() {
  if (mounted > 0 && --mounted === 0) {
    document.removeEventListener('keydown', handleCalendarArrowKey, true)
  }
}

// Test seam: assert the listener is actually reference-counted rather than
// leaking one per mount.
export function _installedCount() {
  return mounted
}
