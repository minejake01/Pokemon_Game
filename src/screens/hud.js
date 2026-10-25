import { store } from '../store.js'
import { h, layer, hpBar, money } from '../ui.js'
import { BIOMES, MAP_W, MAP_H, getWorld } from '../../shared/world.js'

const SCALE = 1 // minimap px per tile

export function createHud({ onBackpack }) {
  const biomeName = h('b')
  const zone = h('small')
  const cash = h('span.hud-chip')
  const caught = h('span.hud-chip')
  const score = h('span.hud-chip', { title: 'Score' })
  const team = h('div.hud-team')
  const mapBase = h('canvas', { width: MAP_W * SCALE, height: MAP_H * SCALE })
  const mapDot = h('canvas', { width: MAP_W * SCALE, height: MAP_H * SCALE })
  const minimap = h('div.minimap', {}, mapBase, mapDot)
  const root = h('div.hud', {},
    h('div.hud-left', {},
      h('div.hud-biome', {}, biomeName, zone),
      h('div.hud-row', {}, cash, caught, score, h('button.hud-chip.btnlike', { onclick: onBackpack, title: 'Backpack (B)' }, '🎒 Bag')),
      team),
    minimap,
    h('div.hud-help', {}, 'WASD move · Shift run · E talk · B backpack · M map'))
  layer().append(root)

  const world = getWorld(store.state.seed)
  const g = mapBase.getContext('2d')
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      g.fillStyle = BIOMES[world.biome[y * MAP_W + x]].color
      g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
    }
  }
  for (const c of world.centers) {
    g.fillStyle = '#d63031'
    g.fillRect(c.x * SCALE - 2, c.y * SCALE - 2, 5, 5)
    g.fillStyle = '#fff'
    g.fillRect(c.x * SCALE - 1, c.y * SCALE - 1, 3, 3)
  }

  for (const t of world.trainers) {
    g.fillStyle = '#222'
    g.fillRect(t.x * SCALE - 1, t.y * SCALE - 1, 3, 3)
    g.fillStyle = '#ff9f1a'
    g.fillRect(t.x * SCALE, t.y * SCALE, 1, 1)
  }

  function render(st) {
    score.textContent = `★ ${st.score.total.toLocaleString()}`
    cash.textContent = money(st.money)
    caught.textContent = `◓ ${st.dex.caught.length}/151`
    team.replaceChildren(...Array.from({ length: 5 }, (_, i) => {
      const m = st.team[i]
      if (!m) return h('div.hud-mon.empty')
      return h(`div.hud-mon${m.hp <= 0 ? '.fainted' : ''}`, { title: `${m.name} Lv${m.level} — ${m.hp}/${m.maxHp} HP` },
        h('img', { src: m.sprite, alt: '' }), h('span', {}, `Lv${m.level}`), hpBar(m.hp, m.maxHp, { small: true }))
    }))
  }
  const unsub = store.subscribe(render)
  render(store.state)

  return {
    setBiome(b, zl) {
      biomeName.textContent = BIOMES[b].name
      zone.textContent = b === 'town' ? ' · Safe zone' : ` · Wild Lv ${Math.max(2, zl - 2)}–${zl + 2}`
    },
    setPos(tx, ty) {
      const d = mapDot.getContext('2d')
      d.clearRect(0, 0, mapDot.width, mapDot.height)
      d.fillStyle = '#000'
      d.fillRect(tx * SCALE - 3, ty * SCALE - 3, 7, 7)
      d.fillStyle = '#ffeb3b'
      d.fillRect(tx * SCALE - 2, ty * SCALE - 2, 5, 5)
    },
    toggleMap() {
      minimap.classList.toggle('hidden')
    },
    destroy() {
      unsub()
      root.remove()
    },
  }
}
