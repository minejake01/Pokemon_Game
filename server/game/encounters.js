import { SPECIES, BIOME_AFFINITY, LEGENDARY_HOME, LEGENDARY_WEIGHT, isAquatic, rarity } from './data.js'

// weight(species, biome) = rarity × affinity × levelGate  (PRD §14.1)
// rarity falls off with both a low catch rate and a high base stat total.
export function spawnTable(biome, zoneLvl) {
  const aff = BIOME_AFFINITY[biome] ?? {}
  const table = []
  for (const sp of SPECIES) {
    let w
    if (sp.legendary) {
      w = LEGENDARY_HOME[sp.id] === biome && zoneLvl >= 35 ? LEGENDARY_WEIGHT : 0
    } else if (isAquatic(sp) !== (biome === 'water') && !(biome === 'water' && sp.types.includes('dragon'))) {
      w = 0 // Water types never appear on land; land Pokémon never appear in the water
    } else {
      const affinity = Math.max(0, ...sp.types.map((t) => aff[t] ?? 0))
      w = rarity(sp) * affinity * (zoneLvl >= sp.minLevel ? 1 : 0.1)
    }
    if (w > 0) table.push({ id: sp.id, w })
  }
  return table
}

export function pickWeighted(table, rand = Math.random) {
  const total = table.reduce((s, e) => s + e.w, 0)
  let r = rand() * total
  for (const e of table) {
    if ((r -= e.w) <= 0) return e.id
  }
  return table[table.length - 1].id
}

export function rollSpecies(biome, zoneLvl) {
  return pickWeighted(spawnTable(biome, zoneLvl))
}

export function rollLevel(zoneLvl) {
  return Math.max(2, Math.min(62, zoneLvl + Math.floor(Math.random() * 5) - 2))
}

// Which biomes each species can be found in (for the Pokédex).
export function habitats() {
  const out = {}
  for (const biome of Object.keys(BIOME_AFFINITY)) {
    for (const { id } of spawnTable(biome, 60)) (out[id] ??= []).push(biome)
  }
  return out
}
