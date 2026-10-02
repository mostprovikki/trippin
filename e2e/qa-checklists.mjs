// Checklists gate (trip-planner-jjp; tripper.md §4 phone reach, §5 one primary at rest, D8).
// Read-only: measures the flagship trip's Checklists tab, writes nothing.
//   - at rest: no create form; the only filled buttons are the cards' "Add item";
//     every card has its ⋯; Save as template / Delete checklist are not visible
//   - 390: the first item row starts on the first screen; every row is ≥44px and its
//     label (which wraps the checkbox) is ≥44px; packing rows are one line; task rows
//     put assignee + due on one second line, and each assignee Select shows its full
//     first name (trip-planner-typ)
// Run: node e2e/qa-checklists.mjs
import { existsSync, readdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

function findExecutable() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright')
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort()
    for (const d of dirs.reverse()) {
      const exe = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
      if (existsSync(exe)) return exe
    }
  }
  return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
}

const BASE = process.env.BASE_URL || 'http://[::1]:43100'
let failures = 0
const ok = (n, x = '') => console.log(`ok  - ${n}${x ? ` (${x})` : ''}`)
const fail = (n, d) => { failures++; console.error(`FAIL - ${n}: ${d}`) }
const check = (n, cond, d) => (cond ? ok(n, d) : fail(n, d))

const browser = await chromium.launch({ executablePath: findExecutable(), args: ['--no-proxy-server', '--proxy-bypass-list=*'] })

let tripId = process.env.QA_CONFIRMED_TRIP_ID || ''

