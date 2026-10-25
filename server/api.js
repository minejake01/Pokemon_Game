import { randomUUID } from 'node:crypto'
import { getWorld, isWalkable, spawnBiome, zoneLevel, distFromTown, TILE, MAP_W, MAP_H } from '../shared/world.js'
import { SPECIES, speciesById, spriteUrl, bst, rarityTier, STONE_EVOS, ITEMS } from './game/data.js'
import { createMon, viewMon } from './game/pokemon.js'
import { rollSpecies, rollLevel, habitats } from './game/encounters.js'
import { startBattle, startTrainerBattle, act, battleView, useMedicine } from './game/battle.js'
import { findTrainer, trainerStatus, assertCanBattle, buildTeam } from './game/trainers.js'
import { HttpError } from './game/errors.js'
import {
  loadPlayer, savePlayer, newPlayer, viewState, moveMon, reorderTeam, healAtCenter, visitCenter, buy, applyUpgrade, useStone,
} from './game/player.js'

const MAX_SPAWNS = 24
const lastSeen = new Map()

const DEX = (() => {
  const hab = habitats()
  // How each species evolves, by level or by stone.
  const evolutions = {}
  for (const s of SPECIES) for (const e of s.evolvesTo) (evolutions[s.id] ??= []).push({ to: e.to, name: speciesById[e.to].name, level: e.level })
  for (const [stone, map] of Object.entries(STONE_EVOS)) {
    for (const [from, to] of Object.entries(map)) (evolutions[from] ??= []).push({ to, name: speciesById[to].name, item: ITEMS[stone].name })
  }
  return SPECIES.map((s) => ({
    id: s.id, name: s.name, types: s.types, sprite: spriteUrl(s.id), shinySprite: spriteUrl(s.id, true),
    habitats: hab[s.id] ?? [], legendary: s.legendary, base: s.base, bst: bst(s), rarity: rarityTier(s),
    evolutions: evolutions[s.id] ?? [],
  }))
})()

