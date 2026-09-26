// Self-contained prompt assembly for the BYO-AI path: a human pastes one block into a bare
// chatbot, so there is no system slot and no retry loop. Everything the drivers normally carry
// (role, output discipline, schema) has to be inside the text itself.

const BASE_RULES = [
  'Output the JSON object and nothing else — no prose before or after, no markdown code fences.',
  'Use the keys exactly as shown in OUTPUT SHAPE; include every field not marked optional.',
  'Where a field says "one of", use one of the listed values verbatim.',
  'Numbers are plain JSON numbers (no currency symbols, units or thousands separators).',
]

function countNote(schema) {
  const { minItems: min, maxItems: max } = schema
  if (min != null && min === max) return `exactly ${min} entries`
  if (min != null && max != null) return `${min} to ${max} entries`
  if (min != null) return `at least ${min} entries`
  if (max != null) return `at most ${max} entries`
  return null
}

// Renders a JSON-schema subset (object/array/string/number/enum) as an annotated JSON skeleton.
// Returns an array of lines so callers can append a trailing comma/comment to the last one.
function shapeLines(schema, indent) {
  if (schema.enum) return [`one of ${schema.enum.map((v) => JSON.stringify(v)).join(' | ')}`]
  const inner = indent + '  '
  if (schema.type === 'object') {
    const required = new Set(schema.required || [])
    const entries = Object.entries(schema.properties || {})
    const lines = ['{']
    entries.forEach(([key, sub], i) => {
      const value = shapeLines(sub, inner)
      value[0] = `${inner}"${key}": ${value[0]}`
      const last = value.length - 1
      value[last] += i < entries.length - 1 ? ',' : ''
      if (!required.has(key)) value[last] += '  // optional'
      lines.push(...value)
    })
    lines.push(`${indent}}`)
    return lines
  }
  if (schema.type === 'array') {
    const note = countNote(schema)
    const item = shapeLines(schema.items || {}, inner)
    item[0] = inner + item[0]
    return [`[${note ? `  // ${note}` : ''}`, ...item, `${indent}]`]
  }
  if (schema.type === 'number') return [schema.minimum != null ? `number >= ${schema.minimum}` : 'number']
  if (schema.type === 'string') return ['string']
  return ['any JSON value']
}

export function renderShape(schema) {
  return shapeLines(schema, '').join('\n')
}

// Six blocks in fixed order: role line, TRIP, CONSTRAINTS, TASK, OUTPUT SHAPE, RULES.
export function wrap({ role, trip, constraints, task, schema, rules = [] }) {
  return [
    role,
    '',
    'TRIP',
    trip,
    '',
    'CONSTRAINTS',
    constraints,
    '',
    'TASK',
    task,
    '',
    'OUTPUT SHAPE',
    renderShape(schema),
    '',
    'RULES',
    ...[...rules, ...BASE_RULES].map((r) => `- ${r}`),
  ].join('\n')
}
