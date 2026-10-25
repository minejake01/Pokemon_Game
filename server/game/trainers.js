import { getWorld, zoneLevel, TILE } from '../../shared/world.js'
import { SPECIES, speciesById, rarity, STONES, ITEMS } from './data.js'
import { createMon } from './pokemon.js'
import { pickWeighted } from './encounters.js'
import { HttpError } from './errors.js'

export const REMATCH_COOLDOWN_MS = 5 * 60_000
export const FIRST_WIN_MONEY = [500, 750]
export const REMATCH_MONEY = [125, 250]
export const STONE_GIFT_CHANCE = 0.12 // per rematch win
export const TRAINER_XP_MULT = 1.5

// Each trainer class has a favourite set of types.
const CLASS_TYPES = {
  Youngster: ['normal', 'bug', 'flying'],
  Lass: ['normal', 'grass', 'bug'],
  'Bug Catcher': ['bug'],
  Picnicker: ['grass', 'normal'],
  Channeler: ['ghost', 'psychic', 'poison'],
  Skier: ['ice'],
  Boarder: ['ice', 'normal'],
  Hiker: ['rock', 'ground'],
  'Black Belt': ['fighting'],
  'Fire Breather': ['fire'],
  Burglar: ['fire', 'poison'],
  'Bird Keeper': ['flying'],
  Fisherman: ['water'],
  Swimmer: ['water'],
}

const randInt = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1))

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function findTrainer(p, trainerId) {
  const t = getWorld(p.seed).trainers.find((x) => x.id === trainerId)
  if (!t) throw new HttpError(400, 'Unknown trainer')
  const dx = p.pos.x / TILE - (t.x + 0.5), dy = p.pos.y / TILE - (t.y + 0.5)
  if (Math.hypot(dx, dy) > 3) throw new HttpError(400, `You are too far away from ${t.name}`)
  return t
}

const record = (p, t) => p.trainers[t.id] ?? { wins: 0, lastWinAt: 0 }

export function trainerStatus(p, t) {
  const r = record(p, t)
  const cooldownMs = r.wins ? Math.max(0, r.lastWinAt + REMATCH_COOLDOWN_MS - Date.now()) : 0
  return {
    id: t.id, name: t.name, cls: t.cls, wins: r.wins, rematch: r.wins > 0, cooldownMs,
    teamSize: teamSize(baseLevel(t)), level: baseLevel(t) + rematchBonus(r.wins),
  }
}

const baseLevel = (t) => Math.max(3, zoneLevel(t.x, t.y))
const rematchBonus = (wins) => 3 * Math.min(wins, 5) // rematches get a little tougher, up to +15
const teamSize = (lvl) => (lvl < 10 ? 2 : lvl < 25 ? 3 : 4)

// The same trainer always uses the same species (seeded by world + trainer id); levels rise with rematches.
export function buildTeam(p, t) {
  const wins = record(p, t).wins
  const lvl = Math.min(65, baseLevel(t) + rematchBonus(wins))
  const rand = mulberry32(p.seed ^ (Number(t.id.slice(1)) * 2654435761))
  const types = CLASS_TYPES[t.cls] ?? ['normal']
  const pool = SPECIES
    .filter((sp) => !sp.legendary && sp.minLevel <= baseLevel(t) && sp.types.some((ty) => types.includes(ty)))
    .map((sp) => ({ id: sp.id, w: rarity(sp) }))
  const n = teamSize(baseLevel(t))
  return Array.from({ length: n }, (_, i) => {
    const ace = lvl >= 15 ? 2 : 1 // the last one is the ace
    const level = Math.max(2, i === n - 1 ? lvl + ace : lvl - 1 + Math.floor(rand() * 2))
    let id = pickWeighted(pool, rand)
    for (let evo; (evo = speciesById[id].evolvesTo.find((e) => level >= e.level)); ) id = evo.to
    return createMon(id, level)
  })
}

export function assertCanBattle(p, t) {
  const s = trainerStatus(p, t)
  if (s.cooldownMs > 0) throw new HttpError(400, `${t.name} is still resting. Come back for a rematch later.`)
  return s
}

// Called by the battle engine when the player beats a trainer. Returns the reward events.
export function rewardWin(p, trainerId, trainerName) {
  const r = (p.trainers[trainerId] ??= { wins: 0, lastWinAt: 0 })
  const rematch = r.wins > 0
  const money = randInt(rematch ? REMATCH_MONEY : FIRST_WIN_MONEY)
  r.wins++
  r.lastWinAt = Date.now()
  p.stats.trainerWins = (p.stats.trainerWins ?? 0) + 1
  p.money += money
  const events = [
    { t: 'money', amount: money, total: p.money },
    { t: 'text', text: `You defeated ${trainerName}! You got ₽${money} for winning!` },
  ]
  if (rematch && Math.random() < STONE_GIFT_CHANCE) {
    const stone = STONES[Math.floor(Math.random() * STONES.length)]
    p.bag[stone] = (p.bag[stone] ?? 0) + 1
    events.push({ t: 'gift', item: stone }, { t: 'text', text: `${trainerName} gave you a ${ITEMS[stone].name} as thanks for the rematch!` })
  }
  events.push({ t: 'text', text: `${trainerName}: "Great battle! Come back for a rematch later."` })
  return events
}
