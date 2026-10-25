import { api } from '../api.js'
import { store } from '../store.js'
import { h, layer, toast } from '../ui.js'
import { UPGRADES, UPGRADE_KEYS, upgradeBonus, pctText } from '../../shared/balance.js'

// Level-up pause: shows 3 upgrade cards for the Pokémon `uid`. Resolves true once one is picked.
export function chooseUpgrade(uid) {
  return new Promise((resolve) => {
    const st = store.state
    const mon = [...st.team, ...st.box].find((m) => m.uid === uid)
    let busy = false

    const stacks = (key) => (UPGRADES[key].scope === 'player' ? st.upgrades.walk : mon?.boosts[key] ?? 0)
    const cards = UPGRADE_KEYS.map((key, i) => {
      const u = UPGRADES[key]
      const now = upgradeBonus(key, stacks(key)), next = upgradeBonus(key, stacks(key) + 1)
      return h('button.up-card', { onclick: () => pick(key) },
        h('kbd', {}, i + 1),
        h('div.up-icon', {}, u.icon),
        h('b', {}, u.name),
        h('small', {}, u.desc),
        h('div.up-change', {}, `${pctText(now)} → `, h('strong', {}, pctText(next))),
        h('div.up-bar', { title: `Limit ${pctText(u.max)}` },
          h('div.up-now', { style: { width: `${(now / u.max) * 100}%` } }),
          h('div.up-next', { style: { width: `${((next - now) / u.max) * 100}%` } })),
        h('small.up-limit', {}, `Limit ${pctText(u.max)}${u.scope === 'player' ? ' · whole team' : ''}`))
    })

    const root = h('div.screen.upgrade-screen', {},
      h('div.up-inner', {},
        mon && h('img.up-mon', { src: mon.sprite, alt: '' }),
        h('h2', {}, 'LEVEL UP!'),
        h('p', {}, mon ? `${mon.name} reached Lv${mon.level}. Choose an upgrade:` : 'Choose an upgrade:'),
        h('div.up-cards', {}, cards)))

    async function pick(key) {
      if (busy) return
      busy = true
      try {
        const res = await api.upgrade(uid, key)
        store.set(res.state)
        toast(`${UPGRADES[key].icon} ${UPGRADES[key].name}!`, 1400)
        done(true)
      } catch (err) {
        toast(err.message)
        done(false)
      }
    }
    function onKey(e) {
      const i = Number(e.key) - 1
      if (UPGRADE_KEYS[i]) {
        e.preventDefault()
        e.stopPropagation()
        pick(UPGRADE_KEYS[i])
      }
    }
    function done(ok) {
      window.removeEventListener('keydown', onKey, true)
      root.remove()
      resolve(ok)
    }
    window.addEventListener('keydown', onKey, true)
    layer().append(root)
  })
}
