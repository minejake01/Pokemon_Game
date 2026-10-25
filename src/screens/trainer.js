import { api } from '../api.js'
import { h, layer, toast } from '../ui.js'
import { npcPortrait } from '../world/tiles.js'

const fmt = (ms) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Talk to a trainer NPC: challenge them, or ask for a rematch once they've rested.
export function openTrainer(trainer, { onClose, onBattle }) {
  const body = h('div.trainer-body', {}, h('p', {}, '…'))
  const portrait = npcPortrait(trainer.cls)
  portrait.className = 'npc-portrait'
  const root = h('div.screen.panel-screen', {}, h('div.panel.trainer-panel', {},
    h('div.bp-top', {}, h('h2', {}, '💬 ' + trainer.name), h('span.sub'), h('button.close', { onclick: close, title: 'Close (Esc)' }, '✕')),
    h('div.trainer-main', {}, portrait, body)))

  let timer = null
  let readyAt = 0
  function close() {
    clearInterval(timer)
    window.removeEventListener('keydown', onKey)
    root.remove()
    onClose?.()
  }
  const onKey = (e) => e.key === 'Escape' && close()
  window.addEventListener('keydown', onKey)

  function battle() {
    close()
    onBattle()
  }

  function render(s) {
    const balls = h('div.trainer-balls', {}, Array.from({ length: s.teamSize }, () => h('span.icon.ico-pokeball')), h('small', {}, ` ${s.teamSize} Pokémon · around Lv${s.level}`))
    if (!s.rematch) {
      body.replaceChildren(
        h('p.quote', {}, '"Hey! Our eyes met — you know what that means. Let\'s battle!"'),
        balls,
        h('p.hint', {}, 'Prize: ₽500–750. No catching or running in trainer battles.'),
        h('div.md-actions', {}, h('button.btn.primary', { onclick: battle }, 'Battle!'), h('button.btn', { onclick: close }, 'Not now')))
      return
    }
    const left = readyAt - Date.now()
    if (left > 0) {
      body.replaceChildren(
        h('p.quote', {}, `"That was a great battle! My Pokémon are still resting… ask me for a rematch later!"`),
        h('p.cooldown', {}, `Rematch ready in ${fmt(left)}`),
        h('p.hint', {}, `You've beaten ${trainer.name} ${s.wins} time${s.wins === 1 ? '' : 's'}.`),
        h('div.md-actions', {}, h('button.btn', { onclick: close }, 'OK')))
      return
    }
    body.replaceChildren(
      h('p.quote', {}, `"Back for a rematch? My team has been training — don't hold back!"`),
      balls,
      h('p.hint', {}, 'Rematch prize: ₽125–250, and sometimes an evolution stone as a gift.'),
      h('div.md-actions', {}, h('button.btn.primary', { onclick: battle }, 'Rematch!'), h('button.btn', { onclick: close }, 'Not now')))
  }

  api.trainerTalk(trainer.id).then(({ trainer: s }) => {
    readyAt = Date.now() + s.cooldownMs
    render(s)
    if (s.cooldownMs > 0) {
      timer = setInterval(() => {
        render(s)
        if (Date.now() >= readyAt) clearInterval(timer)
      }, 1000)
    }
  }).catch((err) => {
    toast(err.message)
    close()
  })

  layer().append(root)
  return { close }
}
