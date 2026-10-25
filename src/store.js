// Client-side mirror of what the server last told us. The server stays authoritative.
const listeners = new Set()

export const store = {
  state: null,
  dex: null,
  set(state) {
    this.state = state
    for (const fn of listeners) fn(state)
  },
  subscribe(fn) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
}
