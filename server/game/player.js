import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { getWorld, isGoodSeed, TOWN, TILE } from '../../shared/world.js'
import { speciesById, STARTERS, STARTING_BAG, STARTING_MONEY, TEAM_MAX, ITEMS } from './data.js'
import { createMon, viewMon, calcStats } from './pokemon.js'
import { HttpError } from './errors.js'

const SAVE_DIR = new URL('../saves/', import.meta.url)
mkdirSync(SAVE_DIR, { recursive: true })

const players = new Map()
const saveFile = (id) => new URL(`${id}.json`, SAVE_DIR)
const VALID_ID = /^[0-9a-f-]{36}$/

export function loadPlayer(id) {
  if (!id || !VALID_ID.test(id)) return null
  if (players.has(id)) return players.get(id)
  const f = saveFile(id)
  if (!existsSync(f)) return null
  const p = JSON.parse(readFileSync(f, 'utf8'))
  players.set(id, p)
  return p
}

export function savePlayer(p) {
  writeFileSync(saveFile(p.id), JSON.stringify(p))
}

function pickSeed() {
  for (;;) {
    const seed = Math.floor(Math.random() * 1e9)
    if (isGoodSeed(seed)) return seed
  }
}

export function newPlayer(name, starter) {
  name = String(name ?? '').trim().slice(0, 12)
  if (!name) throw new HttpError(400, 'Enter a trainer name')
  starter = Number(starter)
  if (!STARTERS.includes(starter)) throw new HttpError(400, 'Pick Bulbasaur, Charmander or Squirtle')
  const seed = pickSeed()
  const p = {
    id: randomUUID(),
    name,
    seed,
    createdAt: Date.now(),
    team: [createMon(starter, 5)],
    box: [],
    bag: { ...STARTING_BAG },
    money: STARTING_MONEY,
    dex: { seen: [starter], caught: [starter] },
    pos: { x: (TOWN.x + 0.5) * TILE, y: (TOWN.y + 1.5) * TILE },
    lastCenter: 'c0',
    spawns: {},
    battle: null,
    gameOver: false,
    won: false,
    stats: { battles: 0, catches: 0, playMs: 0 },
  }
  players.set(p.id, p)
  savePlayer(p)
  return p
}

export function markSeen(p, id) {
  if (!p.dex.seen.includes(id)) p.dex.seen.push(id)
}

export function markCaught(p, id) {
  markSeen(p, id)
  if (!p.dex.caught.includes(id)) p.dex.caught.push(id)
  if (p.dex.caught.length >= 151 && !p.won) {
    p.won = true
    p.wonAt = Date.now()
  }
}

export function addToCollection(p, mon) {
  if (p.team.length < TEAM_MAX) {
    p.team.push(mon)
    return 'team'
  }
  p.box.push(mon)
  return 'box'
}

export function respawnAtCenter(p) {
  const world = getWorld(p.seed)
  const c = world.centers.find((x) => x.id === p.lastCenter) ?? world.centers[0]
  p.pos = { x: (c.x + 0.5) * TILE, y: (c.y + 1.5) * TILE }
  p.spawns = {}
  return p.pos
}

export function viewState(p) {
  return {
    id: p.id,
    name: p.name,
    seed: p.seed,
    team: p.team.map(viewMon),
    box: p.box.map(viewMon),
    bag: p.bag,
    items: ITEMS,
    money: p.money,
    dex: p.dex,
    pos: p.pos,
    lastCenter: p.lastCenter,
    gameOver: p.gameOver,
    won: p.won,
    stats: { ...p.stats, playMs: p.stats.playMs },
    inBattle: !!p.battle,
  }
}

// --- Team management -------------------------------------------------------

export function moveMon(p, uid, to) {
  if (p.battle) throw new HttpError(400, 'Not during a battle')
  if (to === 'box') {
    const i = p.team.findIndex((m) => m.uid === uid)
    if (i < 0) throw new HttpError(400, 'Not on your team')
    const rest = p.team.filter((m) => m.uid !== uid)
    if (!rest.some((m) => m.hp > 0)) throw new HttpError(400, 'You need at least one conscious Pokémon on your team')
    p.box.push(...p.team.splice(i, 1))
  } else if (to === 'team') {
    if (p.team.length >= TEAM_MAX) throw new HttpError(400, `Your team already has ${TEAM_MAX} Pokémon`)
    const i = p.box.findIndex((m) => m.uid === uid)
    if (i < 0) throw new HttpError(400, 'Not in the Box')
    p.team.push(...p.box.splice(i, 1))
  } else throw new HttpError(400, 'Bad destination')
}

export function reorderTeam(p, uids) {
  if (p.battle) throw new HttpError(400, 'Not during a battle')
  if (!Array.isArray(uids) || uids.length !== p.team.length) throw new HttpError(400, 'Bad order')
  const next = uids.map((u) => p.team.find((m) => m.uid === u))
  if (next.some((m) => !m) || new Set(uids).size !== uids.length) throw new HttpError(400, 'Bad order')
  p.team = next
}

// --- Poké Center -------------------------------------------------------------

function nearCenter(p, centerId) {
  const c = getWorld(p.seed).centers.find((x) => x.id === centerId)
  if (!c) throw new HttpError(400, 'Unknown Poké Center')
  const dx = p.pos.x / TILE - (c.x + 0.5), dy = p.pos.y / TILE - (c.y + 0.5)
  if (Math.hypot(dx, dy) > 4) throw new HttpError(400, 'You are not at that Poké Center')
  return c
}

export function healAtCenter(p, centerId) {
  if (p.battle) throw new HttpError(400, 'Not during a battle')
  nearCenter(p, centerId)
  p.lastCenter = centerId
  let fainted = 0
  for (const m of p.team) {
    if (m.hp > 0) m.hp = calcStats(m).hp
    else fainted++
  }
  return fainted
}

export function visitCenter(p, centerId) {
  nearCenter(p, centerId)
  p.lastCenter = centerId
}

export function buy(p, itemKey, qty) {
  const item = ITEMS[itemKey]
  qty = Math.floor(Number(qty))
  if (!item) throw new HttpError(400, 'Unknown item')
  if (!(qty >= 1 && qty <= 99)) throw new HttpError(400, 'Bad quantity')
  const cost = item.price * qty
  if (p.money < cost) throw new HttpError(400, 'Not enough money')
  p.money -= cost
  p.bag[itemKey] = (p.bag[itemKey] ?? 0) + qty
}

export const speciesName = (id) => speciesById[id].name
