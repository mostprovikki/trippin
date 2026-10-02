import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson, createOrganizer } from './helpers.js'
import { buildPackingPrompt } from '../src/llm/prompts/packing.js'
import { clearMocks, queueMock } from '../src/llm/drivers/mock.js'

async function seedParticipantLink(app, db, tripId, personId) {
  const raw = randomUUID()
  await db.run('INSERT INTO participant_links (id, trip_id, person_id, token_hash) VALUES (?,?,?,?)',
    [randomUUID(), tripId, personId, app.hashToken(raw)])
  return raw
}

const join = (db, tripId, personId) =>
  db.run('INSERT INTO trip_participants (trip_id, person_id) VALUES (?, ?)', [tripId, personId])

describe('checklists routes', () => {
  let app, db, cookie

  beforeEach(async () => {
    clearMocks()
    ;({ app, db } = await makeTestApp())
    ;({ cookie } = await loginOrganizer(app, db))
  })

  it('creates a trip checklist, adds items, and organizer can tick an item', async () => {
    const trip = await createTrip(db, { name: 'Goa Trip' })
    const person = await createPerson(db, { name: 'Alice' })
    await join(db, trip.id, person.id)

    const createRes = await authedInject(app, cookie, {
      method: 'POST', url: '/api/checklists',
      payload: { kind: 'packing', name: 'Packing List', trip_id: trip.id },
    })
    expect(createRes.statusCode).toBe(201)
    const checklist = createRes.json().checklist
    expect(checklist.kind).toBe('packing')
    expect(checklist.trip_id).toBe(trip.id)
    expect(checklist.is_template).toBe(0)
    expect(checklist.items).toEqual([])

    const itemRes = await authedInject(app, cookie, {
      method: 'POST', url: `/api/checklists/${checklist.id}/items`,
      payload: { title: 'Sunscreen', assignee_person_id: person.id },
    })
    expect(itemRes.statusCode).toBe(201)
    const item = itemRes.json()
    expect(item.title).toBe('Sunscreen')
    expect(item.assignee_name).toBe('Alice')
    expect(item.done).toBe(0)

    const tickRes = await authedInject(app, cookie, {
      method: 'PUT', url: `/api/checklist-items/${item.id}`,
      payload: { done: true },
    })
    expect(tickRes.statusCode).toBe(200)
    expect(tickRes.json().done).toBe(1)

    const listRes = await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/checklists` })
    expect(listRes.json().checklists).toHaveLength(1)
    expect(listRes.json().checklists[0].items).toHaveLength(1)

    const delItemRes = await authedInject(app, cookie, { method: 'DELETE', url: `/api/checklist-items/${item.id}` })
    expect(delItemRes.statusCode).toBe(204)

    const delRes = await authedInject(app, cookie, { method: 'DELETE', url: `/api/checklists/${checklist.id}` })
    expect(delRes.statusCode).toBe(204)
  })

  it('creates a template directly', async () => {
    const res = await authedInject(app, cookie, {
      method: 'POST', url: '/api/checklists',
      payload: { kind: 'packing', name: 'Trek Packing', is_template: true, trip_type_tags: ['trek'] },
    })
    expect(res.statusCode).toBe(201)
    const checklist = res.json().checklist
    expect(checklist.is_template).toBe(1)
    expect(checklist.trip_id).toBeNull()
    expect(checklist.trip_type_tags).toEqual(['trek'])

    const listRes = await authedInject(app, cookie, { method: 'GET', url: '/api/checklists?template=1' })
    expect(listRes.json().checklists.map((c) => c.id)).toContain(checklist.id)
  })

  it('POST /checklists 404s when trip_id does not exist', async () => {
    const res = await authedInject(app, cookie, {
      method: 'POST', url: '/api/checklists',
      payload: { kind: 'tasks', name: 'X', trip_id: 'nope' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })

  it('from-template copies items with done=0 and assignees cleared', async () => {
    const person = await createPerson(db, { name: 'Bob' })
    const templateRes = await authedInject(app, cookie, {
      method: 'POST', url: '/api/checklists',
      payload: { kind: 'packing', name: 'Beach Template', is_template: true },
    })
    const template = templateRes.json().checklist
    const tItem1 = await authedInject(app, cookie, {
      method: 'POST', url: `/api/checklists/${template.id}/items`,
      payload: { title: 'Towel' },
    })
    await authedInject(app, cookie, {
      method: 'POST', url: `/api/checklists/${template.id}/items`,
      payload: { title: 'Flip flops' },
    })
    // mark one item's would-be assignee/done fields on template shouldn't matter — templates start clean.
    expect(tItem1.json().assignee_person_id).toBeNull()

    const trip = await createTrip(db, { name: 'Beach Trip' })
    // Give the template item an assignee & done state directly to prove copy clears them.
    await db.run('UPDATE checklist_items SET assignee_person_id = ?, done = 1 WHERE id = ?',
      [person.id, tItem1.json().id])

    const copyRes = await authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/${trip.id}/checklists/from-template`,
      payload: { template_id: template.id },
    })
    expect(copyRes.statusCode).toBe(201)
    const copy = copyRes.json().checklist
    expect(copy.trip_id).toBe(trip.id)
    expect(copy.is_template).toBe(0)
    expect(copy.items).toHaveLength(2)
    for (const item of copy.items) {
      expect(item.done).toBe(0)
      expect(item.assignee_person_id).toBeNull()
    }
  })

  it('from-template 404s for unknown trip or non-template checklist', async () => {
    const trip = await createTrip(db)
    const notTemplateRes = await authedInject(app, cookie, {
      method: 'POST', url: '/api/checklists',
      payload: { kind: 'tasks', name: 'Regular', trip_id: trip.id },
    })
    const notTemplate = notTemplateRes.json().checklist

    const res1 = await authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/${trip.id}/checklists/from-template`,
      payload: { template_id: notTemplate.id },
    })
    expect(res1.statusCode).toBe(404)

    const res2 = await authedInject(app, cookie, {
      method: 'POST', url: `/api/trips/nope/checklists/from-template`,
      payload: { template_id: notTemplate.id },
    })
    expect(res2.statusCode).toBe(404)
  })

  it('promote-to-template strips assignee/done/due from copied items', async () => {
    const person = await createPerson(db, { name: 'Cara' })
    const trip = await createTrip(db, { name: 'Ski Trip' })
    await join(db, trip.id, person.id)
    const checklistRes = await authedInject(app, cookie, {
      method: 'POST', url: '/api/checklists',
      payload: { kind: 'tasks', name: 'Ski Tasks', trip_id: trip.id },
    })
    const checklist = checklistRes.json().checklist
    const itemRes = await authedInject(app, cookie, {
      method: 'POST', url: `/api/checklists/${checklist.id}/items`,
      payload: { title: 'Book lift pass', assignee_person_id: person.id, due_date: '2026-01-01' },
    })
    await authedInject(app, cookie, {
      method: 'PUT', url: `/api/checklist-items/${itemRes.json().id}`,
      payload: { done: true },
    })

    const promoteRes = await authedInject(app, cookie, {
      method: 'POST', url: `/api/checklists/${checklist.id}/promote-to-template`,
      payload: { name: 'Ski Task Template' },
    })
    expect(promoteRes.statusCode).toBe(201)
    const template = promoteRes.json().checklist
    expect(template.is_template).toBe(1)
    expect(template.trip_id).toBeNull()
    expect(template.name).toBe('Ski Task Template')
    expect(template.items).toHaveLength(1)
    expect(template.items[0].title).toBe('Book lift pass')
    expect(template.items[0].assignee_person_id).toBeNull()
    expect(template.items[0].due_date).toBeNull()
    expect(template.items[0].done).toBe(0)
  })

  describe('ai-packing-suggest', () => {
    beforeEach(() => { delete process.env.LLM_PROVIDER })

    it('400 NOT_PACKING when checklist kind is tasks', async () => {
      const trip = await createTrip(db)
      const res = await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'tasks', name: 'Tasks', trip_id: trip.id },
      })
      const checklist = res.json().checklist
      process.env.LLM_PROVIDER = 'mock'
      queueMock({ items: [{ title: 'x' }] })
      const suggestRes = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${checklist.id}/ai-packing-suggest`,
      })
      expect(suggestRes.statusCode).toBe(400)
      expect(suggestRes.json().error.code).toBe('NOT_PACKING')
    })

    it('404 when checklist is a template (no trip context)', async () => {
      const res = await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'packing', name: 'Template', is_template: true },
      })
      const checklist = res.json().checklist
      process.env.LLM_PROVIDER = 'mock'
      const suggestRes = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${checklist.id}/ai-packing-suggest`,
      })
      expect(suggestRes.statusCode).toBe(404)
    })

    it('503 AI_DISABLED when LLM_PROVIDER is none', async () => {
      const trip = await createTrip(db, { destination: 'Goa', vibe_tags: JSON.stringify(['beach']) })
      const res = await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
      })
      const checklist = res.json().checklist
      process.env.LLM_PROVIDER = 'none'
      const suggestRes = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${checklist.id}/ai-packing-suggest`,
      })
      expect(suggestRes.statusCode).toBe(503)
      expect(suggestRes.json().error.code).toBe('AI_DISABLED')
    })

    it('returns mock-suggested item titles as a draft', async () => {
      const trip = await createTrip(db, {
        destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05',
        vibe_tags: JSON.stringify(['beach', 'relaxed']),
      })
      const res = await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
      })
      const checklist = res.json().checklist

      process.env.LLM_PROVIDER = 'mock'
      queueMock({ items: [{ title: 'Sunscreen' }, { title: 'Swimsuit' }] })

      const suggestRes = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${checklist.id}/ai-packing-suggest`,
      })
      expect(suggestRes.statusCode).toBe(200)
      expect(suggestRes.json().items).toEqual([{ title: 'Sunscreen' }, { title: 'Swimsuit' }])
    })

    it('prompt endpoint returns a prompt with no provider configured', async () => {
      const trip = await createTrip(db, {
        destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05',
        vibe_tags: JSON.stringify(['beach', 'relaxed']),
      })
      const res = await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
      })
      const checklist = res.json().checklist
      process.env.LLM_PROVIDER = 'none'
      const promptRes = await authedInject(app, cookie, {
        method: 'GET', url: `/api/checklists/${checklist.id}/ai-packing-suggest/prompt`,
      })
      expect(promptRes.statusCode).toBe(200)
      expect(typeof promptRes.json().prompt).toBe('string')
      expect(promptRes.json().prompt.length).toBeGreaterThan(0)
    })

    it('prompt endpoint 404s for another organizer\'s checklist', async () => {
      const other = await createOrganizer(db, { email: 'other-checklist@x.dev' })
      const trip = await createTrip(db, { organizer_id: other.id, destination: 'Goa' })
      const otherCookie = `tp_session=${app.signSession(other)}`
      const res = await authedInject(app, otherCookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
      })
      const checklist = res.json().checklist
      process.env.LLM_PROVIDER = 'none'
      const promptRes = await authedInject(app, cookie, {
        method: 'GET', url: `/api/checklists/${checklist.id}/ai-packing-suggest/prompt`,
      })
      expect(promptRes.statusCode).toBe(404)
    })

    describe('import (pasted JSON, no provider)', () => {
      async function post(text) {
        const trip = await createTrip(db, { destination: 'Goa', start_date: '2026-08-01', end_date: '2026-08-05' })
        const checklist = (await authedInject(app, cookie, {
          method: 'POST', url: '/api/checklists', payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
        })).json().checklist
        process.env.LLM_PROVIDER = 'none'
        const res = await authedInject(app, cookie, { method: 'POST', url: `/api/checklists/${checklist.id}/ai-packing-suggest/import`, payload: { text } })
        const { n } = await db.get('SELECT COUNT(*)::int AS n FROM checklist_items WHERE checklist_id = ?', [checklist.id])
        return { res, n }
      }
      const items = [{ title: 'Sunscreen' }, { title: 'Swimsuit' }]
      it('valid JSON -> 200 with the provider route\'s { items } shape', async () => {
        const { res } = await post(JSON.stringify({ items }))
        expect(res.statusCode).toBe(200); expect(res.json()).toEqual({ items })
      })
      it('fenced JSON -> 200', async () => {
        const { res } = await post('```json\n' + JSON.stringify({ items }) + '\n```')
        expect(res.statusCode).toBe(200); expect(res.json()).toEqual({ items })
      })
      it('prose -> 400, nothing written', async () => {
        const { res, n } = await post('Pack light!')
        expect(res.statusCode).toBe(400); expect(res.json().error.code).toBe('AI_PASTE_INVALID')
        expect(res.json().error.message).toMatch(/no JSON/i); expect(n).toBe(0)
      })
      it('schema violation -> 400 with Ajv text', async () => {
        const { res } = await post(JSON.stringify({ items: [{ name: 'Sunscreen' }] }))
        expect(res.statusCode).toBe(400); expect(res.json().error.message).toMatch(/must have required property 'title'/)
      })
      it('another organizer\'s checklist -> 404', async () => {
        const other = await createOrganizer(db, { email: 'other-checklist-import@x.dev' })
        const trip = await createTrip(db, { organizer_id: other.id, destination: 'Goa' })
        const checklist = (await authedInject(app, `tp_session=${app.signSession(other)}`, {
          method: 'POST', url: '/api/checklists', payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
        })).json().checklist
        const res = await authedInject(app, cookie, { method: 'POST', url: `/api/checklists/${checklist.id}/ai-packing-suggest/import`, payload: { text: JSON.stringify({ items }) } })
        expect(res.statusCode).toBe(404)
      })
    })
  })

  describe('participant routes', () => {
    it('sees own packing items (assigned or unassigned) and tasks assigned to them, and can tick', async () => {
      const trip = await createTrip(db, { name: 'Trip A' })
      const otherTrip = await createTrip(db, { name: 'Trip B' })
      const me = await createPerson(db, { name: 'Dee' })
      const other = await createPerson(db, { name: 'Eve' })
      await join(db, trip.id, me.id)
      await join(db, trip.id, other.id)

      const packingRes = await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
      })
      const packing = packingRes.json().checklist
      const mine = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${packing.id}/items`,
        payload: { title: 'My item', assignee_person_id: me.id },
      })
      const unassigned = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${packing.id}/items`,
        payload: { title: 'Shared item' },
      })
      const someoneElses = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${packing.id}/items`,
        payload: { title: 'Not mine', assignee_person_id: other.id },
      })

      const tasksRes = await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists',
        payload: { kind: 'tasks', name: 'Tasks', trip_id: trip.id },
      })
      const tasks = tasksRes.json().checklist
      const myTask = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${tasks.id}/items`,
        payload: { title: 'My task', assignee_person_id: me.id },
      })
      await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${tasks.id}/items`,
        payload: { title: 'Unassigned task' },
      })

      const raw = await seedParticipantLink(app, db, trip.id, me.id)
      const otherRaw = await seedParticipantLink(app, db, otherTrip.id, (await createPerson(db)).id)

      const getRes = await app.inject({
        method: 'GET', url: '/api/participant/checklist',
        headers: { authorization: `Bearer ${raw}` },
      })
      expect(getRes.statusCode).toBe(200)
      const body = getRes.json()
      const packingTitles = body.packing.map((i) => i.title).sort()
      expect(packingTitles).toEqual(['My item', 'Shared item'])
      expect(body.packing[0].checklist_name).toBe('Packing')
      expect(body.tasks.map((i) => i.title)).toEqual(['My task'])

      // participant ticks their own item
      const tickRes = await app.inject({
        method: 'PUT', url: `/api/participant/checklist-items/${mine.json().id}`,
        headers: { authorization: `Bearer ${raw}` },
        payload: { done: true },
      })
      expect(tickRes.statusCode).toBe(200)
      expect(tickRes.json().done).toBe(1)

      // cannot tick an item assigned to someone else
      const forbidden = await app.inject({
        method: 'PUT', url: `/api/participant/checklist-items/${someoneElses.json().id}`,
        headers: { authorization: `Bearer ${raw}` },
        payload: { done: true },
      })
      expect(forbidden.statusCode).toBe(404)

      // cannot tick an item belonging to another trip's link
      const crossTrip = await app.inject({
        method: 'PUT', url: `/api/participant/checklist-items/${mine.json().id}`,
        headers: { authorization: `Bearer ${otherRaw}` },
        payload: { done: true },
      })
      expect(crossTrip.statusCode).toBe(404)

      // cannot tick unassigned task (not assigned to them)
      const unassignedTaskId = (await authedInject(app, cookie, { method: 'GET', url: `/api/trips/${trip.id}/checklists` }))
        .json().checklists.find((c) => c.id === tasks.id).items.find((i) => i.title === 'Unassigned task').id
      const taskForbidden = await app.inject({
        method: 'PUT', url: `/api/participant/checklist-items/${unassignedTaskId}`,
        headers: { authorization: `Bearer ${raw}` },
        payload: { done: true },
      })
      expect(taskForbidden.statusCode).toBe(404)
    })
  })

  describe('buildPackingPrompt (privacy)', () => {
    it('includes only trip params, never PII', () => {
      const trip = {
        destination: 'Goa',
        start_date: '2026-08-01',
        vibe_tags: ['beach', 'relaxed'],
        participants: [{ name: 'John Doe', phone: '9998887777', email: 'john@x.com', medical_notes: 'diabetic' }],
      }
      const prompt = buildPackingPrompt(trip, 5, 'Packing List')
      expect(prompt).toContain('Goa')
      expect(prompt).toContain('beach, relaxed')
      expect(prompt).toContain('5 day(s)')
      expect(prompt).not.toContain('John Doe')
      expect(prompt).not.toContain('9998887777')
      expect(prompt).not.toContain('john@x.com')
      expect(prompt).not.toContain('diabetic')
    })
  })

  // trip-planner-h3i.4: an assignee is always someone on the item's trip.
  describe('assignee must be on the trip', () => {
    async function tripChecklist(trip) {
      return (await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists', payload: { kind: 'packing', name: 'Packing', trip_id: trip.id },
      })).json().checklist
    }

    it('assigning a person not on the trip is refused', async () => {
      const trip = await createTrip(db)
      const outsider = await createPerson(db, { name: 'Meera Nair' })
      const checklist = await tripChecklist(trip)
      const res = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${checklist.id}/items`,
        payload: { title: 'Sunscreen', assignee_person_id: outsider.id },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('ASSIGNEE_NOT_ON_TRIP')
      expect(await db.all('SELECT id FROM checklist_items WHERE checklist_id = ?', [checklist.id])).toEqual([])
    })

    it('re-assigning an item to a person not on the trip is refused and leaves the row alone', async () => {
      const trip = await createTrip(db)
      const member = await createPerson(db)
      const outsider = await createPerson(db)
      await join(db, trip.id, member.id)
      const checklist = await tripChecklist(trip)
      const item = (await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${checklist.id}/items`,
        payload: { title: 'Hat', assignee_person_id: member.id },
      })).json()
      const res = await authedInject(app, cookie, {
        method: 'PUT', url: `/api/checklist-items/${item.id}`,
        payload: { title: 'Renamed', assignee_person_id: outsider.id },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('ASSIGNEE_NOT_ON_TRIP')
      const row = await db.get('SELECT title, assignee_person_id FROM checklist_items WHERE id = ?', [item.id])
      expect(row).toEqual({ title: 'Hat', assignee_person_id: member.id })
      // clearing and other edits still work
      const clear = await authedInject(app, cookie, {
        method: 'PUT', url: `/api/checklist-items/${item.id}`, payload: { assignee_person_id: null },
      })
      expect(clear.statusCode).toBe(200)
      expect(clear.json().assignee_person_id).toBeNull()
    })

    it('a template item cannot carry an assignee', async () => {
      const person = await createPerson(db)
      const tpl = (await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists', payload: { kind: 'tasks', name: 'T', is_template: true },
      })).json().checklist
      const res = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${tpl.id}/items`,
        payload: { title: 'x', assignee_person_id: person.id },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('ASSIGNEE_NOT_ON_TRIP')
      const ok = await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${tpl.id}/items`, payload: { title: 'y', assignee_person_id: null },
      })
      expect(ok.statusCode).toBe(201)
    })

    it('removing a participant unassigns their items on that trip only', async () => {
      const trip = await createTrip(db)
      const otherTrip = await createTrip(db)
      const person = await createPerson(db)
      await join(db, trip.id, person.id)
      await join(db, otherTrip.id, person.id)
      const here = await tripChecklist(trip)
      const there = await tripChecklist(otherTrip)
      const a = (await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${here.id}/items`, payload: { title: 'a', assignee_person_id: person.id },
      })).json()
      const b = (await authedInject(app, cookie, {
        method: 'POST', url: `/api/checklists/${there.id}/items`, payload: { title: 'b', assignee_person_id: person.id },
      })).json()
      const del = await authedInject(app, cookie, { method: 'DELETE', url: `/api/trips/${trip.id}/participants/${person.id}` })
      expect(del.statusCode).toBe(204)
      expect((await db.get('SELECT assignee_person_id FROM checklist_items WHERE id = ?', [a.id])).assignee_person_id).toBeNull()
      expect((await db.get('SELECT assignee_person_id FROM checklist_items WHERE id = ?', [b.id])).assignee_person_id).toBe(person.id)
    })

    it('009 migration nulls assignees not on their item\'s trip', async () => {
      const { readFileSync, readdirSync } = await import('node:fs')
      const file = readdirSync(new URL('../src/migrations', import.meta.url)).find((f) => f.startsWith('009_'))
      expect(file).toBeTruthy()
      const trip = await createTrip(db)
      const member = await createPerson(db)
      const outsider = await createPerson(db)
      await join(db, trip.id, member.id)
      const checklist = await tripChecklist(trip)
      const tpl = (await authedInject(app, cookie, {
        method: 'POST', url: '/api/checklists', payload: { kind: 'tasks', name: 'T', is_template: true },
      })).json().checklist
      const rows = [['k', checklist.id, member.id], ['s', checklist.id, outsider.id], ['t', tpl.id, member.id]]
      for (const [id, cl, p] of rows)
        await db.run('INSERT INTO checklist_items (id, checklist_id, title, assignee_person_id, done, position) VALUES (?, ?, ?, ?, 0, 0)', [`mig-${id}`, cl, id, p])
      await db.exec(readFileSync(new URL(`../src/migrations/${file}`, import.meta.url), 'utf8'))
      const got = await db.all("SELECT id, assignee_person_id FROM checklist_items WHERE id LIKE 'mig-%' ORDER BY id")
      expect(got).toEqual([
        { id: 'mig-k', assignee_person_id: member.id },
        { id: 'mig-s', assignee_person_id: null },
        { id: 'mig-t', assignee_person_id: null },
      ])
    })
  })
})
