// Queue is anchored on globalThis so all module instances (the test runner may
// load this module under more than one specifier) share a single queue.
const queue = (globalThis.__TP_MOCK_LLM_QUEUE__ ??= [])
export function queueMock(obj) { queue.push(JSON.stringify(obj)) }
export function queueMockRaw(text) { queue.push(text) }
export function clearMocks() { queue.length = 0 }
export default { async complete() {
  if (!queue.length) throw new Error('mock LLM queue empty — call queueMock() in your test')
  return queue.shift()
} }
