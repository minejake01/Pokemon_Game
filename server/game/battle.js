import { speciesById, MOVES, ITEMS, movesFor, effectiveness } from './data.js'
import { calcStats, battleStats, viewMon, setForm, xpForLevel } from './pokemon.js'
import { clampRatio } from '../../shared/balance.js'
import { HttpError } from './errors.js'
import { markCaught, markSeen, addToCollection, respawnAtCenter } from './player.js'
import { rewardWin, TRAINER_XP_MULT } from './trainers.js'

const pct = (p) => Math.random() < p

function newBattle(player, fields) {
  const lead = player.team.find((m) => m.hp > 0)
  if (!lead) throw new HttpError(400, 'No conscious Pokémon')
  player.battle = { activeUid: lead.uid, runAttempts: 0, needSwitch: false, turn: 0, ...fields }
  player.stats.battles++
  markSeen(player, fields.wild.speciesId)
  return lead
}

const shinyText = (mon) => (mon.shiny ? [{ t: 'text', text: '✨ Whoa! It\'s a shiny Pokémon! ✨' }] : [])

export function startBattle(player, spawn) {
  const lead = newBattle(player, { kind: 'wild', wild: spawn.mon, biome: spawn.biome })
  return [
    { t: 'text', text: `A wild ${speciesById[spawn.mon.speciesId].name} appeared!` },
    ...shinyText(spawn.mon),
    { t: 'text', text: `Go, ${speciesById[lead.speciesId].name}!` },
  ]
}

// team[0] goes out first; the rest wait in foeQueue.
export function startTrainerBattle(player, trainer, team, biome) {
  const [first, ...rest] = team
  const lead = newBattle(player, {
    kind: 'trainer', wild: first, foeQueue: rest, foeTotal: team.length,
    trainerId: trainer.id, trainerName: trainer.name, trainerCls: trainer.cls, biome,
  })
  return [
    { t: 'text', text: `${trainer.name} wants to battle!` },
    { t: 'text', text: `${trainer.name} sent out ${speciesById[first.speciesId].name}!` },
    ...shinyText(first),
    { t: 'text', text: `Go, ${speciesById[lead.speciesId].name}!` },
  ]
}

export function battleView(player) {
  const b = player.battle
  if (!b) return null
  return {
    kind: b.kind,
    wild: viewMon(b.wild),
    activeUid: b.activeUid,
    biome: b.biome,
    needSwitch: b.needSwitch,
    trainer: b.kind === 'trainer' ? { name: b.trainerName, cls: b.trainerCls, total: b.foeTotal, left: b.foeQueue.length + (b.wild.hp > 0 ? 1 : 0) } : null,
  }
}

const active = (player) => player.team.find((m) => m.uid === player.battle.activeUid)
const nameOf = (mon) => speciesById[mon.speciesId].name

// Damage uses "game numbers": attack ÷ defense is clamped and upgrade-card power is capped (shared/balance.js).
function rawDamage(attacker, defender, move) {
  const a = battleStats(attacker), d = battleStats(defender)
  const [A, D] = move.category === 'special' ? [a.spa, d.spd] : [a.atk, d.def]
  const stab = speciesById[attacker.speciesId].types.includes(move.type) ? 1.5 : 1
  return ((((2 * attacker.level) / 5 + 2) * move.power * clampRatio(A / D)) / 50 + 2) * stab * a.power
}

function damageFor(attacker, defender, move) {
  const eff = effectiveness(move.type, speciesById[defender.speciesId].types)
  if (move.effect?.fixed) {
    if (eff === 0) return { dmg: 0, eff, crit: false }
    return { dmg: move.effect.fixed === 'level' ? attacker.level : move.effect.fixed, eff: 1, crit: false }
  }
  const crit = pct(1 / 16)
  const dmg = Math.floor(rawDamage(attacker, defender, move) * eff * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.15))
  return { dmg: eff === 0 ? 0 : Math.max(1, dmg), eff, crit }
}

// Expected damage (no randomness) used by the foe AI.
function expected(attacker, defender, move) {
  const eff = effectiveness(move.type, speciesById[defender.speciesId].types)
  if (move.effect?.fixed) return eff === 0 ? 0 : move.effect.fixed === 'level' ? attacker.level : move.effect.fixed
  return rawDamage(attacker, defender, move) * eff * (move.acc / 100) * (move.effect?.hits ?? 1)
}

function sideOf(player, mon) {
  return mon === player.battle.wild ? 'wild' : 'player'
}

function foeLabel(player, mon) {
  const b = player.battle
  return b.kind === 'trainer' ? `${b.trainerName}'s ${nameOf(mon)}` : `The wild ${nameOf(mon)}`
}

