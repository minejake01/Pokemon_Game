import { readFileSync } from 'node:fs'
import { effectiveness } from '../../shared/types.js'

export { effectiveness }

export const SPECIES = JSON.parse(readFileSync(new URL('../data/pokemon.json', import.meta.url), 'utf8'))
export const speciesById = Object.fromEntries(SPECIES.map((s) => [s.id, s]))

export const STARTERS = [1, 4, 7]
export const TEAM_MAX = 5

export const spriteUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`
export const backSpriteUrl = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${id}.png`

// Gen 1 physical/special split is by type.
export const SPECIAL_TYPES = new Set(['fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon'])

// Move pools per type: [name, learn level, power, accuracy, effect?]
// effect: { drain } | { fixed: number|'level' } | { priority } | { hits }
const POOLS = {
  normal: [
    ['Tackle', 1, 40, 100], ['Quick Attack', 8, 40, 100, { priority: 1 }], ['Headbutt', 18, 70, 100],
    ['Body Slam', 30, 85, 100], ['Hyper Beam', 48, 150, 90],
  ],
  fire: [['Ember', 1, 40, 100], ['Fire Punch', 18, 75, 100], ['Flamethrower', 30, 90, 100], ['Fire Blast', 45, 110, 85]],
  water: [['Water Gun', 1, 40, 100], ['Bubble Beam', 16, 65, 100], ['Surf', 30, 90, 100], ['Hydro Pump', 45, 110, 80]],
  grass: [['Vine Whip', 1, 45, 100], ['Mega Drain', 12, 40, 100, { drain: 0.5 }], ['Razor Leaf', 20, 55, 95], ['Giga Drain', 32, 75, 100, { drain: 0.5 }], ['Solar Beam', 45, 120, 100]],
  electric: [['Thunder Shock', 1, 40, 100], ['Thunder Punch', 18, 75, 100], ['Thunderbolt', 30, 90, 100], ['Thunder', 45, 110, 70]],
  ice: [['Powder Snow', 1, 40, 100], ['Aurora Beam', 16, 65, 100], ['Ice Beam', 30, 90, 100], ['Blizzard', 45, 110, 70]],
  fighting: [['Karate Chop', 1, 50, 100], ['Low Kick', 12, 60, 90], ['Seismic Toss', 20, 0, 100, { fixed: 'level' }], ['Submission', 30, 80, 80], ['High Jump Kick', 42, 130, 90]],
  poison: [['Poison Sting', 1, 30, 100], ['Acid', 10, 40, 100], ['Sludge', 24, 65, 100], ['Sludge Bomb', 38, 90, 100]],
  ground: [['Mud-Slap', 1, 30, 100], ['Bone Club', 14, 65, 85], ['Dig', 26, 80, 100], ['Earthquake', 40, 100, 100]],
  flying: [['Gust', 1, 40, 100], ['Peck', 6, 35, 100], ['Wing Attack', 16, 60, 100], ['Drill Peck', 30, 80, 100], ['Sky Attack', 46, 140, 90]],
  psychic: [['Confusion', 1, 50, 100], ['Psybeam', 16, 65, 100], ['Psychic', 32, 90, 100]],
  bug: [['Leech Life', 1, 30, 100, { drain: 0.5 }], ['Twineedle', 12, 25, 100, { hits: 2 }], ['Pin Missile', 22, 25, 95, { hits: 3 }], ['X-Scissor', 36, 80, 100]],
  rock: [['Rock Throw', 1, 50, 90], ['Rock Tomb', 16, 60, 95], ['Rock Slide', 28, 75, 90], ['Stone Edge', 44, 100, 80]],
  ghost: [['Lick', 1, 30, 100], ['Night Shade', 14, 0, 100, { fixed: 'level' }], ['Shadow Punch', 26, 60, 100], ['Shadow Ball', 38, 80, 100]],
  dragon: [['Twister', 1, 40, 100], ['Dragon Rage', 12, 0, 100, { fixed: 40 }], ['Dragon Breath', 26, 60, 100], ['Dragon Pulse', 40, 85, 100], ['Outrage', 52, 120, 100]],
}

export const MOVES = {}
for (const [type, list] of Object.entries(POOLS)) {
  for (const [name, level, power, acc, effect] of list) {
    MOVES[name] = { name, type, level, power, acc, effect: effect ?? null, category: SPECIAL_TYPES.has(type) ? 'special' : 'physical' }
  }
}

// Up to 4 moves: the two newest of the primary type, the newest of the secondary type,
// filled with the newest Normal moves (and more primary moves if needed).
export function movesFor(speciesId, level) {
  const sp = speciesById[speciesId]
  const learned = (type) => POOLS[type].filter((m) => m[1] <= level).map((m) => m[0]).reverse()
  const picked = []
  const add = (names, n) => {
    for (const name of names) {
      if (picked.length >= 4 || n <= 0) break
      if (!picked.includes(name)) { picked.push(name); n-- }
    }
  }
  const [t1, t2] = sp.types
  add(learned(t1), 2)
  if (t2) add(learned(t2), 1)
  if (t1 !== 'normal') add(learned('normal'), 1)
  add(learned(t1), 4)
  if (t2) add(learned(t2), 4)
  add(learned('normal'), 4)
  return picked
}

export const ITEMS = {
  pokeball: { name: 'Poké Ball', kind: 'ball', ball: 1, price: 200, desc: 'A basic ball for catching wild Pokémon. (1×)' },
  superball: { name: 'Super Ball', kind: 'ball', ball: 1.5, price: 600, desc: 'A better ball with a higher catch rate. (1.5×)' },
  ultraball: { name: 'Ultra Ball', kind: 'ball', ball: 2, price: 1200, desc: 'A high-performance ball. (2×)' },
  potion: { name: 'Potion', kind: 'heal', heal: 20, price: 300, desc: 'Restores 20 HP to a conscious Pokémon.' },
  superpotion: { name: 'Super Potion', kind: 'heal', heal: 60, price: 700, desc: 'Restores 60 HP to a conscious Pokémon.' },
  revive: { name: 'Revive', kind: 'revive', price: 1500, desc: 'Revives a fainted Pokémon to half HP. Your lifeline!' },
}

export const STARTING_BAG = { pokeball: 10, superball: 3, ultraball: 1, potion: 3, superpotion: 1, revive: 3 }
export const STARTING_MONEY = 3000

// Biome spawn affinity per type (see PRD §6.2).
export const BIOME_AFFINITY = {
  meadow: { normal: 3, flying: 2, electric: 1.5, bug: 1.5, grass: 1, fighting: 0.4 },
  forest: { grass: 3, bug: 3, poison: 1.5, psychic: 1, normal: 1, flying: 0.8 },
  swamp: { poison: 3, ghost: 2.5, water: 1, grass: 1, bug: 0.6 },
  snow: { ice: 4, water: 0.4, psychic: 0.6, normal: 0.3 },
  mountain: { rock: 3, ground: 2.5, fighting: 2.5, psychic: 1.2, electric: 1, dragon: 0.5, ghost: 0.4 },
  volcano: { fire: 4, rock: 1.5, ground: 1.5, poison: 0.4 },
  lakeshore: { water: 4, flying: 1, dragon: 1.5, normal: 0.4, electric: 0.4 },
}

export const LEGENDARY_HOME = { 144: 'snow', 145: 'mountain', 146: 'volcano', 150: 'mountain', 151: 'forest' }
export const LEGENDARY_WEIGHT = 0.03
