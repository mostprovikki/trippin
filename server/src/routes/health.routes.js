export default async function routes(app) {
  app.get('/health', async () => ({ ok: true }))
}
