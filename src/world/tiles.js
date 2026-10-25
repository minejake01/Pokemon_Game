import { T, TILE } from '../../shared/world.js'

// Draws the whole tileset procedurally onto a canvas (one 32×32 cell per tile id).
let rngState = 7
const rnd = () => ((rngState = (rngState * 16807) % 2147483647) / 2147483647)

function speckle(g, x0, base, dots, count, size = 2) {
  g.fillStyle = base
  g.fillRect(x0, 0, TILE, TILE)
  for (let i = 0; i < count; i++) {
    g.fillStyle = dots[i % dots.length]
    g.fillRect(x0 + Math.floor(rnd() * (TILE - size)), Math.floor(rnd() * (TILE - size)), size, size)
  }
}

const GROUND = {
  [T.meadow]: ['#7cc85a', ['#8fd66b', '#6bb64c']],
  [T.forest]: ['#3f8f3a', ['#4b9c44', '#357d31']],
  [T.swamp]: ['#6b7a3a', ['#5d6b30', '#7a8944', '#4f5a2a']],
  [T.snow]: ['#eef4f8', ['#ffffff', '#dbe6ee']],
  [T.mountain]: ['#9a948a', ['#a9a398', '#8a857b']],
  [T.volcano]: ['#4f3832', ['#5d433b', '#41302b', '#6b2c1c']],
  [T.sand]: ['#e9d79f', ['#f2e2b0', '#dcc98c']],
  [T.path]: ['#d9c7a3', ['#e3d3b2', '#cbb893']],
}

