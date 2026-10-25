import { api } from '../api.js'
import { store } from '../store.js'
import { h, layer, toast, money, hpBar } from '../ui.js'
import { BIOMES } from '../../shared/world.js'

const MART = ['pokeball', 'superball', 'ultraball', 'potion', 'superpotion', 'revive', 'firestone', 'waterstone', 'thunderstone', 'leafstone', 'moonstone']

const fmt = (ms) => {
  const sec = Math.ceil(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export function openCenter(center, { onClose }) {
  const body = h('div.center-body')
  const root = h('div.screen.panel-screen', {}, h('div.panel.center', {},
    h('div.bp-top', {}, h('h2', {}, '🏥 Poké Center'), h('span.sub', {}, BIOMES[center.biome]?.name ?? ''), h('button.close', { onclick: close }, '✕')),
    body))

  // Free healing recharges every 3 minutes; keep the button's countdown ticking.
  const healBtn = h('button.btn.primary', { onclick: heal })
  const healLeft = () => Math.max(0, store.state.receivedAt + store.state.healCooldownMs - Date.now())
  function tickHeal() {
    const left = healLeft()
    healBtn.disabled = left > 0
    healBtn.textContent = left > 0 ? `Free heal recharging… ${fmt(left)}` : 'Heal my whole team (free)'
  }
  const timer = setInterval(tickHeal, 500)

  function close() {
    clearInterval(timer)
    unsub()
    window.removeEventListener('keydown', onKey)
    root.remove()
    onClose?.()
  }
  const onKey = (e) => e.key === 'Escape' && close()
  window.addEventListener('keydown', onKey)
  const unsub = store.subscribe(render)

  api.visitCenter(center.id).then((r) => store.set(r.state)).catch(() => {})

  async function heal() {
    try {
      const r = await api.heal(center.id)
      store.set(r.state)
      toast(r.fainted ? `Your Pokémon were healed! ${r.fainted} fainted Pokémon still need a Revive.` : 'Your Pokémon are fully healed! Next free heal in 3:00.', 3000)
      root.querySelector('.panel').classList.add('healing')
      setTimeout(() => root.querySelector('.panel')?.classList.remove('healing'), 900)
    } catch (err) {
      toast(err.message)
    }
  }

  async function buy(key, qty) {
    try {
      const r = await api.buy(key, qty)
      store.set(r.state)
      toast(`Bought ${qty} × ${r.state.items[key].name}`)
    } catch (err) {
      toast(err.message)
    }
  }

  function render() {
    const st = store.state
    body.replaceChildren(
      h('div.center-heal', {},
        h('p', {}, 'Welcome! We heal your whole team to full HP for free, ', h('b', {}, 'once every 3 minutes'), '. Fainted Pokémon still need a Revive.'),
        h('div.mon-list.compact', {}, st.team.map((m) => h('div.mon-row', {}, h('img.mini', { src: m.sprite, alt: '' }), h('span.mr-name', {}, m.name), hpBar(m.hp, m.maxHp, { small: true }), h('span.mr-hp', {}, m.hp <= 0 ? 'Fainted' : `${m.hp}/${m.maxHp}`)))),
        healBtn,
        h('p.hint', {}, 'This Poké Center is now your respawn point.')),
      h('div.center-mart', {},
        h('h3', {}, 'Poké Mart', h('span.wallet', {}, money(st.money))),
        h('div.item-list', {}, MART.map((key) => {
          const item = st.items[key]
          return h('div.item-row', {},
            h('span', { class: `icon ico-${key}` }),
            h('div.ir-text', {}, h('b', {}, item.name), h('small', {}, item.desc)),
            h('span.count', {}, `own ×${st.bag[key] ?? 0}`),
            h('span.price', {}, money(item.price)),
            h('button.btn.small', { disabled: st.money < item.price, onclick: () => buy(key, 1) }, 'Buy 1'),
            h('button.btn.small', { disabled: st.money < item.price * 5, onclick: () => buy(key, 5) }, 'Buy 5'))
        }))),
    )
  }

  render()
  tickHeal()
  layer().append(root)
  return { close }
}
