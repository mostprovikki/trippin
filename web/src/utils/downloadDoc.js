// Shared by ParticipantDocs.vue and DocumentList.vue: both used to fetch a document
// with `Authorization: Bearer <token>` / cookie auth and read the response body
// directly. That breaks once STORAGE_DRIVER=stratus, because the download route
// 302-redirects to a presigned URL — fetch cannot follow a cross-origin redirect
// and still read the body (CORS), and a plain navigation carries no auth header.
//
// OWNER DECISION (trip-planner-a17): keep Stratus signed URLs, option (c) — an
// authenticated JSON endpoint (`GET .../file-url`, see documents.routes.js
// sendDocUrl()) returns `{ url, direct }`. That step goes through the app's own
// api client (api.get / participantApi(token).get in the stores below) — it
// already parses JSON safely, throws a typed ApiError with a server-supplied
// message on any non-2xx, and (for the organizer/cookie path) fires the existing
// tripper:unauthorized redirect on a 401. This module only does the SECOND step:
// actually fetching the file bytes `url` points at, which is never JSON and so
// can't go through that client.
//
// `direct: true` means the url is a cross-origin presigned URL: fetch it with NO
// auth header — the signature in the URL IS the auth, and the bearer token must
// never ride along in a query string or to a third-party host. `direct: false`
// means same-origin + still needs the caller's own auth: reuse the same headers
// used for the file-url request.
//
// This also fixes the download filename: a presigned URL is named after the
// storage key (no extension, no original name), so both drivers are read as a
// blob and saved locally under the document's own `original_name`.

export class DownloadError extends Error {
  constructor(reason, message) {
    super(message)
    this.name = 'DownloadError'
    // 'network' | 'auth' | 'not_found' | 'url_expired' | 'server'
    this.reason = reason
  }
}

// { url, direct } is what the file-url endpoint already handed the caller (via
// api.get/participantApi — see stores/people.js, stores/participant.js).
// Returns a Blob, or throws DownloadError.
export async function fetchDocumentBlob({ url, direct }, { headers = {} } = {}) {
  let res
  try {
    res = direct ? await fetch(url) : await fetch(url, { headers, credentials: 'same-origin' })
  } catch {
    // A cross-origin presigned fetch that fails at the network/CORS layer throws
    // a TypeError, not an HTTP status — same-shape failure either way.
    throw new DownloadError('network', direct
      ? 'Could not reach file storage. Check your connection and try again.'
      : 'Could not reach the server. Check your connection and try again.')
  }
  if (res.ok) return res.blob()
  if (direct) {
    // Stratus can't tell us WHY a presigned GET failed beyond an HTTP status (no
    // JSON body worth parsing) — expired (past its 300s window), revoked, or the
    // object itself gone all look the same from here.
    throw new DownloadError('url_expired', 'This download link has expired or is no longer valid. Try again.')
  }
  if (res.status === 401) throw new DownloadError('auth', 'Your session has expired. Please log in again.')
  if (res.status === 404) throw new DownloadError('not_found', 'This document could not be found.')
  throw new DownloadError('server', 'Download failed. Try again.')
}

// Second step for the "open in a new tab" secondary action (DocumentList.vue):
// resolve the URL to navigate to. direct:true's `url` is a presigned Stratus
// link and already renders inline via its own contentType. direct:false's
// `url` is the same-origin /file path the download route itself redirects
// from — that route defaults to `content-disposition: attachment` (see
// sendDoc in documents.routes.js), so opened as-is it would just download the
// file again and the new tab would close itself. `?inline=1` is the flag
// sendDoc checks to send `inline` instead — picked over a second `view_url`
// field on the file-url response so the response shape (and its existing
// tests) stay untouched.
export async function getDocUrl(store, docId) {
  const { url, direct } = await store.getDocumentUrl(docId)
  return direct ? url : `${url}?inline=1`
}

export function triggerBlobDownload(blob, filename) {
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Not synchronous: WebKit can abort a download-attribute click if the blob URL
  // is revoked before it has finished handing off to the OS/save dialog.
  setTimeout(() => URL.revokeObjectURL(objUrl), 0)
}
