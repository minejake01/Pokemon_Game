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
import { openTrainer } from './screens/trainer.js'
import { chooseUpgrade } from './screens/upgrades.js'
import { showGameOver, showVictory, showScore } from './screens/endings.js'

// Core loop checklist (PRD 2 #6):
// - Walking into a wild Pokémon starts a battle: WorldScene.touchWild -> bridge.onBattle.
// - My attacks do damage from my Attack / Sp. Atk stat: server/game/battle.js rawDamage.
// - Winning gives XP; when the XP bar fills (level up) the battle pauses on 3 upgrade cards
//   (more damage / faster attacks / faster walking): screens/upgrades.js, flushed again below.
// - Raw stats become capped "game numbers" so no Pokémon is too strong: shared/balance.js.
// - When the whole team hits 0 HP, the score is shown: showScore / showGameOver.

let game = null
let hud = null
let panel = null // the open Backpack / Poké Center / trainer panel, if any
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

// One upgrade-card pick per level-up the server is still waiting on.
async function flushUpgrades() {
  while (store.state?.pendingUpgrades?.length) {
    if (!(await chooseUpgrade(store.state.pendingUpgrades[0]))) break
  }
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
  onTrainer(trainer) {
    openPanel((onClose) => openTrainer(trainer, { onClose, onBattle: () => scene().beginTrainerBattle(trainer) }))
  },
  // `start` asks the server to begin (or resume) the battle; the world scene is already paused.
  async onBattle(start, cleanup) {
    inBattle = true
    const end = await runBattle(start)
    cleanup()
    if (end.error) toast(end.error)
    const { state } = await api.state()
    store.set(state)
    if (end.outcome === 'gameover') {
      inBattle = false
      await endRun(() => showGameOver(state))
      return
    }
    if (end.outcome === 'blackout') await showScore(state)
    await flushUpgrades()
    if (state.won && !victoryShown(state.id)) {
      markVictoryShown(state.id)
      await showVictory(state)
    }
    inBattle = false
    scene().afterBattle({ respawn: end.outcome === 'blackout' ? state.pos : null })
    if (end.outcome === 'blackout') toast('Your Pokémon were revived at the Poké Center… be careful!', 3000)
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
  // Reloaded with level-up picks still waiting: show the cards before walking on.
  if (state.pendingUpgrades?.length && !state.inBattle) {
    openPanel((onClose) => {
      flushUpgrades().finally(onClose)
      return {}
    })
  }
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
