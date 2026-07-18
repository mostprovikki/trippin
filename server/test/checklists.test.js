import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeEach } from 'vitest'
import { makeTestApp, loginOrganizer, authedInject, createTrip, createPerson } from './helpers.js'
import { buildPackingPrompt } from '../src/llm/prompts/packing.js'
import { clearMocks, queueMock } from '../src/llm/drivers/mock.js'

function seedParticipantLink(app, db, tripId, personId) {
  const raw = randomUUID()
  db.prepare('INSERT INTO participant_links (id, trip_id, person_id, token_hash) VALUES (?,?,?,?)')
    .run(randomUUID(), tripId, personId, app.hashToken(raw))
  return raw
}

describe('checklists routes', () => {
  let app, db, cookie

  beforeEach(async () => {
    clearMocks()
    ;({ app, db } = await makeTestApp())
    ;({ cookie } = loginOrganizer(app, db))
  })

  it('creates a trip checklist, adds items, and organizer can tick an item', async () => {
    const trip = createTrip(db, { name: 'Goa Trip' })
    const person = createPerson(db, { name: 'Alice' })

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
    const person = createPerson(db, { name: 'Bob' })
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

    const trip = createTrip(db, { name: 'Beach Trip' })
    // Give the template item an assignee & done state directly to prove copy clears them.
    db.prepare('UPDATE checklist_items SET assignee_person_id = ?, done = 1 WHERE id = ?')
      .run(person.id, tItem1.json().id)

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
    const trip = createTrip(db)
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
    const person = createPerson(db, { name: 'Cara' })
    const trip = createTrip(db, { name: 'Ski Trip' })
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
      const trip = createTrip(db)
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
      const trip = createTrip(db, { destination: 'Goa', vibe_tags: JSON.stringify(['beach']) })
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
      const trip = createTrip(db, {
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
  })

  describe('participant routes', () => {
    it('sees own packing items (assigned or unassigned) and tasks assigned to them, and can tick', async () => {
      const trip = createTrip(db, { name: 'Trip A' })
      const otherTrip = createTrip(db, { name: 'Trip B' })
      const me = createPerson(db, { name: 'Dee' })
      const other = createPerson(db, { name: 'Eve' })

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

      const raw = seedParticipantLink(app, db, trip.id, me.id)
      const otherRaw = seedParticipantLink(app, db, otherTrip.id, createPerson(db).id)

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
})
