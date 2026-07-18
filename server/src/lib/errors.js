export function httpError(reply, status, code, message) {
  return reply.code(status).send({ error: { code, message } })
}
