import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  handleCalendarArrowKey,
  installCalendarArrowNav,
  uninstallCalendarArrowNav,
  _installedCount
} from './pickerKeyNav.js'

// Builds a stand-in for the teleported DatePicker panel. `days` is a flat list
// of cells in DOM order — which for this grid is also chronological order, the
// property the implementation relies on.
//   { day, other?: true, disabledAttr?: true }
// `other` cells get the `p-disabled` CLASS (that is what PrimeVue does for
// filler days) while `disabledAttr` cells get data-p-disabled="true" (what a
// min/max-excluded day gets). The two are deliberately different so the tests
// can tell the "page to the next month" case apart from the "stop at the
// boundary" case.
function buildPanel(days, { perRow = 7 } = {}) {
  const panel = document.createElement('div')
  panel.className = 'p-datepicker-panel date-field-panel'

  const header = document.createElement('div')
  header.className = 'p-datepicker-header'
  const prev = document.createElement('button')
  prev.className = 'p-datepicker-prev-button'
  const next = document.createElement('button')
  next.className = 'p-datepicker-next-button'
  header.append(prev, next)

  const table = document.createElement('table')
  table.className = 'p-datepicker-calendar'
  const tbody = document.createElement('tbody')
  let tr = null
  days.forEach((d, i) => {
    if (i % perRow === 0) {
      tr = document.createElement('tr')
      tbody.append(tr)
    }
    const td = document.createElement('td')
    td.className = 'p-datepicker-day-cell'
    if (d.other) td.setAttribute('data-p-other-month', 'true')
    const span = document.createElement('span')
    span.className = 'p-datepicker-day' + (d.other ? ' p-disabled' : '')
    if (d.disabledAttr) span.setAttribute('data-p-disabled', 'true')
    span.textContent = String(d.day)
    span.tabIndex = -1
    td.append(span)
    tr.append(td)
  })
  table.append(tbody)
  panel.append(header, table)
  document.body.append(panel)
  return panel
}

function spanFor(panel, day, { other = false } = {}) {
  return Array.from(panel.querySelectorAll('.p-datepicker-day')).find(
    (s) =>
      s.textContent.trim() === String(day) &&
      (s.parentElement.getAttribute('data-p-other-month') === 'true') === other
  )
}

// A March-2026-shaped grid: Mar 1 is a Sunday, so the month fills exactly five
// rows of seven with Apr 1-4 trailing. Row 0 therefore ends on Mar 7, which is
// precisely the week edge that used to page a whole month.
function marchGrid() {
  const days = []
  for (let d = 1; d <= 31; d++) days.push({ day: d })
  for (let d = 1; d <= 4; d++) days.push({ day: d, other: true })
  return days
}

function press(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  Object.defineProperty(event, 'target', { value: target, configurable: true })
  return event
}

afterEach(() => {
  document.body.innerHTML = ''
  // Drain any refcount left behind so tests stay independent.
  while (_installedCount() > 0) uninstallCalendarArrowNav()
})

describe('installCalendarArrowNav', () => {
  it('reference-counts so N mounted DateFields share one listener', () => {
    expect(_installedCount()).toBe(0)
    installCalendarArrowNav()
    installCalendarArrowNav()
    installCalendarArrowNav()
    expect(_installedCount()).toBe(3)
    uninstallCalendarArrowNav()
    uninstallCalendarArrowNav()
    expect(_installedCount()).toBe(1)
    uninstallCalendarArrowNav()
    expect(_installedCount()).toBe(0)
  })

  it('does not underflow if unmounted more often than mounted', () => {
    uninstallCalendarArrowNav()
    uninstallCalendarArrowNav()
    expect(_installedCount()).toBe(0)
  })
})