async function readBody(req) {
  if (req.method !== 'POST') return {}
  let data = ''
  for await (const chunk of req) {
    data += chunk
    if (data.length > 1e5) throw new HttpError(413, 'Body too large')
  }
  if (!data) return {}
  try {
    return JSON.parse(data)
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

function requirePlayer(req, { allowGameOver = false } = {}) {
  const p = loadPlayer(req.headers['x-player-id'])
  if (!p) throw new HttpError(404, 'No save found')
  if (p.gameOver && !allowGameOver) throw new HttpError(409, 'Game over')
  // Track play time from request activity (gaps over a minute count as idle).
  const now = Date.now(), prev = lastSeen.get(p.id)
  if (prev && now - prev < 60_000) p.stats.playMs += now - prev
  lastSeen.set(p.id, now)
  return p
}

const routes = {
  'POST /new': (req, body) => {
    const p = newPlayer(body.name, body.starter)
    return { playerId: p.id, state: viewState(p) }
  },

  'GET /state': (req) => {
    const p = requirePlayer(req, { allowGameOver: true })
    return { state: viewState(p), battle: battleView(p) }
  },

  'GET /dex': () => ({ species: DEX }),

  'POST /position': (req, body, p) => {
    const x = Number(body.x), y = Number(body.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new HttpError(400, 'Bad position')
    if (p.battle) return { ok: true }
    p.pos = { x: Math.max(0, Math.min(MAP_W * TILE, x)), y: Math.max(0, Math.min(MAP_H * TILE, y)) }
    return { ok: true, save: true }
  },

  'POST /spawn': (req, body, p) => {
    const tx = Math.floor(body.tx), ty = Math.floor(body.ty)
    const world = getWorld(p.seed)
    const ptx = p.pos.x / TILE, pty = p.pos.y / TILE
    if (!isWalkable(world, tx, ty)) return { spawn: null }
    if (Math.hypot(tx - ptx, ty - pty) > 30) return { spawn: null }
    if (distFromTown(tx, ty) < 8) return { spawn: null }
    const biome = spawnBiome(world, tx, ty)
    const zl = zoneLevel(tx, ty)
    const speciesId = rollSpecies(biome, zl)
    const mon = createMon(speciesId, rollLevel(zl))
    const sp = SPECIES[speciesId - 1]
    const id = randomUUID()
    const ids = Object.keys(p.spawns)
    if (ids.length >= MAX_SPAWNS) delete p.spawns[ids[0]]
    p.spawns[id] = { id, mon, biome, tx, ty }
    return {
      spawn: {
        id, speciesId, name: sp.name, level: mon.level, sprite: spriteUrl(speciesId, mon.shiny), shiny: mon.shiny,
        aquatic: biome === 'water', tx, ty, aggressive: Math.random() < 0.4,
      },
    }
  },

  'POST /despawn': (req, body, p) => {
    for (const id of [].concat(body.ids ?? [])) delete p.spawns[id]
    return { ok: true }
  },

  'POST /battle/start': (req, body, p) => {
    if (p.battle) return { events: [{ t: 'text', text: 'The battle continues!' }], battle: battleView(p), state: viewState(p) }
    const spawn = p.spawns[body.spawnId]
    if (!spawn) throw new HttpError(400, 'That Pokémon is gone')
    const sx = (spawn.tx + 0.5) * TILE, sy = (spawn.ty + 0.5) * TILE
    if (Math.hypot(p.pos.x - sx, p.pos.y - sy) > 40 * TILE) throw new HttpError(400, 'Too far away')
    delete p.spawns[body.spawnId]
    const events = startBattle(p, spawn)
    return { events, battle: battleView(p), state: viewState(p), save: true }
  },

  'POST /battle/action': (req, body, p) => {
    const events = act(p, body)
    return { events, battle: battleView(p), state: viewState(p), save: true }
  },

  'POST /item/use': (req, body, p) => {
    if (p.battle) throw new HttpError(400, 'Use items from the battle menu')
    let events = []
    if (ITEMS[body.item]?.kind === 'stone') events = useStone(p, body.item, body.uid)
    else useMedicine(p, body.item, body.uid, events)
    return { events, state: viewState(p), save: true }
  },

  // Level-up upgrade card pick: {uid, choice: damage|speed|walk}. Allowed mid-battle.
  'POST /upgrade': (req, body, p) => {
    const mon = applyUpgrade(p, body.uid, body.choice)
    return { state: viewState(p), mon: mon ? viewMon(mon) : null, save: true }
  },

  'POST /trainer/talk': (req, body, p) => {
    const t = findTrainer(p, body.trainerId)
    return { trainer: trainerStatus(p, t) }
  },

  'POST /trainer/battle': (req, body, p) => {
    if (p.battle) throw new HttpError(400, 'You are already in a battle')
    const t = findTrainer(p, body.trainerId)
    assertCanBattle(p, t)
    const biome = spawnBiome(getWorld(p.seed), t.x, t.y)
    const events = startTrainerBattle(p, t, buildTeam(p, t), biome)
    return { events, battle: battleView(p), state: viewState(p), save: true }
  },

  'POST /team/move': (req, body, p) => {
    moveMon(p, body.uid, body.to)
    return { state: viewState(p), save: true }
  },

  'POST /team/order': (req, body, p) => {
    reorderTeam(p, body.uids)
    return { state: viewState(p), save: true }
  },

  'POST /center/visit': (req, body, p) => {
    visitCenter(p, body.centerId)
    return { state: viewState(p), save: true }
  },

  'POST /center/heal': (req, body, p) => {
    const fainted = healAtCenter(p, body.centerId)
    return { state: viewState(p), fainted, save: true }
  },

  'POST /mart/buy': (req, body, p) => {
    buy(p, body.item, body.qty)
    return { state: viewState(p), save: true }
  },
}

const PUBLIC = new Set(['POST /new', 'GET /state', 'GET /dex'])

// Node-style (req, res, next) middleware for paths under /api.
export async function handleApi(req, res, next) {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/api/')) return next?.()
  const key = `${req.method} ${url.pathname.slice(4)}`
  const route = routes[key]
  const send = (status, obj) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(obj))
  }
  if (!route) return send(404, { error: 'Not found' })
  try {
    const body = await readBody(req)
    const player = PUBLIC.has(key) ? null : requirePlayer(req)
    const out = await route(req, body, player)
    if (out.save && player) savePlayer(player)
    delete out.save
    send(200, out)
  } catch (err) {
    if (err instanceof HttpError) return send(err.status, { error: err.message })
    console.error(err)
    send(500, { error: 'Server error' })
  }
}
