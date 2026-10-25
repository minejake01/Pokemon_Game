// Deterministic world generator shared by the client (rendering) and the server (spawns).
// Everything here is a pure function of the world seed.

export const MAP_W = 180
export const MAP_H = 180
export const TILE = 32
export const TOWN = { x: 90, y: 90 }

export const BIOMES = {
  ocean: { name: 'Ocean', color: '#2f6fb3' },
  water: { name: 'Water', color: '#5b9fe0' },
  meadow: { name: 'Meadow', color: '#7cc85a' },
  forest: { name: 'Forest', color: '#3f8f3a' },
  swamp: { name: 'Swamp', color: '#6b7a3a' },
  snow: { name: 'Snowfield', color: '#e8f0f6' },
  mountain: { name: 'Mountain', color: '#9a948a' },
  volcano: { name: 'Volcano', color: '#5a3d36' },
  lakeshore: { name: 'Lakeshore', color: '#e6d49a' },
  town: { name: 'Starting Town', color: '#d9c7a3' },
}

// Ground tile ids (index into the generated tileset)
export const T = {
  meadow: 0, forest: 1, swamp: 2, snow: 3, mountain: 4, volcano: 5, sand: 6, water: 7, path: 8, center: 9,
  // obstacles
  tree: 10, pine: 11, boulder: 12, deadTree: 13, lavaRock: 14, flowers: 15, tallGrass: 16,
  shallow: 17, // walkable shallow water (Water biome)
}
export const BLOCKING = new Set([T.water, T.tree, T.pine, T.boulder, T.deadTree, T.lavaRock])

function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = smooth(x - xi), yf = smooth(y - yi)
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed)
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed)
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
}

function fbm(x, y, seed, scale) {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale
  for (let o = 0; o < 4; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 101) * amp
    norm += amp
    amp *= 0.5
    f *= 2
  }
  return sum / norm
}

export function distFromTown(tx, ty) {
  return Math.hypot(tx - TOWN.x, ty - TOWN.y)
}

export function zoneLevel(tx, ty) {
  return Math.min(60, Math.round(3 + Math.max(0, distFromTown(tx, ty) - 8) * 0.55))
}

// Cache per seed: biome & tile grids are computed once (180*180 = 32k cells).
const worlds = new Map()

