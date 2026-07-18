const queue = []
export function queueMock(obj) { queue.push(JSON.stringify(obj)) }
export function queueMockRaw(text) { queue.push(text) }
export function clearMocks() { queue.length = 0 }
export default { async complete() {
  if (!queue.length) throw new Error('mock LLM queue empty — call queueMock() in your test')
  return queue.shift()
} }
