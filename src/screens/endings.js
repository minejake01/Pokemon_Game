import { h, layer } from '../ui.js'

function fmtTime(ms) {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

export function showGameOver(state) {
  return new Promise((resolve) => {
    const root = h('div.screen.ending.gameover', {},
      h('div.ending-inner', {},
        h('h1', {}, 'GAME OVER'),
        h('p', {}, 'All of your Pokémon fainted and you had no Revives left.'),
        h('p.stats', {}, `${state.name} caught ${state.dex.caught.length}/151 species · ${state.stats.battles} battles · ${fmtTime(state.stats.playMs)} played`),
        h('button.btn.primary.big', { onclick: () => { root.remove(); resolve() } }, 'Back to title')))
    layer().append(root)
  })
}

export function showVictory(state) {
  return new Promise((resolve) => {
    const root = h('div.screen.ending.victory', {},
      h('div.confetti'),
      h('div.ending-inner', {},
        h('h1', {}, 'POKéMON MASTER!'),
        h('p', {}, `Incredible, ${state.name}! You caught all 151 Pokémon!`),
        h('p.stats', {}, `${state.stats.catches} catches · ${state.stats.battles} battles · ${fmtTime(state.stats.playMs)} played`),
        h('button.btn.primary.big', { onclick: () => { root.remove(); resolve() } }, 'Keep exploring')))
    layer().append(root)
  })
}
