import Ajv from 'ajv'
import anthropic from './drivers/anthropic.js'
import openai from './drivers/openai.js'
import mock from './drivers/mock.js'

const ajv = new Ajv({ allErrors: true, useDefaults: true })
const drivers = { anthropic, openai, mock }
const provider = () => process.env.LLM_PROVIDER || 'none'

export class LlmDisabledError extends Error { constructor() { super('AI is disabled: no LLM provider configured') } }
export class LlmValidationError extends Error {}
export function isEnabled() { return provider() !== 'none' && !!drivers[provider()] }
export function aiGuard(reply) {
  if (isEnabled()) return false
  reply.code(503).send({ error: { code: 'AI_DISABLED', message: 'No LLM provider configured' } })
  return true
}
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{'); const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try { return JSON.parse(body.slice(start, end + 1)) } catch { return null }
}
export async function generate({ system, prompt, schema, maxTokens = 4000 }) {
  if (!isEnabled()) throw new LlmDisabledError()
  const validate = ajv.compile(schema)
  let lastErr = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? prompt
      : `${prompt}\n\nYour previous response failed validation: ${lastErr}\nReturn ONLY valid JSON matching the required schema.`
    const text = await drivers[provider()].complete({ system, prompt: p, maxTokens })
    const parsed = extractJson(text)
    if (parsed && validate(parsed)) return parsed
    lastErr = parsed ? ajv.errorsText(validate.errors) : 'response was not parseable JSON'
  }
  throw new LlmValidationError(`LLM output failed validation after retry: ${lastErr}`)
}