export function getWorld(seed) {
  if (worlds.has(seed)) return worlds.get(seed)
  const biome = new Array(MAP_W * MAP_H)
  const ground = new Uint8Array(MAP_W * MAP_H)
  const deco = new Int8Array(MAP_W * MAP_H).fill(-1)

  const cx = MAP_W / 2, cy = MAP_H / 2
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x
      const edge = Math.max(Math.abs(x - cx) / cx, Math.abs(y - cy) / cy) // 0 centre .. 1 border
      const falloff = Math.max(0, (edge - 0.8) / 0.2)
      const elev = fbm(x, y, seed + 11, 40) - falloff * falloff * 0.9 + 0.05
      const temp = 1 - y / MAP_H + (fbm(x, y, seed + 23, 50) - 0.5) * 0.5 // north = 1 (cold)
      const moist = fbm(x, y, seed + 37, 35)
      const dTown = distFromTown(x, y)

      let b
      if (dTown < 7) b = 'town'
      else if (elev < 0.2) b = 'ocean' // deep water: blocks walking
      else if (elev < 0.27) b = 'water' // shallow water: walkable, home of Water-type Pokémon
      else if (elev < 0.31) b = 'lakeshore'
      else if (elev > 0.66) b = 'mountain'
      else if (temp > 0.74) b = 'snow'
      else if (temp < 0.26) b = 'volcano'
      else if (moist > 0.6) b = 'swamp'
      else if (moist > 0.47) b = 'forest'
      else b = 'meadow'
      biome[i] = b

      ground[i] = {
        ocean: T.water, water: T.shallow, lakeshore: T.sand, mountain: T.mountain, snow: T.snow, volcano: T.volcano,
        swamp: T.swamp, forest: T.forest, meadow: T.meadow, town: T.path,
      }[b]

      const r = hash(x, y, seed + 59)
      const r2 = hash(x, y, seed + 71)
      if (b === 'forest') deco[i] = r < 0.2 ? T.tree : r < 0.32 ? T.tallGrass : -1
      else if (b === 'meadow') deco[i] = r < 0.035 ? T.tree : r < 0.12 ? T.flowers : r < 0.22 ? T.tallGrass : -1
      else if (b === 'swamp') deco[i] = r < 0.09 ? T.deadTree : r < 0.18 && r2 < 0.5 ? T.water : r < 0.26 ? T.tallGrass : -1
      else if (b === 'snow') deco[i] = r < 0.1 ? T.pine : -1
      else if (b === 'mountain') deco[i] = r < 0.1 ? T.boulder : -1
      else if (b === 'volcano') deco[i] = r < 0.08 ? T.lavaRock : -1
      if (deco[i] === T.water) { ground[i] = T.water; deco[i] = -1 }
    }
  }

  // Poké Centers on a jittered grid; the first one sits in town.
  const centers = [{ id: 'c0', x: TOWN.x, y: TOWN.y - 3, biome: 'town' }]
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      const px = Math.round(25 + gx * 43 + (hash(gx, gy, seed + 83) - 0.5) * 16)
      const py = Math.round(25 + gy * 43 + (hash(gx, gy, seed + 89) - 0.5) * 16)
      if (distFromTown(px, py) < 25) continue
      // walk to the nearest land tile
      let best = null
      for (let r = 0; r < 14 && !best; r++) {
        for (let dy = -r; dy <= r && !best; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = px + dx, y = py + dy
            if (x < 3 || y < 3 || x >= MAP_W - 3 || y >= MAP_H - 3) continue
            const bb = biome[y * MAP_W + x]
            if (bb !== 'ocean' && bb !== 'water' && bb !== 'lakeshore') { best = { x, y, biome: bb }; break }
          }
        }
      }
      if (best) centers.push({ id: `c${centers.length}`, ...best })
    }
  }
  for (const c of centers) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const i = (c.y + dy) * MAP_W + (c.x + dx)
        deco[i] = -1
        if (ground[i] === T.water) ground[i] = T.path
      }
    }
    ground[c.y * MAP_W + c.x] = T.center
  }
  // Town plaza: clear obstacles.
  for (let y = TOWN.y - 7; y <= TOWN.y + 7; y++) {
    for (let x = TOWN.x - 7; x <= TOWN.x + 7; x++) {
      const i = y * MAP_W + x
      if (biome[i] === 'town') deco[i] = (x + y) % 9 === 0 && distFromTown(x, y) > 4 ? T.flowers : -1
    }
  }

  // Flood fill from town: which tiles can the player actually reach?
  const reach = new Uint8Array(MAP_W * MAP_H)
  const walk = (i) => !BLOCKING.has(ground[i]) && !BLOCKING.has(deco[i])
  const queue = [TOWN.y * MAP_W + TOWN.x]
  reach[queue[0]] = 1
  while (queue.length) {
    const i = queue.pop()
    const x = i % MAP_W, y = (i - x) / MAP_W
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue
      const j = ny * MAP_W + nx
      if (!reach[j] && walk(j)) { reach[j] = 1; queue.push(j) }
    }
  }

  const liveCenters = centers.filter((c) => reach[c.y * MAP_W + c.x])
  const world = { seed, biome, ground, deco, reach, centers: liveCenters, trainers: placeTrainers(seed, biome, reach, liveCenters) }
  worlds.set(seed, world)
  return world
}