describe('handleCalendarArrowKey', () => {
  let panel
  beforeEach(() => {
    panel = buildPanel(marchGrid())
  })

  it('steps forward one day inside a week row', async () => {
    const from = spanFor(panel, 10)
    from.focus()
    await handleCalendarArrowKey(press(from, 'ArrowRight'))
    expect(document.activeElement).toBe(spanFor(panel, 11))
  })

  it('steps backward one day inside a week row', async () => {
    const from = spanFor(panel, 10)
    from.focus()
    await handleCalendarArrowKey(press(from, 'ArrowLeft'))
    expect(document.activeElement).toBe(spanFor(panel, 9))
  })

  // The regression this module exists for. Mar 7 is the last cell of row 0;
  // PrimeVue paged to April here and focus landed on Mar 29.
  it('crosses a week boundary to the next day, not the next month', async () => {
    const saturday = spanFor(panel, 7)
    saturday.focus()
    const event = press(saturday, 'ArrowRight')
    await handleCalendarArrowKey(event)
    expect(document.activeElement).toBe(spanFor(panel, 8))
    expect(event.defaultPrevented).toBe(true)
  })

  it('crosses a week boundary backwards to the previous day', async () => {
    const sunday = spanFor(panel, 8)
    sunday.focus()
    await handleCalendarArrowKey(press(sunday, 'ArrowLeft'))
    expect(document.activeElement).toBe(spanFor(panel, 7))
  })

  it('moves the roving tabindex with the focus', async () => {
    const from = spanFor(panel, 10)
    from.tabIndex = 0
    from.focus()
    await handleCalendarArrowKey(press(from, 'ArrowRight'))
    expect(from.tabIndex).toBe(-1)
    expect(spanFor(panel, 11).tabIndex).toBe(0)
  })

  it('claims the event so PrimeVue’s row-scoped handler cannot also page', async () => {
    const from = spanFor(panel, 10)
    from.focus()
    const event = press(from, 'ArrowRight')
    let propagated = true
    event.stopPropagation = () => { propagated = false }
    await handleCalendarArrowKey(event)
    expect(event.defaultPrevented).toBe(true)
    expect(propagated).toBe(false)
  })

  it('stops at a min/max-disabled neighbour instead of leaping over it', async () => {
    const days = marchGrid()
    days[10].disabledAttr = true // Mar 11 excluded by a maxDate
    document.body.innerHTML = ''
    panel = buildPanel(days)
    const from = spanFor(panel, 10)
    from.focus()
    await handleCalendarArrowKey(press(from, 'ArrowRight'))
    expect(document.activeElement).toBe(from)
  })

  it('ignores keys other than the horizontal arrows', async () => {
    const from = spanFor(panel, 10)
    from.focus()
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Home', 'PageDown']) {
      expect(await handleCalendarArrowKey(press(from, key))).toBe(false)
    }
    expect(document.activeElement).toBe(from)
  })

  it('defers to the browser when a modifier is held', async () => {
    const from = spanFor(panel, 10)
    from.focus()
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(await handleCalendarArrowKey(press(from, 'ArrowRight', { [mod]: true }))).toBe(false)
    }
    expect(document.activeElement).toBe(from)
  })

  it('ignores targets that are not day cells', async () => {
    const button = panel.querySelector('.p-datepicker-next-button')
    expect(await handleCalendarArrowKey(press(button, 'ArrowRight'))).toBe(false)
  })

  it('ignores day cells belonging to a picker we do not own', async () => {
    const foreign = buildPanel(marchGrid())
    foreign.className = 'p-datepicker-panel' // no date-field-panel tag
    const from = foreign.querySelectorAll('.p-datepicker-day')[10]
    expect(await handleCalendarArrowKey(press(from, 'ArrowRight'))).toBe(false)
  })

  // Paging into an adjacent month drives PrimeVue's nav button and then waits on
  // its re-render, which a static DOM fixture cannot reproduce. What is asserted
  // here is the decision: a filler day must NOT be treated as a hard boundary
  // (its `p-disabled` class would otherwise stop navigation dead). The full
  // page-and-land behaviour is covered by e2e/qa-picker-keynav.mjs, which walks
  // 75 days across two real month boundaries in Chrome.
  it('treats an other-month filler day as a paging trigger, not a wall', async () => {
    const mar31 = spanFor(panel, 31)
    mar31.focus()
    const event = press(mar31, 'ArrowRight')
    await handleCalendarArrowKey(event)
    // It clicked next; with no live component behind the fixture focus stays put,
    // but the event was claimed rather than handed back to PrimeVue.
    expect(event.defaultPrevented).toBe(true)
    expect(spanFor(panel, 1, { other: true }).classList.contains('p-disabled')).toBe(true)
  })
})
