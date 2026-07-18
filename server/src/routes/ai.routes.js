import { isEnabled } from '../llm/index.js'
export default async function routes(app) {
  app.get('/ai/status', async () => ({ enabled: isEnabled(), provider: process.env.LLM_PROVIDER || 'none' }))
}
