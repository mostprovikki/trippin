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
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{'); const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try { return JSON.parse(body.slice(start, end + 1)) } catch { return null }
}
// Pasted replies (BYO-AI path): same extraction + Ajv check as generate(), but never re-asked —
// the error text goes back to the user instead.
export function parseAndValidate({ text, schema }) {
  if (typeof text !== 'string' || !/[{}]/.test(text)) throw new LlmValidationError('Reply contains no JSON object — paste the AI\'s JSON answer')
  const parsed = extractJson(text)
  if (!parsed) throw new LlmValidationError('Reply contains JSON that could not be parsed — it may be truncated or malformed')
  const validate = ajv.compile(schema)
  if (!validate(parsed)) throw new LlmValidationError(`Reply JSON does not match the expected shape: ${ajv.errorsText(validate.errors)}`)
  return parsed
}
export const pasteBodySchema = { type: 'object', required: ['text'], properties: { text: { type: 'string' } } }
export function pasteError(reply, err) {
  if (!(err instanceof LlmValidationError)) throw err
  reply.code(400).send({ error: { code: 'AI_PASTE_INVALID', message: err.message } })
  return reply
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
