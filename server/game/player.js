import { randomUUID } from 'node:crypto'
import { getWorld, isGoodSeed, TOWN, TILE } from '../../shared/world.js'
import { speciesById, STARTERS, STARTING_BAG, STARTING_MONEY, TEAM_MAX, ITEMS, STONE_EVOS } from './data.js'
import { createMon, viewMon, calcStats, setForm } from './pokemon.js'
import { HttpError } from './errors.js'
import { UPGRADES, upgradeBonus } from '../../shared/balance.js'
import { readSave, writeSave, CACHEABLE } from './store.js'

export const FREE_HEAL_COOLDOWN_MS = 3 * 60_000

const players = new Map() // in-memory cache, only used when the store allows it
const VALID_ID = /^[0-9a-f-]{36}$/

export async function loadPlayer(id) {
  if (!id || !VALID_ID.test(id)) return null
  if (CACHEABLE && players.has(id)) return players.get(id)
  const data = await readSave(id)
  if (!data) return null
  const p = migrate(data)
  if (CACHEABLE) players.set(id, p)
  return p
}

export async function savePlayer(p) {
  await writeSave(p.id, p)
}

// Fills in fields added after a save was created.
function migrate(p) {
  p.trainers ??= {}
  p.upgrades ??= { walk: 0 }
  p.pendingUpgrades ??= []
  p.lastFreeHealAt ??= 0
  p.dex.shiny ??= []
  p.stats.wins ??= 0
  p.stats.trainerWins ??= 0
  for (const m of [...p.team, ...p.box]) {
    m.shiny ??= false
    m.boosts ??= { damage: 0, speed: 0 }
  }
  if (p.battle) p.battle.kind ??= 'wild'
  return p
}

function pickSeed() {
  for (;;) {
    const seed = Math.floor(Math.random() * 1e9)
    if (isGoodSeed(seed)) return seed
  }
}

export async function newPlayer(name, starter) {
  name = String(name ?? '').trim().slice(0, 12)
  if (!name) throw new HttpError(400, 'Enter a trainer name')
  starter = Number(starter)
  if (!STARTERS.includes(starter)) throw new HttpError(400, 'Pick Poliwag, Bellsprout or Growlithe')
  const seed = pickSeed()
  const first = createMon(starter, 5)
  const p = {
    id: randomUUID(),
    name,
    seed,
    createdAt: Date.now(),
    team: [first],
    box: [],
    bag: { ...STARTING_BAG },
    money: STARTING_MONEY,
    dex: { seen: [starter], caught: [starter], shiny: first.shiny ? [starter] : [] },
    pos: { x: (TOWN.x + 0.5) * TILE, y: (TOWN.y + 1.5) * TILE },
    lastCenter: 'c0',
    spawns: {},
    battle: null,
    gameOver: false,
    won: false,
    stats: { battles: 0, catches: 0, playMs: 0, wins: 0, trainerWins: 0 },
    trainers: {}, // trainerId -> { wins, lastWinAt }
    upgrades: { walk: 0 }, // player-wide upgrade stacks
    pendingUpgrades: [], // one uid per level-up still waiting for an upgrade card pick
    lastFreeHealAt: 0,
  }
  if (CACHEABLE) players.set(p.id, p)
  await savePlayer(p)
  return p
}

export function markSeen(p, id) {
  if (!p.dex.seen.includes(id)) p.dex.seen.push(id)
}

export function markCaught(p, id, shiny = false) {
  markSeen(p, id)
  if (!p.dex.caught.includes(id)) p.dex.caught.push(id)
  if (shiny && !p.dex.shiny.includes(id)) p.dex.shiny.push(id)
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

// Score shown when the team hits 0 HP (and on Game Over).
export function scoreOf(p) {
  const shinies = [...p.team, ...p.box].filter((m) => m.shiny).length
  const parts = [
    ['Species caught', p.dex.caught.length, 100],
    ['Trainers defeated', p.stats.trainerWins ?? 0, 50],
    ['Wild Pokémon defeated', p.stats.wins ?? 0, 10],
    ['Pokémon caught', p.stats.catches, 5],
    ['Shiny Pokémon owned', shinies, 250],
  ].map(([label, count, each]) => ({ label, count, each, points: count * each }))
  return { total: parts.reduce((s, x) => s + x.points, 0), parts }
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
    score: scoreOf(p),
    healCooldownMs: Math.max(0, p.lastFreeHealAt + FREE_HEAL_COOLDOWN_MS - Date.now()),
    upgrades: { walk: p.upgrades.walk, walkBonus: upgradeBonus('walk', p.upgrades.walk) },
    pendingUpgrades: p.pendingUpgrades,
    trainers: Object.fromEntries(Object.entries(p.trainers).map(([id, r]) => [id, r.wins])),
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
  const wait = p.lastFreeHealAt + FREE_HEAL_COOLDOWN_MS - Date.now()
  if (wait > 0) {
    const sec = Math.ceil(wait / 1000)
    throw new HttpError(400, `Free healing is recharging. Try again in ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}.`)
  }
  p.lastFreeHealAt = Date.now()
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

// --- Level-up upgrade cards -----------------------------------------------------

const findMon = (p, uid) => p.team.find((m) => m.uid === uid) ?? p.box.find((m) => m.uid === uid)

export function applyUpgrade(p, uid, choice) {
  const i = p.pendingUpgrades.indexOf(uid)
  if (i < 0) throw new HttpError(400, 'No upgrade waiting for that Pokémon')
  if (!UPGRADES[choice]) throw new HttpError(400, 'Unknown upgrade')
  const mon = findMon(p, uid)
  p.pendingUpgrades.splice(i, 1)
  if (UPGRADES[choice].scope === 'player') p.upgrades.walk++
  else if (mon) mon.boosts[choice]++
  return mon
}

// --- Evolution stones ------------------------------------------------------------

export function useStone(p, itemKey, uid) {
  const item = ITEMS[itemKey]
  if (!item || item.kind !== 'stone') throw new HttpError(400, 'That is not an evolution stone')
  if (!(p.bag[itemKey] > 0)) throw new HttpError(400, `No ${item.name}s left`)
  const mon = findMon(p, uid)
  if (!mon) throw new HttpError(400, 'Choose one of your Pokémon')
  const to = STONE_EVOS[itemKey][mon.speciesId]
  const from = speciesById[mon.speciesId].name
  if (!to) throw new HttpError(400, `The ${item.name} has no effect on ${from}.`)
  p.bag[itemKey]--
  setForm(mon, { speciesId: to })
  markCaught(p, to, mon.shiny)
  return [{ t: 'evolve', mon: viewMon(mon) }, { t: 'text', text: `Congratulations! ${from} evolved into ${speciesById[to].name}!` }]
}

export const speciesName = (id) => speciesById[id].name
