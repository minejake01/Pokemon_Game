import { h, layer } from '../ui.js'

function fmtTime(ms) {
  const m = Math.floor(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

function scoreCard(score) {
  return h('div.score-card', {},
    h('div.score-total', {}, h('small', {}, 'SCORE'), score.total.toLocaleString()),
    h('table.score-parts', {}, score.parts.map((p) =>
      h('tr', {}, h('td', {}, p.label), h('td', {}, `${p.count} × ${p.each}`), h('td', {}, p.points.toLocaleString())))))
}

// Shown when the whole team hits 0 HP but a Revive saved the run.
export function showScore(state) {
  return new Promise((resolve) => {
    const root = h('div.screen.ending.blackout', {},
      h('div.ending-inner', {},
        h('h1', {}, 'TEAM DOWN!'),
        h('p', {}, `All of your Pokémon hit 0 HP. A Revive saved you — ${state.bag.revive ?? 0} left.`),
        scoreCard(state.score),
        h('button.btn.primary.big', { onclick: () => { root.remove(); resolve() } }, 'Continue')))
    layer().append(root)
  })
}

export function showGameOver(state) {
  return new Promise((resolve) => {
    const root = h('div.screen.ending.gameover', {},
      h('div.ending-inner', {},
        h('h1', {}, 'GAME OVER'),
        h('p', {}, 'All of your Pokémon fainted and you had no Revives left.'),
        scoreCard(state.score),
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
        h('p', {}, `Not the main character, ${state.name}… but you caught all 151 Pokémon!`),
        h('p.stats', {}, `${state.stats.catches} catches · ${state.stats.battles} battles · ${fmtTime(state.stats.playMs)} played · score ${state.score.total.toLocaleString()}`),
        h('button.btn.primary.big', { onclick: () => { root.remove(); resolve() } }, 'Keep exploring')))
    layer().append(root)
  })
}
