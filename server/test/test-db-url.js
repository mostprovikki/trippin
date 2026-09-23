// Single source of truth for the default test/dev Postgres URL. Used by every
// vitest test file (global-setup.js, migrate.test.js, helpers.js, db.test.js)
// and by e2e/smoke.mjs. Previously duplicated as the same literal in all five
// places — a port change needed four edits and failed four different ways
// when one was missed. Side-effect-free: just an env lookup, no I/O.
export const TEST_URL = process.env.TEST_DATABASE_URL || 'postgres://tripper:tripper@127.0.0.1:43105/tripper_test'
