import { api, getPlayerId, setPlayerId } from '../api.js'
import { h, layer, typeBadge } from '../ui.js'

const STARTERS = [
  { id: 60, name: 'Poliwag', types: ['water'], blurb: 'Bouncy and tough. Douses Fire, Rock and Ground.',
    evos: [{ id: 61, name: 'Poliwhirl', how: 'Lv 25' }, { id: 62, name: 'Poliwrath', how: 'Water Stone' }] },
  { id: 69, name: 'Bellsprout', types: ['grass', 'poison'], blurb: 'Hits hard for its size. Great against Water and Rock.',
    evos: [{ id: 70, name: 'Weepinbell', how: 'Lv 21' }, { id: 71, name: 'Victreebel', how: 'Leaf Stone' }] },
  { id: 58, name: 'Growlithe', types: ['fire'], blurb: 'Loyal and fierce. Burns through Grass, Bug and Ice.',
    evos: [{ id: 59, name: 'Arcanine', how: 'Fire Stone' }] },
]
const art = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`
const icon = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`

// Resolves with the player state once the player continues or starts a new game.
export function showTitle() {
  return new Promise((resolve) => {
    const root = h('div.screen.title')
    layer().append(root)

    const finish = (state) => {
      root.classList.add('out')
      setTimeout(() => root.remove(), 400)
      resolve(state)
    }

    async function main() {
      let save = null
      let ended = false
      if (getPlayerId()) {
        try {
          const r = await api.state()
          if (r.state.gameOver) ended = true
          else save = r.state
        } catch {
          /* no save on the server */
        }
      }
      root.replaceChildren(
        h('div.title-bg'),
        h('div.title-inner', {},
          h('h1.logo', {}, 'POKéMON', h('span.logo-sub', {}, 'but you are not the main character')),
          h('p.tagline', {}, 'Just another trainer in a big open world. Catch all 151!'),
          h('div.title-starters', {}, STARTERS.map((s) => h('img', { src: art(s.id), alt: s.name }))),
          h('div.title-menu', {},
            save && h('button.btn.primary.big', { onclick: () => finish(save) }, `Continue — ${save.name} (${save.dex.caught.length}/151)`),
            h('button.btn.big', { class: `btn big ${save ? '' : 'primary'}`, onclick: () => newGame(!!save) }, 'New Game')),
          ended && h('p.ended', {}, 'Your last journey ended when your team fainted with no Revives left. Start a new one!'),
          h('div.controls', {},
            h('span', {}, h('kbd', {}, 'WASD'), ' / ', h('kbd', {}, '↑↓←→'), ' move'),
            h('span', {}, h('kbd', {}, 'Shift'), ' run'),
            h('span', {}, h('kbd', {}, 'B'), ' backpack'),
            h('span', {}, h('kbd', {}, 'M'), ' minimap'),
            h('span', {}, h('kbd', {}, 'Space'), ' advance text')),
        ),
      )
    }

    function newGame(hasSave) {
      let pick = null
      const err = h('p.error')
      const input = h('input.name-input', { maxlength: '12', placeholder: 'Your name', value: 'Red' })
      const go = h('button.btn.primary.big', { disabled: true, onclick: start }, 'Begin adventure')
      const cards = STARTERS.map((s) => {
        const card = h('button.starter', { onclick: () => {
          pick = s.id
          cards.forEach((c) => c.classList.toggle('picked', c === card))
          go.disabled = false
          go.textContent = `Begin with ${s.name}!`
        } },
        h('img', { src: art(s.id), alt: s.name }), h('b', {}, s.name), h('div.btypes', {}, s.types.map(typeBadge)), h('small', {}, s.blurb),
        h('div.evo-line', {}, s.evos.map((e) => h('span.evo', { title: `${e.name} (${e.how})` }, '→', h('img', { src: icon(e.id), alt: e.name }), h('small', {}, e.how)))))
        return card
      })
      async function start() {
        if (!pick) return
        go.disabled = true
        try {
          const r = await api.newGame(input.value, pick)
          setPlayerId(r.playerId)
          finish(r.state)
        } catch (e) {
          err.textContent = e.message
          go.disabled = false
        }
      }
      root.replaceChildren(
        h('div.title-bg'),
        h('div.title-inner.newgame', {},
          h('h2', {}, 'Welcome, Trainer!'),
          hasSave && h('p.warn', {}, 'Starting a new game replaces your current save.'),
          h('label', {}, 'What is your name? ', input),
          h('p', {}, 'Choose your first partner:'),
          h('div.starter-row', {}, cards),
          err,
          h('div.title-menu', {}, go, h('button.btn', { onclick: main }, 'Back'))),
      )
      input.focus()
      input.select()
    }

    main()
  })
}
