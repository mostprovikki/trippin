import { config } from '../../config.js'
export default { async complete({ system, prompt, maxTokens = 4000 }) {
  const res = await fetch((config.llm.baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': config.llm.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: config.llm.model, max_tokens: maxTokens,
      system: system || 'You are a precise trip-planning assistant. Respond with JSON only.',
      messages: [{ role: 'user', content: prompt }] })
  })
  if (!res.ok) throw Object.assign(new Error(`LLM HTTP ${res.status}: ${await res.text()}`), { name: 'LlmHttpError' })
  const data = await res.json()
  return data.content.map(b => b.text || '').join('')
} }
