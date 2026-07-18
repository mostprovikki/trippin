import 'dotenv/config'
export const config = {
  port: Number(process.env.PORT || 3000),
  dbPath: process.env.DB_PATH || './data/tripplanner.db',
  uploadsDir: process.env.UPLOADS_DIR || './data/uploads',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
  currency: process.env.DEFAULT_CURRENCY || 'INR',
  llm: {
    provider: process.env.LLM_PROVIDER || 'none',
    model: process.env.LLM_MODEL || '',
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || ''
  }
}
