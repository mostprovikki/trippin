// Shared across storage drivers so route code can translate "object missing" into a
// 404 in one place (documents.routes.js's sendDoc) instead of per-driver, per-route checks.
export class StorageNotFoundError extends Error {
  constructor(key) {
    super(`Storage object not found: ${key}`)
    this.name = 'StorageNotFoundError'
    this.key = key
  }
}