function useMove(player, attacker, defender, move, events) {
  const atkSide = sideOf(player, attacker), defSide = sideOf(player, defender)
  const who = atkSide === 'wild' ? foeLabel(player, attacker) : nameOf(attacker)
  events.push({ t: 'text', text: `${who} used ${move.name}!` })
  events.push({ t: 'attack', side: atkSide, moveType: move.type })
  if (!pct(move.acc / 100)) {
    events.push({ t: 'text', text: `${who}'s attack missed!` })
    return
  }
  const hits = move.effect?.hits ?? 1
  let total = 0, eff = 1, landed = 0
  for (let h = 0; h < hits && defender.hp > 0; h++) {
    const r = damageFor(attacker, defender, move)
    eff = r.eff
    if (r.eff === 0) break
    const dmg = Math.min(defender.hp, r.dmg)
    defender.hp -= dmg
    total += dmg
    landed++
    events.push({ t: 'damage', side: defSide, hp: defender.hp, maxHp: calcStats(defender).hp, eff: r.eff, crit: r.crit })
    if (r.crit) events.push({ t: 'text', text: 'A critical hit!' })
  }
  if (eff === 0) events.push({ t: 'text', text: `It doesn't affect ${nameOf(defender)}…` })
  else if (!move.effect?.fixed && eff > 1) events.push({ t: 'text', text: "It's super effective!" })
  else if (!move.effect?.fixed && eff < 1) events.push({ t: 'text', text: "It's not very effective…" })
  if (hits > 1 && landed) events.push({ t: 'text', text: `Hit ${landed} time(s)!` })
  if (move.effect?.drain && total > 0 && attacker.hp > 0) {
    const max = calcStats(attacker).hp
    const heal = Math.min(max - attacker.hp, Math.max(1, Math.floor(total * move.effect.drain)))
    if (heal > 0) {
      attacker.hp += heal
      events.push({ t: 'heal', side: atkSide, hp: attacker.hp, maxHp: max })
      events.push({ t: 'text', text: `${nameOf(defender)} had its energy drained!` })
    }
  }
}

function wildMove(player) {
  const b = player.battle
  const target = active(player)
  const moves = movesFor(b.wild.speciesId, b.wild.level).map((n) => MOVES[n])
  const weights = moves.map((m) => Math.max(1, expected(b.wild, target, m)) ** 1.5)
  let r = Math.random() * weights.reduce((s, w) => s + w, 0)
  for (let i = 0; i < moves.length; i++) if ((r -= weights[i]) <= 0) return moves[i]
  return moves[0]
}

function wildTurn(player, events) {
  const b = player.battle
  if (!b) return
  const me = active(player)
  if (b.wild.hp <= 0 || me.hp <= 0) return
  useMove(player, b.wild, me, wildMove(player), events)
  afterHits(player, events)
}

// Handles fainting on either side after any damage.
function afterHits(player, events) {
  const b = player.battle
  if (!b || b.ended) return
  const me = active(player)
  if (b.wild.hp <= 0) {
    events.push({ t: 'faint', side: 'wild' })
    events.push({ t: 'text', text: `${foeLabel(player, b.wild)} fainted!` })
    if (me.hp > 0) gainXp(player, me, events)
    if (b.kind === 'trainer') {
      if (b.foeQueue.length) {
        b.wild = b.foeQueue.shift()
        markSeen(player, b.wild.speciesId)
        events.push({ t: 'foeSwitch', mon: viewMon(b.wild), left: b.foeQueue.length + 1, total: b.foeTotal })
        events.push({ t: 'text', text: `${b.trainerName} sent out ${nameOf(b.wild)}!` }, ...shinyText(b.wild))
        return
      }
      events.push(...rewardWin(player, b.trainerId, b.trainerName))
      endBattle(player, 'trainerWin', events)
      return
    }
    player.stats.wins = (player.stats.wins ?? 0) + 1
    const money = b.wild.level * 20
    player.money += money
    events.push({ t: 'money', amount: money, total: player.money })
    events.push({ t: 'text', text: `You got ₽${money} for winning!` })
    endBattle(player, 'win', events)
    return
  }
  if (me.hp <= 0) {
    events.push({ t: 'faint', side: 'player' })
    events.push({ t: 'text', text: `${nameOf(me)} fainted!` })
    if (player.team.some((m) => m.hp > 0)) {
      b.needSwitch = true
      events.push({ t: 'needSwitch' })
    } else {
      blackout(player, events)
    }
  }
}

