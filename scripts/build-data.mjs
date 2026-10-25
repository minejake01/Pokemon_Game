// Fetches Gen 1 species data from PokéAPI and writes server/data/pokemon.json.
// Run once with: npm run build:data
import { writeFile, mkdir } from 'node:fs/promises'

const API = 'https://pokeapi.co/api/v2'
const GEN1_TYPES = new Set([
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison',
  'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon',
])
const GEN_NUM = { 'generation-i': 1, 'generation-ii': 2, 'generation-iii': 3, 'generation-iv': 4, 'generation-v': 5, 'generation-vi': 6, 'generation-vii': 7, 'generation-viii': 8, 'generation-ix': 9 }

const cache = new Map()
async function get(url) {
  if (cache.has(url)) return cache.get(url)
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
      const json = await res.json()
      cache.set(url, json)
      return json
    } catch (err) {
      if (attempt >= 3) throw err
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
  }
}

async function pool(items, size, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }))
  return out
}

const idFromUrl = (url) => Number(url.split('/').filter(Boolean).pop())
const titleCase = (name) => ({
  'nidoran-f': 'Nidoran♀', 'nidoran-m': 'Nidoran♂', 'mr-mime': 'Mr. Mime', farfetchd: "Farfetch'd",
}[name] ?? name.charAt(0).toUpperCase() + name.slice(1))

function gen1Types(p) {
  let types = p.types.map((t) => t.type.name)
  const past = (p.past_types ?? [])
    .map((pt) => ({ gen: GEN_NUM[pt.generation.name], types: pt.types.map((t) => t.type.name) }))
    .sort((a, b) => a.gen - b.gen)
  if (past.length) types = past[0].types
  types = types.filter((t) => GEN1_TYPES.has(t))
  return types.length ? types : ['normal']
}

// Walk an evolution chain and collect level-up evolutions: fromId -> {to, level}, plus parent links.
function walkChain(node, evolutions, parents) {
  const fromId = idFromUrl(node.species.url)
  for (const next of node.evolves_to) {
    const toId = idFromUrl(next.species.url)
    if (toId <= 151 && fromId <= 151) {
      const lvl = next.evolution_details.find((d) => d.trigger.name === 'level-up' && d.min_level)
      parents[toId] = { from: fromId, level: lvl ? lvl.min_level : null }
      if (lvl) (evolutions[fromId] ??= []).push({ to: toId, level: lvl.min_level })
    }
    walkChain(next, evolutions, parents)
  }
}

const ids = Array.from({ length: 151 }, (_, i) => i + 1)
console.log('Fetching 151 Pokémon…')
const raw = await pool(ids, 12, async (id) => {
  const [p, s] = await Promise.all([get(`${API}/pokemon/${id}`), get(`${API}/pokemon-species/${id}`)])
  return { p, s }
})

const evolutions = {}
const parents = {}
const chainUrls = [...new Set(raw.map(({ s }) => s.evolution_chain.url))]
console.log(`Fetching ${chainUrls.length} evolution chains…`)
const chains = await pool(chainUrls, 12, get)
for (const c of chains) walkChain(c.chain, evolutions, parents)

const LEGENDARY = new Set([144, 145, 146, 150, 151])

const species = raw.map(({ p, s }) => {
  const stat = (n) => p.stats.find((x) => x.stat.name === n).base_stat
  return {
    id: p.id,
    name: titleCase(p.name),
    types: gen1Types(p),
    base: { hp: stat('hp'), atk: stat('attack'), def: stat('defense'), spa: stat('special-attack'), spd: stat('special-defense'), spe: stat('speed') },
    catchRate: s.capture_rate,
    baseExp: p.base_experience ?? 60,
    evolvesTo: evolutions[p.id] ?? [],
    evolvesFrom: parents[p.id]?.from ?? null,
    legendary: LEGENDARY.has(p.id),
  }
})

// Natural minimum level: level-evolved forms appear from their evolution level,
// stone/trade evolutions roughly 15 levels after their parent.
const byId = Object.fromEntries(species.map((sp) => [sp.id, sp]))
function minLevel(id) {
  const sp = byId[id]
  if (sp.legendary) return 35
  const par = parents[id]
  if (!par) return 1
  return par.level ?? Math.max(minLevel(par.from) + 15, 20)
}
for (const sp of species) sp.minLevel = minLevel(sp.id)

await mkdir(new URL('../server/data/', import.meta.url), { recursive: true })
await writeFile(new URL('../server/data/pokemon.json', import.meta.url), JSON.stringify(species, null, 1))
console.log(`Wrote ${species.length} species to server/data/pokemon.json`)
