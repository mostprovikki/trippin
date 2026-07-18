export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}
async function request(path, { method = 'GET', body, headers = {}, redirectOn401 = true } = {}) {
  const opts = { method, credentials: 'same-origin', headers: { ...headers } }
  if (body instanceof FormData) opts.body = body
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const res = await fetch(path, opts)
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && redirectOn401 && location.pathname !== '/login') location.assign('/login')
    throw new ApiError(res.status, data.error?.code || 'UNKNOWN', data.error?.message || res.statusText)
  }
  return data
}
export const api = {
  get: (p) => request(p),
  post: (p, b) => request(p, { method: 'POST', body: b }),
  put: (p, b) => request(p, { method: 'PUT', body: b }),
  del: (p) => request(p, { method: 'DELETE' }),
  upload: (p, formData) => request(p, { method: 'POST', body: formData })
}
export function participantApi(token) {
  const h = { Authorization: `Bearer ${token}` }
  const o = { headers: h, redirectOn401: false }
  return {
    get: (p) => request(p, o),
    post: (p, b) => request(p, { ...o, method: 'POST', body: b }),
    put: (p, b) => request(p, { ...o, method: 'PUT', body: b }),
    del: (p) => request(p, { ...o, method: 'DELETE' }),
    upload: (p, f) => request(p, { ...o, method: 'POST', body: f })
  }
}