function blackout(player, events) {
  const b = player.battle
  events.push({ t: 'text', text: 'All of your Pokémon have fainted!' })
  if (b.kind === 'trainer') events.push({ t: 'text', text: `You lost to ${b.trainerName}…` })
  if ((player.bag.revive ?? 0) > 0) {
    player.bag.revive--
    const lead = player.team[0]
    lead.hp = Math.max(1, Math.floor(calcStats(lead).hp / 2))
    const c = respawnAtCenter(player)
    events.push({ t: 'text', text: `You used a Revive on ${nameOf(lead)}. (${player.bag.revive} left)` })
    events.push({ t: 'text', text: 'You hurried back to the Poké Center…' })
    endBattle(player, 'blackout', events, { respawn: c })
  } else {
    player.gameOver = true
    events.push({ t: 'text', text: 'You have no Revives left…' })
    endBattle(player, 'gameover', events)
  }
}

function endBattle(player, outcome, events, extra = {}) {
  player.battle.ended = true
  player.battle = null
  events.push({ t: 'end', outcome, ...extra })
}

function gainXp(player, mon, events) {
  const b = player.battle
  const wild = b.wild
  const mult = b.kind === 'trainer' ? TRAINER_XP_MULT : 1
  const xp = Math.max(1, Math.floor(((speciesById[wild.speciesId].baseExp * wild.level) / 7) * mult))
  mon.xp += xp
  events.push({ t: 'text', text: `${nameOf(mon)} gained ${xp} XP!` })
  const oldMoves = movesFor(mon.speciesId, mon.level)
  while (mon.level < 100 && mon.xp >= xpForLevel(mon.level + 1)) {
    setForm(mon, { level: mon.level + 1 })
    player.pendingUpgrades.push(mon.uid) // XP bar filled: the client pauses and shows 3 upgrade cards
    events.push({ t: 'levelup', mon: viewMon(mon) })
    events.push({ t: 'text', text: `${nameOf(mon)} grew to level ${mon.level}!` })
  }
  events.push({ t: 'xp', mon: viewMon(mon) })
  // Evolution
  const evo = speciesById[mon.speciesId].evolvesTo.find((e) => mon.level >= e.level)
  if (evo) {
    const from = nameOf(mon)
    events.push({ t: 'text', text: `What? ${from} is evolving!` })
    setForm(mon, { speciesId: evo.to })
    markCaught(player, evo.to, mon.shiny)
    events.push({ t: 'evolve', fromId: speciesById[evo.to].evolvesFrom, mon: viewMon(mon) })
    events.push({ t: 'text', text: `Congratulations! ${from} evolved into ${nameOf(mon)}!` })
  }
  const newMoves = movesFor(mon.speciesId, mon.level).filter((n) => !oldMoves.includes(n))
  for (const n of newMoves) events.push({ t: 'text', text: `${nameOf(mon)} learned ${n}!` })
}

function tryCatch(player, itemKey, events) {
  const b = player.battle
  const item = ITEMS[itemKey]
  const wild = b.wild
  const sp = speciesById[wild.speciesId]
  const max = calcStats(wild).hp
  const a = Math.min(255, ((3 * max - 2 * wild.hp) * sp.catchRate * item.ball) / (3 * max))
  const p = a / 255
  const shakeP = p ** 0.25
  let shakes = 0
  while (shakes < 4 && pct(shakeP)) shakes++
  const caught = shakes === 4
  events.push({ t: 'text', text: `You threw a ${item.name}!` })
  events.push({ t: 'ball', item: itemKey, shakes: Math.min(3, shakes), caught })
  if (caught) {
    events.push({ t: 'text', text: `Gotcha! ${wild.shiny ? '✨ Shiny ' : ''}${sp.name} was caught!` })
    const firstTime = !player.dex.caught.includes(wild.speciesId)
    markCaught(player, wild.speciesId, wild.shiny)
    player.stats.catches++
    const where = addToCollection(player, wild)
    if (firstTime) events.push({ t: 'text', text: `${sp.name}'s data was added to the Pokédex. (${player.dex.caught.length}/151)` })
    events.push({ t: 'text', text: where === 'team' ? `${sp.name} joined your team!` : `Your team is full. ${sp.name} was sent to the Box.` })
    endBattle(player, 'caught', events, { speciesId: wild.speciesId })
    return true
  }
  events.push({ t: 'text', text: ['Oh no! It broke free!', 'Aww! It appeared to be caught!', 'Argh! Almost had it!', 'Shoot! It was so close, too!'][Math.min(3, shakes)] })
  return false
}