// ---- Trainer NPCs ----------------------------------------------------------
export const TRAINER_CLASSES = {
  meadow: ['Youngster', 'Lass'],
  forest: ['Bug Catcher', 'Picnicker'],
  swamp: ['Channeler', 'Bug Catcher'],
  snow: ['Skier', 'Boarder'],
  mountain: ['Hiker', 'Black Belt'],
  volcano: ['Fire Breather', 'Burglar'],
  lakeshore: ['Bird Keeper', 'Fisherman'],
  water: ['Swimmer', 'Fisherman'],
  town: ['Youngster', 'Lass'],
}
const TRAINER_NAMES = ['Ben', 'Joey', 'Mia', 'Rick', 'Ana', 'Dan', 'Lily', 'Sam', 'Zoe', 'Kai', 'Ivy', 'Leo', 'Nora', 'Tim',
  'Eve', 'Max', 'Ruby', 'Finn', 'June', 'Otto', 'Pia', 'Gus', 'Wren', 'Ray', 'Cleo', 'Hugo', 'Tess', 'Abe', 'Lou', 'Mae']

// One trainer near every Poké Center plus a scattered grid. Trainers only stand on tiles whose
// 8 neighbours are all reachable, so they can never block a path.
function placeTrainers(seed, biome, reach, centers) {
  const trainers = []
  const open = (x, y) => {
    if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) return false
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!reach[(y + dy) * MAP_W + x + dx]) return false
    if (biome[y * MAP_W + x] === 'town') return false
    if (centers.some((c) => Math.abs(c.x - x) <= 3 && Math.abs(c.y - y) <= 3)) return false
    return !trainers.some((t) => Math.hypot(t.x - x, t.y - y) < 10)
  }
  const add = (x, y) => {
    const n = trainers.length
    const b = biome[y * MAP_W + x]
    const classes = TRAINER_CLASSES[b] ?? TRAINER_CLASSES.meadow
    const cls = classes[Math.floor(hash(n, 7, seed + 97) * classes.length)]
    const name = TRAINER_NAMES[Math.floor(hash(n, 13, seed + 101) * TRAINER_NAMES.length)]
    trainers.push({ id: `t${n}`, x, y, biome: b, cls, name: `${cls} ${name}` })
  }
  // Search outward from (px, py) between radius r0 and r1 for an open tile.
  const near = (px, py, r0, r1, salt) => {
    const a0 = hash(px, py, seed + salt) * Math.PI * 2
    for (let r = r0; r <= r1; r++) {
      for (let k = 0; k < 16; k++) {
        const a = a0 + (k / 16) * Math.PI * 2
        const x = Math.round(px + Math.cos(a) * r), y = Math.round(py + Math.sin(a) * r)
        if (open(x, y)) return add(x, y)
      }
    }
  }
  for (const c of centers) {
    if (c.id === 'c0') {
      near(TOWN.x, TOWN.y, 10, 14, 103) // two easy trainers just outside town
      near(TOWN.x, TOWN.y, 11, 15, 107)
    } else near(c.x, c.y, 5, 9, 109)
  }
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 5; gx++) {
      const px = Math.round(18 + gx * 36 + (hash(gx, gy, seed + 113) - 0.5) * 20)
      const py = Math.round(18 + gy * 36 + (hash(gx, gy, seed + 127) - 0.5) * 20)
      if (distFromTown(px, py) > 12) near(px, py, 0, 6, 131)
    }
  }
  return trainers
}

// A seed is good when every biome has plenty of reachable land and centers cover most biomes.
export function isGoodSeed(seed) {
  const w = getWorld(seed)
  const counts = {}
  for (let i = 0; i < w.biome.length; i++) if (w.reach[i]) counts[w.biome[i]] = (counts[w.biome[i]] || 0) + 1
  const need = ['meadow', 'forest', 'swamp', 'snow', 'mountain', 'volcano', 'lakeshore']
  const centerBiomes = new Set(w.centers.map((c) => c.biome))
  return need.every((b) => (counts[b] || 0) >= 700) && (counts.water || 0) >= 500 && w.centers.length >= 12 &&
    need.filter((b) => b !== 'lakeshore').every((b) => centerBiomes.has(b))
}

export function biomeAt(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 'ocean'
  return world.biome[ty * MAP_W + tx]
}

export function isWalkable(world, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false
  return world.reach[ty * MAP_W + tx] === 1
}

// Biome used for spawning: town counts as meadow.
export function spawnBiome(world, tx, ty) {
  const b = biomeAt(world, tx, ty)
  return b === 'town' ? 'meadow' : b
}
