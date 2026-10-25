import Phaser from 'phaser'
import './style.css'
import { api, setPlayerId } from './api.js'
import { store } from './store.js'
import { toast } from './ui.js'
import { BIOMES } from '../shared/world.js'
import { WorldScene } from './world/WorldScene.js'
import { showTitle } from './screens/title.js'
import { createHud } from './screens/hud.js'
import { runBattle } from './screens/battle.js'
import { openBackpack } from './screens/backpack.js'
import { openCenter } from './screens/center.js'
import { showGameOver, showVictory } from './screens/endings.js'

let game = null
let hud = null
let panel = null // the open Backpack / Poké Center panel, if any
let inBattle = false

const victoryKey = (id) => `pokeArena.victoryShown.${id}`
function victoryShown(id) {
  try {
    return localStorage.getItem(victoryKey(id)) === '1'
  } catch {
    return store.victoryShown === id
  }
}
function markVictoryShown(id) {
  store.victoryShown = id
  try {
    localStorage.setItem(victoryKey(id), '1')
  } catch {
    /* ignore */
  }
}

const scene = () => game?.scene.getScene('World')

function openPanel(factory) {
  if (panel || inBattle) return
  scene()?.scene.pause()
  panel = factory(() => {
    panel = null
    scene()?.scene.resume()
  })
}

const bridge = {
  canMove: () => !panel && !inBattle,
  onBiome(biome, zl, changed) {
    hud.setBiome(biome, zl)
    if (changed && biome !== 'ocean') toast(`Entered ${BIOMES[biome].name}`, 1500)
  },
  onMove(tx, ty) {
    hud.setPos(tx, ty)
  },
  onCenter(center) {
    openPanel((onClose) => openCenter(center, { onClose }))
  },
  async onBattle(spawn, removeWild) {
    inBattle = true
    const end = await runBattle(spawn)
    removeWild()
    inBattle = false
    if (end.error) toast(end.error)
    const { state } = await api.state()
    store.set(state)
    if (end.outcome === 'gameover') {
      await endRun(() => showGameOver(state))
      return
    }
    scene().afterBattle({ respawn: end.outcome === 'blackout' ? state.pos : null })
    if (end.outcome === 'blackout') toast('Your Pokémon were revived at the Poké Center… be careful!', 3000)
    if (state.won && !victoryShown(state.id)) {
      markVictoryShown(state.id)
      scene().scene.pause()
      await showVictory(state)
      scene().scene.resume()
    }
  },
}

async function endRun(showScreen) {
  game.destroy(true)
  game = null
  hud.destroy()
  hud = null
  await showScreen()
  setPlayerId(null)
  boot()
}

function startWorld(state) {
  store.set(state)
  hud = createHud({ onBackpack: () => openPanel((onClose) => openBackpack({ onClose })) })
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#2f6fb3',
    pixelArt: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    physics: { default: 'arcade' },
    loader: { crossOrigin: 'anonymous' },
    scene: [],
  })
  game.scene.add('World', WorldScene, true, { bridge })
  if (import.meta.env.DEV) window.__game = game // handy for debugging in the console
}

window.addEventListener('keydown', (e) => {
  if (!game || inBattle || e.target instanceof HTMLInputElement) return
  if ((e.key === 'b' || e.key === 'B') && !panel) {
    e.preventDefault()
    openPanel((onClose) => openBackpack({ onClose }))
  } else if (e.key === 'm' || e.key === 'M') {
    hud.toggleMap()
  }
})

async function boot() {
  const state = await showTitle()
  if (!store.dex) api.dex().then((r) => (store.dex = r.species)).catch(() => {})
  startWorld(state)
}

boot()