export function act(player, action) {
  const b = player.battle
  if (!b) throw new HttpError(400, 'Not in a battle')
  const events = []
  const me = active(player)

  if (b.needSwitch) {
    if (action.type !== 'switch') throw new HttpError(400, 'You must choose a Pokémon to send out')
    const next = player.team.find((m) => m.uid === action.uid && m.hp > 0)
    if (!next) throw new HttpError(400, 'That Pokémon cannot battle')
    b.activeUid = next.uid
    b.needSwitch = false
    events.push({ t: 'switch', mon: viewMon(next) })
    events.push({ t: 'text', text: `Go, ${nameOf(next)}!` })
    return events
  }

  b.turn++
  switch (action.type) {
    case 'move': {
      const names = movesFor(me.speciesId, me.level)
      const move = MOVES[names[action.index]]
      if (!move) throw new HttpError(400, 'Unknown move')
      const wm = wildMove(player)
      const mySpe = battleStats(me).spe, wildSpe = battleStats(b.wild).spe
      const myPri = move.effect?.priority ?? 0, wildPri = wm.effect?.priority ?? 0
      const iFirst = myPri !== wildPri ? myPri > wildPri : mySpe !== wildSpe ? mySpe > wildSpe : pct(0.5)
      const order = iFirst ? [[me, b.wild, move], [b.wild, me, wm]] : [[b.wild, me, wm], [me, b.wild, move]]
      for (const [att, def, mv] of order) {
        if (!player.battle || att.hp <= 0 || def.hp <= 0) break
        useMove(player, att, def, mv, events)
        afterHits(player, events)
      }
      break
    }
    case 'ball': {
      const item = ITEMS[action.item]
      if (!item || item.kind !== 'ball') throw new HttpError(400, 'Not a ball')
      if (b.kind === 'trainer') throw new HttpError(400, "You can't catch another trainer's Pokémon!")
      if (!(player.bag[action.item] > 0)) throw new HttpError(400, `No ${item.name}s left`)
      player.bag[action.item]--
      if (!tryCatch(player, action.item, events)) wildTurn(player, events)
      break
    }
    case 'item': {
      useMedicine(player, action.item, action.uid, events)
      wildTurn(player, events)
      break
    }
    case 'switch': {
      const next = player.team.find((m) => m.uid === action.uid && m.hp > 0)
      if (!next) throw new HttpError(400, 'That Pokémon cannot battle')
      if (next.uid === me.uid) throw new HttpError(400, `${nameOf(me)} is already out`)
      events.push({ t: 'text', text: `${nameOf(me)}, come back!` })
      b.activeUid = next.uid
      events.push({ t: 'switch', mon: viewMon(next) })
      events.push({ t: 'text', text: `Go, ${nameOf(next)}!` })
      wildTurn(player, events)
      break
    }
    case 'run': {
      if (b.kind === 'trainer') throw new HttpError(400, "No! There's no running from a trainer battle!")
      const mySpe = battleStats(me).spe, wildSpe = battleStats(b.wild).spe
      const ok = mySpe >= wildSpe || pct(0.5 + 0.15 * b.runAttempts)
      b.runAttempts++
      if (ok) {
        events.push({ t: 'text', text: 'Got away safely!' })
        endBattle(player, 'run', events)
      } else {
        events.push({ t: 'text', text: "Can't escape!" })
        wildTurn(player, events)
      }
      break
    }
    default:
      throw new HttpError(400, 'Unknown action')
  }
  return events
}

// Shared by battle (costs a turn) and the Backpack (free).
export function useMedicine(player, itemKey, uid, events) {
  const item = ITEMS[itemKey]
  if (!item || (item.kind !== 'heal' && item.kind !== 'revive')) throw new HttpError(400, 'Cannot use that here')
  if (!(player.bag[itemKey] > 0)) throw new HttpError(400, `No ${item.name}s left`)
  const mon = player.team.find((m) => m.uid === uid)
  if (!mon) throw new HttpError(400, 'Choose a team member')
  const max = calcStats(mon).hp
  if (item.kind === 'heal') {
    if (mon.hp <= 0) throw new HttpError(400, `${nameOf(mon)} has fainted. Use a Revive.`)
    if (mon.hp >= max) throw new HttpError(400, `${nameOf(mon)} is already at full HP`)
    const healed = Math.min(item.heal, max - mon.hp)
    mon.hp += healed
    events.push({ t: 'text', text: `${nameOf(mon)} recovered ${healed} HP!` })
  } else {
    if (mon.hp > 0) throw new HttpError(400, `${nameOf(mon)} hasn't fainted`)
    mon.hp = Math.max(1, Math.floor(max / 2))
    events.push({ t: 'text', text: `${nameOf(mon)} was revived!` })
  }
  player.bag[itemKey]--
  if (player.battle && mon.uid === player.battle.activeUid) {
    events.push({ t: 'heal', side: 'player', hp: mon.hp, maxHp: max })
  }
  events.push({ t: 'teamUpdate' })
}
