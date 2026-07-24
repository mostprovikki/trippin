// Node >=22 defines globalThis.localStorage/sessionStorage getters that return
// undefined unless node runs with --localstorage-file. Because the keys already
// exist on globalThis, vitest's happy-dom environment skips copying the
// window's Storage globals, so every test touching localStorage breaks.
// Install a spec-shaped in-memory Storage instead.
class MemoryStorage {
  #map = new Map()
  get length() { return this.#map.size }
  key(i) { return [...this.#map.keys()][i] ?? null }
  getItem(k) { return this.#map.has(String(k)) ? this.#map.get(String(k)) : null }
  setItem(k, v) { this.#map.set(String(k), String(v)) }
  removeItem(k) { this.#map.delete(String(k)) }
  clear() { this.#map.clear() }
}

for (const key of ['localStorage', 'sessionStorage']) {
  if (!globalThis[key]) {
    Object.defineProperty(globalThis, key, {
      value: new MemoryStorage(),
      configurable: true,
      writable: true
    })
  }
}
