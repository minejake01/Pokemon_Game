import { speciesById, movesFor, MOVES, spriteUrl, backSpriteUrl } from './data.js'
import { randomUUID } from 'node:crypto'

export const xpForLevel = (level) => level ** 3

export function calcStats(mon) {
  const sp = speciesById[mon.speciesId]
  const L = mon.level
  const s = (k) => Math.floor(((2 * sp.base[k] + mon.ivs[k]) * L) / 100) + 5
  return {
    hp: Math.floor(((2 * sp.base.hp + mon.ivs.hp) * L) / 100) + L + 10,
    atk: s('atk'), def: s('def'), spa: s('spa'), spd: s('spd'), spe: s('spe'),
  }
}

const rollIv = () => Math.floor(Math.random() * 32)

export function createMon(speciesId, level) {
  const mon = {
    uid: randomUUID(),
    speciesId,
    level,
    xp: xpForLevel(level),
    ivs: { hp: rollIv(), atk: rollIv(), def: rollIv(), spa: rollIv(), spd: rollIv(), spe: rollIv() },
    hp: 0,
  }
  mon.hp = calcStats(mon).hp
  return mon
}

// Public view sent to the client (computed by the server; client never sends stats back).
export function viewMon(mon) {
  const sp = speciesById[mon.speciesId]
  const stats = calcStats(mon)
  return {
    uid: mon.uid,
    speciesId: mon.speciesId,
    name: sp.name,
    types: sp.types,
    level: mon.level,
    hp: mon.hp,
    maxHp: stats.hp,
    stats,
    xp: mon.xp,
    xpLevelStart: xpForLevel(mon.level),
    xpNext: mon.level >= 100 ? null : xpForLevel(mon.level + 1),
    moves: movesFor(mon.speciesId, mon.level).map((n) => {
      const m = MOVES[n]
      return { name: m.name, type: m.type, power: m.power, acc: m.acc, category: m.category, effect: m.effect }
    }),
    sprite: spriteUrl(mon.speciesId),
    backSprite: backSpriteUrl(mon.speciesId),
  }
}

// Changes species/level; like the main games, current HP grows by the max-HP gained.
export function setForm(mon, { speciesId = mon.speciesId, level = mon.level }) {
  const before = calcStats(mon).hp
  mon.speciesId = speciesId
  mon.level = level
  const after = calcStats(mon).hp
  if (mon.hp > 0) mon.hp = Math.max(1, Math.min(after, mon.hp + Math.max(0, after - before)))
}
