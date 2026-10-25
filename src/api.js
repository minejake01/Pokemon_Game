const KEY = 'pokeArena.playerId'

export function getPlayerId() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setPlayerId(id) {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: the save still exists on the server for this session */
  }
  memoryId = id
}

let memoryId = null

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Player-Id': memoryId ?? getPlayerId() ?? '' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`)
  return data
}

export const api = {
  newGame: (name, starter) => request('POST', '/new', { name, starter }),
  state: () => request('GET', '/state'),
  dex: () => request('GET', '/dex'),
  position: (x, y) => request('POST', '/position', { x, y }),
  spawn: (tx, ty) => request('POST', '/spawn', { tx, ty }),
  despawn: (ids) => request('POST', '/despawn', { ids }),
  battleStart: (spawnId) => request('POST', '/battle/start', { spawnId }),
  battleAction: (action) => request('POST', '/battle/action', action),
  useItem: (item, uid) => request('POST', '/item/use', { item, uid }),
  moveMon: (uid, to) => request('POST', '/team/move', { uid, to }),
  orderTeam: (uids) => request('POST', '/team/order', { uids }),
  visitCenter: (centerId) => request('POST', '/center/visit', { centerId }),
  heal: (centerId) => request('POST', '/center/heal', { centerId }),
  buy: (item, qty) => request('POST', '/mart/buy', { item, qty }),
  upgrade: (uid, choice) => request('POST', '/upgrade', { uid, choice }),
  trainerTalk: (trainerId) => request('POST', '/trainer/talk', { trainerId }),
  trainerBattle: (trainerId) => request('POST', '/trainer/battle', { trainerId }),
}
