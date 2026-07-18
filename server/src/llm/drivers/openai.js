import { config } from '../../config.js'
export default { async complete({ system, prompt, maxTokens = 4000 }) {
  const res = await fetch((config.llm.baseUrl || 'https://api.openai.com') + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.llm.apiKey}` },
    body: JSON.stringify({ model: config.llm.model, max_tokens: maxTokens, messages: [
      { role: 'system', content: system || 'You are a precise trip-planning assistant. Respond with JSON only.' },
      { role: 'user', content: prompt }] })
  })
  if (!res.ok) throw Object.assign(new Error(`LLM HTTP ${res.status}: ${await res.text()}`), { name: 'LlmHttpError' })
  return (await res.json()).choices[0].message.content
} }
