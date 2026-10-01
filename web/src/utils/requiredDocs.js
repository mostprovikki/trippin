// tripper.md §6 Missing: a required doc type with no document of that type.
// Expiry is ignored here, as in server/src/lib/missing.js missingDocsByPerson —
// an expiring document is a separate reason (expiryWarnings).
export function missingDocTypes(required = [], documents = []) {
  const have = new Set((documents || []).map((d) => d.doc_type))
  return (required || []).filter((t) => !have.has(t))
}