for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByLabel(/email/i).fill('demo@tripper.dev')
  await page.locator('#password').fill('tripper1234')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })

  if (!tripId) {
    const trips = await page.evaluate(() => fetch('/api/trips').then((r) => r.json()).then((j) => j.trips))
    const confirmed = trips.filter((t) => t.status === 'confirmed')
    if (confirmed.length !== 1) { fail('resolve flagship trip', `${confirmed.length} confirmed trip(s); set QA_CONFIRMED_TRIP_ID`); break }
    tripId = confirmed[0].id
  }

  await page.goto(`${BASE}/trips/${tripId}/checklists`, { waitUntil: 'networkidle' })
  await page.locator('.checklist-items li').first().waitFor({ timeout: 10000 })

  const m = await page.evaluate(() => {
    const main = document.querySelector('.trip-main') || document.body
    const cards = [...main.querySelectorAll('.checklist-head')].map((h) => h.closest('.card'))
    const filled = [...main.querySelectorAll('button.p-button')]
      .filter((b) => b.offsetParent && !/p-button-(outlined|text|secondary)/.test(b.className))
      .map((b) => b.textContent.trim())
    const visibleText = main.innerText
    const r = (el) => el.getBoundingClientRect()
    const rows = cards.flatMap((card) => {
      const kind = card.querySelector('.checklist-head .p-tag')?.textContent.trim()
      return [...card.querySelectorAll('.checklist-items li')].map((li) => {
        const label = li.querySelector('label.item-tick')
        const meta = li.querySelector('.item-meta')
        const del = li.querySelector('.icon-danger-btn')
        const lr = label && r(label)
        const metaKids = meta ? [...meta.children].map((c) => Math.round(r(c).top)) : []
        return {
          kind, title: li.querySelector('.item-title')?.textContent.trim(),
          h: r(li).height, top: r(li).top,
          labelH: lr?.height ?? 0, labelHasInput: !!label?.querySelector('input[type=checkbox]'),
          delOnLabelLine: del && lr ? r(del).top < lr.bottom && r(del).bottom > lr.top : false,
          metaBelow: meta && lr ? r(meta).top >= lr.bottom - 1 : null,
          metaOneLine: metaKids.length ? Math.max(...metaKids) - Math.min(...metaKids) <= 2 : null,
          metaH: meta ? r(meta).height : 0,
          // first name + ellipsis must fit the Select's label box (canvas, same font)
          assignee: (() => {
            const l = meta?.querySelector('.p-select-label')
            if (!l) return null
            const name = l.textContent.trim()
            const c = document.createElement('canvas').getContext('2d')
            c.font = getComputedStyle(l).font
            const cs = getComputedStyle(l)
            const box = l.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
            const first = name.split(/\s+/)[0]
            const need = c.measureText(first === name ? name : `${first} …`).width
            return { name, fits: !!name && need <= box, need: Math.round(need), box: Math.round(box) }
          })()
        }
      })
    })
    // second pass, after the layout reads: scroll each label on screen (elementFromPoint
    // answers null off-viewport) and ask what a tap at its far right edge lands on —
    // inside the label = the whole row toggles
    const labels = cards.flatMap((card) => [...card.querySelectorAll('.checklist-items li')].map((li) => li.querySelector('label.item-tick')))
    labels.forEach((label, i) => {
      if (!label) return
      label.scrollIntoView({ block: 'center' })
      const lr = r(label)
      const hit = document.elementFromPoint(lr.right - 3, lr.top + lr.height / 2)
      rows[i].hitInLabel = !!(hit && label.contains(hit))
    })
    window.scrollTo(0, 0)
    const firstRowTop = rows.length ? rows[0].top : Infinity
    const fieldsAbove = [...main.querySelectorAll('input, .p-select, textarea')]
      .filter((el) => el.offsetParent && r(el).top < firstRowTop && !el.closest('.checklist-items')).length
    return {
      fieldsAbove,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      cards: cards.length,
      menus: cards.filter((c) => c.querySelector('.checklist-head [aria-haspopup="true"]')).length,
      createForm: !!document.querySelector('#checklist-name'),
      newBtn: !!document.querySelector('[data-test="new-checklist"]'),
      filled,
      mgmtVisible: /Save as template|Delete checklist|Add from template/.test(visibleText),
      rows
    }
  })

  const w = `${width}px`
  if (width === 390) {
    // headless Chrome can clamp the viewport (memory: 500px); a wider page would fake every result
    if (m.clientWidth > 400) { fail(`${w}: viewport is 390`, `clientWidth ${m.clientWidth}`); await ctx.close(); continue }
    check(`${w}: no horizontal overflow`, m.scrollWidth <= m.clientWidth, `scroll ${m.scrollWidth} / client ${m.clientWidth}`)
  }
  check(`${w}: found packing + tasks cards`, m.cards >= 2 && m.rows.some((x) => x.kind === 'packing') && m.rows.some((x) => x.kind === 'tasks'), `${m.cards} cards, ${m.rows.length} rows`)
  check(`${w}: create form closed at rest, New checklist button present`, !m.createForm && m.newBtn, JSON.stringify({ createForm: m.createForm, newBtn: m.newBtn }))
  check(`${w}: only filled buttons are the cards' Add item`, m.filled.length === m.cards && m.filled.every((t) => t === 'Add item'), JSON.stringify(m.filled))
  check(`${w}: every card has its ⋯`, m.menus === m.cards, `${m.menus}/${m.cards}`)
  check(`${w}: no management actions visible at rest`, !m.mgmtVisible)
  check(`${w}: every row label wraps its checkbox`, m.rows.every((x) => x.labelHasInput))
  const missTap = m.rows.filter((x) => !x.hitInLabel)
  check(`${w}: a tap at the label's far edge lands in the label`, !missTap.length, missTap.map((x) => x.title).slice(0, 3).join(', '))

  if (width === 390) {
    const first = m.rows[0]
    check(`${w}: no form field above the first list (lists first)`, m.fieldsAbove === 0, `${m.fieldsAbove} field(s) above`)
    check(`${w}: first item row starts on the first screen`, first.top + 44 <= m.innerHeight, `top ${Math.round(first.top)} / viewport ${m.innerHeight}`)
    const short = m.rows.filter((x) => x.h < 44 || x.labelH < 44)
    check(`${w}: every row and its tap label ≥ 44px`, !short.length, short.map((x) => `${x.title}=${Math.round(x.h)}/${Math.round(x.labelH)}`).slice(0, 4).join(', ') || `min ${Math.round(Math.min(...m.rows.map((x) => x.labelH)))}px`)
    const packing = m.rows.filter((x) => x.kind === 'packing')
    const packBad = packing.filter((x) => !x.delOnLabelLine || x.h > x.labelH + 10)
    check(`${w}: packing rows are one line (× beside the label)`, !packBad.length, packBad.map((x) => `${x.title}=${Math.round(x.h)}`).slice(0, 4).join(', ') || `max ${Math.round(Math.max(...packing.map((x) => x.h)))}px`)
    const tasks = m.rows.filter((x) => x.kind === 'tasks')
    const taskBad = tasks.filter((x) => !x.delOnLabelLine || !x.metaBelow || !x.metaOneLine || x.h > x.labelH + x.metaH + 18)
    check(`${w}: task rows are two lines (title + ×, then assignee + due)`, !taskBad.length, taskBad.map((x) => `${x.title}=${Math.round(x.h)} below=${x.metaBelow} one=${x.metaOneLine}`).slice(0, 3).join(', ') || `max ${Math.round(Math.max(...tasks.map((x) => x.h)))}px`)
    const cut = tasks.filter((x) => !x.assignee?.fits)
    check(`${w}: every task assignee Select shows a full first name (or Unassigned)`, !cut.length, cut.map((x) => `${x.title}=${JSON.stringify(x.assignee)}`).slice(0, 3).join(', ') || `${tasks.length} rows`)
  }

  // the button reveals the create panel, and nothing was hidden that the panel doesn't hold
  if (m.newBtn) {
    await page.locator('[data-test="new-checklist"]').click()
    await page.locator('#checklist-name').waitFor({ timeout: 3000 }).catch(() => {})
  }
  const opened = await page.evaluate(() => ({
    name: !!document.querySelector('#checklist-name'),
    template: !!document.querySelector('[aria-label="Template"]'),
    expanded: document.querySelector('[data-test="new-checklist"]')?.getAttribute('aria-expanded') ?? null
  }))
  check(`${w}: New checklist opens Create + From template`, opened.name && opened.template && opened.expanded === 'true', JSON.stringify(opened))

  check(`${w}: no console errors`, !errors.length, errors.join(' | '))
  await ctx.close()
}
await browser.close()
console.log(failures ? `CHECKLISTS CHECK FAILED (${failures})` : 'CHECKLISTS CHECK OK')
process.exit(failures ? 1 : 0)