export function buildTileset() {
  const ids = Object.values(T)
  const count = Math.max(...ids) + 1
  const canvas = document.createElement('canvas')
  canvas.width = TILE * count
  canvas.height = TILE
  const g = canvas.getContext('2d')

  for (const [id, [base, dots]] of Object.entries(GROUND)) speckle(g, id * TILE, base, dots, 26)

  // Water with little wave strokes
  let x = T.water * TILE
  g.fillStyle = '#3b7fc4'
  g.fillRect(x, 0, TILE, TILE)
  g.strokeStyle = '#6aa6e0'
  g.lineWidth = 2
  for (const [wx, wy] of [[4, 8], [18, 16], [6, 25]]) {
    g.beginPath()
    g.moveTo(x + wx, wy)
    g.quadraticCurveTo(x + wx + 4, wy - 3, x + wx + 8, wy)
    g.stroke()
  }

  // Shallow water (walkable): lighter, with sandy speckles showing through
  x = T.shallow * TILE
  g.fillStyle = '#5b9fe0'
  g.fillRect(x, 0, TILE, TILE)
  for (let i = 0; i < 10; i++) {
    g.fillStyle = i % 2 ? '#7db6ea' : '#4f93d6'
    g.fillRect(x + Math.floor(rnd() * 29), Math.floor(rnd() * 29), 3, 2)
  }
  g.strokeStyle = '#cfe6fa'
  g.lineWidth = 1.5
  for (const [wx, wy] of [[5, 10], [17, 22]]) {
    g.beginPath()
    g.moveTo(x + wx, wy)
    g.quadraticCurveTo(x + wx + 4, wy - 3, x + wx + 8, wy)
    g.stroke()
  }

  // Center floor tile (door mat)
  x = T.center * TILE
  speckle(g, x, '#d9c7a3', ['#e3d3b2'], 10)
  g.fillStyle = '#c0392b'
  g.fillRect(x + 6, 6, 20, 20)
  g.fillStyle = '#ffffff'
  g.fillRect(x + 13, 9, 6, 14)
  g.fillRect(x + 9, 13, 14, 6)

  // Obstacles & decorations are drawn on transparent cells.
  const tree = (cx, crown, dark, trunk = '#6b4423') => {
    g.fillStyle = 'rgba(0,0,0,0.18)'
    g.beginPath(); g.ellipse(cx + 16, 28, 11, 4, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = trunk
    g.fillRect(cx + 13, 20, 6, 9)
    g.fillStyle = dark
    g.beginPath(); g.arc(cx + 16, 14, 12, 0, Math.PI * 2); g.fill()
    g.fillStyle = crown
    g.beginPath(); g.arc(cx + 14, 12, 9, 0, Math.PI * 2); g.fill()
  }
  tree(T.tree * TILE, '#3fa34d', '#2a7a37')

  // Pine (snow)
  x = T.pine * TILE
  g.fillStyle = '#6b4423'
  g.fillRect(x + 14, 22, 4, 8)
  for (const [w, y0] of [[22, 22], [16, 15], [10, 8]]) {
    g.fillStyle = '#2f6b4f'
    g.beginPath(); g.moveTo(x + 16 - w / 2, y0); g.lineTo(x + 16 + w / 2, y0); g.lineTo(x + 16, y0 - 10); g.fill()
  }
  g.fillStyle = '#ffffff'
  g.fillRect(x + 14, 0, 4, 3)
  g.fillRect(x + 10, 10, 4, 2)
  g.fillRect(x + 19, 17, 4, 2)

  // Boulder
  const rock = (cx, c1, c2) => {
    g.fillStyle = 'rgba(0,0,0,0.2)'
    g.beginPath(); g.ellipse(cx + 16, 27, 12, 4, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = c2
    g.beginPath(); g.ellipse(cx + 16, 19, 13, 10, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = c1
    g.beginPath(); g.ellipse(cx + 13, 16, 8, 6, 0, 0, Math.PI * 2); g.fill()
  }
  rock(T.boulder * TILE, '#b8b2a7', '#77726a')
  rock(T.lavaRock * TILE, '#3a2a26', '#241917')
  x = T.lavaRock * TILE
  g.fillStyle = '#ff6a1a'
  g.fillRect(x + 10, 20, 8, 2)
  g.fillRect(x + 18, 15, 5, 2)

  // Dead tree (swamp)
  x = T.deadTree * TILE
  g.strokeStyle = '#4a3b2a'
  g.lineCap = 'round'
  g.lineWidth = 4
  g.beginPath(); g.moveTo(x + 16, 30); g.lineTo(x + 16, 8); g.stroke()
  g.lineWidth = 2.5
  g.beginPath(); g.moveTo(x + 16, 16); g.lineTo(x + 8, 9); g.moveTo(x + 16, 13); g.lineTo(x + 24, 6); g.moveTo(x + 16, 22); g.lineTo(x + 23, 17); g.stroke()

  // Flowers
  x = T.flowers * TILE
  for (const [fx, fy, c] of [[6, 8, '#ff6b8a'], [20, 6, '#ffe066'], [12, 20, '#ffffff'], [24, 22, '#ff6b8a'], [4, 26, '#ffe066']]) {
    g.fillStyle = c
    g.fillRect(x + fx, fy, 4, 4)
    g.fillStyle = '#c47a00'
    g.fillRect(x + fx + 1, fy + 1, 2, 2)
  }

  // Tall grass
  x = T.tallGrass * TILE
  g.strokeStyle = '#2e7d32'
  g.lineWidth = 2
  for (let i = 0; i < 9; i++) {
    const gx = x + 3 + (i % 3) * 10 + (i > 2 ? 3 : 0), gy = 10 + Math.floor(i / 3) * 9
    g.beginPath(); g.moveTo(gx, gy + 8); g.lineTo(gx + 2, gy); g.moveTo(gx + 4, gy + 8); g.lineTo(gx + 5, gy + 1); g.stroke()
  }

  return canvas
}

// A 24×32 person. `leg` shifts the legs for a walking bob.
function drawPerson(g, x, look, leg = 0) {
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.beginPath(); g.ellipse(x + 12, 30, 8, 2.5, 0, 0, Math.PI * 2); g.fill()
  g.fillStyle = look.legs
  g.fillRect(x + 7, 22, 4, 7 - leg)
  g.fillRect(x + 13, 22, 4, 5 + leg)
  g.fillStyle = look.shirt
  g.fillRect(x + 6, 14, 12, 9)
  g.fillStyle = look.skin ?? '#f2c6a0' // face & hands
  g.fillRect(x + 7, 6, 10, 8)
  g.fillRect(x + 4, 16, 2, 4)
  g.fillRect(x + 18, 16, 2, 4)
  if (look.cap) {
    g.fillStyle = look.cap
    g.fillRect(x + 6, 3, 12, 4)
    g.fillRect(x + 4, 6, 8, 2)
    g.fillStyle = look.badge ?? '#ffffff'
    g.fillRect(x + 10, 3, 4, 2)
  } else {
    g.fillStyle = look.hair // long hair instead of a cap
    g.fillRect(x + 6, 3, 12, 4)
    g.fillRect(x + 5, 5, 3, 10)
    g.fillRect(x + 16, 5, 3, 10)
  }
  g.fillStyle = '#222222' // eyes
  g.fillRect(x + 8, 9, 2, 2)
  g.fillRect(x + 13, 9, 2, 2)
}

// The player: red cap, blue shirt. Two frames for a walking bob.
export function buildTrainer() {
  const c = document.createElement('canvas')
  c.width = 48
  c.height = 32
  const g = c.getContext('2d')
  const look = { cap: '#d32f2f', shirt: '#3d7bd9', legs: '#2b3a67' }
  for (let f = 0; f < 2; f++) drawPerson(g, f * 24, look, f === 0 ? 0 : 2)
  return c
}

// Trainer NPC looks per class (see TRAINER_CLASSES in shared/world.js).
const NPC_LOOKS = {
  Youngster: { cap: '#f6b93b', shirt: '#2e86de', legs: '#3c6382' },
  Lass: { hair: '#8e5a2b', shirt: '#e84393', legs: '#6c5ce7' },
  'Bug Catcher': { cap: '#78e08f', shirt: '#f8f8f8', legs: '#38ada9', badge: '#079992' },
  Picnicker: { hair: '#e17055', shirt: '#55efc4', legs: '#e1b12c' },
  Channeler: { hair: '#dfe6e9', shirt: '#6c5ce7', legs: '#2d3436', skin: '#e8d3c0' },
  Skier: { cap: '#ffffff', shirt: '#0abde3', legs: '#222f3e', badge: '#ee5253' },
  Boarder: { cap: '#ff9f43', shirt: '#10ac84', legs: '#222f3e' },
  Hiker: { cap: '#8d6e63', shirt: '#a1887f', legs: '#5d4037', skin: '#d7a77a' },
  'Black Belt': { hair: '#222222', shirt: '#f5f6fa', legs: '#f5f6fa', skin: '#d7a77a' },
  'Fire Breather': { hair: '#e55039', shirt: '#2f3640', legs: '#e55039' },
  Burglar: { cap: '#2f3640', shirt: '#636e72', legs: '#2d3436', badge: '#2f3640' },
  'Bird Keeper': { cap: '#a29bfe', shirt: '#fdcb6e', legs: '#6c5ce7' },
  Fisherman: { cap: '#e1b12c', shirt: '#44bd32', legs: '#40739e' },
  Swimmer: { hair: '#2d3436', shirt: '#0984e3', legs: '#f2c6a0' },
}

export function buildNpc(cls) {
  const c = document.createElement('canvas')
  c.width = 24
  c.height = 32
  drawPerson(c.getContext('2d'), 0, NPC_LOOKS[cls] ?? NPC_LOOKS.Youngster)
  return c
}

// Bigger copy for dialog panels.
export function npcPortrait(cls) {
  const src = buildNpc(cls)
  const c = document.createElement('canvas')
  c.width = 96
  c.height = 128
  const g = c.getContext('2d')
  g.imageSmoothingEnabled = false
  g.drawImage(src, 0, 0, 96, 128)
  return c
}

// Poké Center building: 3 tiles wide, 2.5 tall; the door sits on the center tile.
export function buildCenter() {
  const c = document.createElement('canvas')
  c.width = TILE * 3
  c.height = TILE * 2.5
  const g = c.getContext('2d')
  const W = c.width, H = c.height
  g.fillStyle = 'rgba(0,0,0,0.25)'
  g.fillRect(4, H - 8, W - 8, 8)
  g.fillStyle = '#f4efe6'
  g.fillRect(6, 30, W - 12, H - 36)
  g.fillStyle = '#d63031'
  g.beginPath(); g.moveTo(0, 34); g.lineTo(W / 2, 4); g.lineTo(W, 34); g.closePath(); g.fill()
  g.fillStyle = '#b71c1c'
  g.fillRect(0, 30, W, 6)
  // Poké Ball emblem
  g.fillStyle = '#ffffff'
  g.beginPath(); g.arc(W / 2, 22, 7, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#222'
  g.fillRect(W / 2 - 7, 21, 14, 2)
  g.beginPath(); g.arc(W / 2, 22, 2.5, 0, Math.PI * 2); g.fill()
  // windows + door
  g.fillStyle = '#7fc8f8'
  g.fillRect(14, 44, 16, 12)
  g.fillRect(W - 30, 44, 16, 12)
  g.fillStyle = '#5d4037'
  g.fillRect(W / 2 - 9, H - 30, 18, 24)
  g.fillStyle = '#ffd54f'
  g.fillRect(W / 2 + 4, H - 19, 3, 3)
  return c
}
