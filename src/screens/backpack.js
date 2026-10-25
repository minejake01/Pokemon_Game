import { api } from '../api.js'
import { store } from '../store.js'
import { h, layer, typeBadge, hpBar, toast, money } from '../ui.js'
import { BIOMES } from '../../shared/world.js'

const ITEM_ORDER = ['pokeball', 'superball', 'ultraball', 'potion', 'superpotion', 'revive']
const TABS = [['items', 'Items'], ['team', 'Team'], ['box', 'Box (PC)'], ['dex', 'Pokédex']]

export function openBackpack({ onClose, tab = 'items' }) {
  let current = tab
  let selected = null // uid of the expanded Pokémon
  let dexPick = null
  let usingItem = null

  const body = h('div.bp-body')
  const tabs = h('div.bp-tabs')
  const header = h('div.bp-header')
  const root = h('div.screen.panel-screen', {}, h('div.panel.backpack', {},
    h('div.bp-top', {}, h('h2', {}, '🎒 Backpack'), header, h('button.close', { onclick: close, title: 'Close (B / Esc)' }, '✕')),
    tabs, body))

  const unsub = store.subscribe(render)
  function close() {
    unsub()
    window.removeEventListener('keydown', onKey)
    root.remove()
    onClose?.()
  }
  function onKey(e) {
    if (e.key === 'Escape' || e.key === 'b' || e.key === 'B') {
      e.preventDefault()
      if (usingItem) { usingItem = null; render() } else close()
    }
  }
  window.addEventListener('keydown', onKey)

  async function call(fn, okMsg) {
    try {
      const res = await fn()
      store.set(res.state)
      const text = res.events?.find((e) => e.t === 'text')?.text ?? okMsg
      if (text) toast(text)
    } catch (err) {
      toast(err.message)
    }
  }

  function render() {
    const st = store.state
    header.replaceChildren(h('span', {}, money(st.money)), h('span', {}, `Caught ${st.dex.caught.length}/151`))
    tabs.replaceChildren(...TABS.map(([key, label]) =>
      h(`button.tab${key === current ? '.active' : ''}`, { onclick: () => { current = key; usingItem = null; render() } }, label)))
    body.replaceChildren(({ items: renderItems, team: renderTeam, box: renderBox, dex: renderDex })[current](st))
  }

  function renderItems(st) {
    if (usingItem) {
      const item = st.items[usingItem]
      return h('div', {},
        h('p.hint', {}, `Use ${item.name} on which Pokémon?`, h('button.link', { onclick: () => { usingItem = null; render() } }, 'Cancel')),
        h('div.mon-list', {}, st.team.map((m) => {
          const ok = item.kind === 'revive' ? m.hp <= 0 : m.hp > 0 && m.hp < m.maxHp
          return h('button.mon-row', { disabled: !ok, onclick: () => call(() => api.useItem(usingItem, m.uid)).then(() => { if (!(store.state.bag[usingItem] > 0)) usingItem = null; render() }) },
            h('img.mini', { src: m.sprite, alt: '' }), h('span.mr-name', {}, m.name, h('small', {}, ` Lv${m.level}`)),
            hpBar(m.hp, m.maxHp, { small: true }), h('span.mr-hp', {}, m.hp <= 0 ? 'Fainted' : `${m.hp}/${m.maxHp}`))
        })))
    }
    return h('div.item-list', {}, ITEM_ORDER.map((key) => {
      const item = st.items[key]
      const count = st.bag[key] ?? 0
      return h('div.item-row', {},
        h('span', { class: `icon ico-${key}` }),
        h('div.ir-text', {}, h('b', {}, item.name), h('small', {}, item.desc)),
        h('span.count', {}, `×${count}`),
        item.kind !== 'ball' ? h('button.btn.small', { disabled: count <= 0, onclick: () => { usingItem = key; render() } }, 'Use') : h('span.btn-space'),
      )
    }))
  }

  function monDetail(m, actions) {
    return h('div.mon-detail', {},
      h('div.md-left', {}, h('img.big', { src: m.sprite, alt: m.name }), h('div.btypes', {}, m.types.map(typeBadge))),
      h('div.md-right', {},
        h('div.md-stats', {}, [['HP', m.maxHp], ['Attack', m.stats.atk], ['Defense', m.stats.def], ['Sp. Atk', m.stats.spa], ['Sp. Def', m.stats.spd], ['Speed', m.stats.spe]]
          .map(([k, v]) => h('div.stat', {}, h('span', {}, k), h('b', {}, v), h('div.statbar', {}, h('div', { style: { width: `${Math.min(100, (v / (m.level * 2.2 + 20)) * 100)}%` } }))))),
        h('div.md-moves', {}, m.moves.map((mv) => h('div.move-chip', { style: { borderColor: `var(--t-${mv.type})` } }, typeBadge(mv.type), ` ${mv.name}`, h('small', {}, mv.power ? ` ${mv.power}` : ' —')))),
        h('div.md-xp', {}, m.xpNext ? `XP ${m.xp.toLocaleString()} · ${(m.xpNext - m.xp).toLocaleString()} to Lv${m.level + 1}` : 'Max level'),
        h('div.md-actions', {}, actions),
      ))
  }

  function renderTeam(st) {
    return h('div', {},
      h('p.hint', {}, `Your team (${st.team.length}/5). Slot 1 goes into battle first.`),
      h('div.mon-list', {}, st.team.map((m, i) => {
        const open = selected === m.uid
        const move = (d) => {
          const uids = st.team.map((x) => x.uid)
          ;[uids[i], uids[i + d]] = [uids[i + d], uids[i]]
          call(() => api.orderTeam(uids))
        }
        return h('div', {},
          h(`button.mon-row${open ? '.open' : ''}`, { onclick: () => { selected = open ? null : m.uid; render() } },
            h('span.slot', {}, i + 1), h('img.mini', { src: m.sprite, alt: '' }),
            h('span.mr-name', {}, m.name, h('small', {}, ` Lv${m.level}`)),
            h('span.mr-types', {}, m.types.map(typeBadge)),
            hpBar(m.hp, m.maxHp, { small: true }), h('span.mr-hp', {}, m.hp <= 0 ? 'Fainted' : `${m.hp}/${m.maxHp}`)),
          open && monDetail(m, [
            h('button.btn.small', { disabled: i === 0, onclick: () => move(-1) }, '▲ Up'),
            h('button.btn.small', { disabled: i === st.team.length - 1, onclick: () => move(1) }, '▼ Down'),
            h('button.btn.small', { disabled: st.team.length <= 1, onclick: () => call(() => api.moveMon(m.uid, 'box'), `${m.name} was sent to the Box.`) }, 'Send to Box'),
          ]))
      })))
  }

  function renderBox(st) {
    if (!st.box.length) return h('p.empty', {}, 'Your Box is empty. Pokémon you catch while your team is full are stored here.')
    const full = st.team.length >= 5
    return h('div', {},
      h('p.hint', {}, `${st.box.length} Pokémon in the Box.${full ? ' Your team is full — send one to the Box first.' : ''}`),
      h('div.box-grid', {}, st.box.map((m) => {
        const open = selected === m.uid
        return h(`button.box-cell${open ? '.open' : ''}`, { onclick: () => { selected = open ? null : m.uid; render() } },
          h('img', { src: m.sprite, alt: m.name }), h('span', {}, m.name), h('small', {}, `Lv${m.level}`))
      })),
      (() => {
        const m = st.box.find((x) => x.uid === selected)
        return m && monDetail(m, [h('button.btn.small', { disabled: full, onclick: () => call(() => api.moveMon(m.uid, 'team'), `${m.name} joined your team!`) }, 'Add to Team')])
      })())
  }

  function renderDex(st) {
    const dex = store.dex
    if (!dex) return h('p.empty', {}, 'Loading Pokédex…')
    const caught = new Set(st.dex.caught), seen = new Set(st.dex.seen)
    const pick = dex.find((s) => s.id === dexPick)
    return h('div.dex', {},
      h('div.dex-grid', {}, dex.map((s) => {
        const state = caught.has(s.id) ? 'caught' : seen.has(s.id) ? 'seen' : 'unseen'
        return h(`button.dex-cell.${state}${dexPick === s.id ? '.open' : ''}`, { onclick: () => { dexPick = s.id; render() }, title: state === 'unseen' ? '???' : s.name },
          h('small', {}, `#${String(s.id).padStart(3, '0')}`),
          state === 'unseen' ? h('span.q', {}, '?') : h('img', { src: s.sprite, alt: '', loading: 'lazy' }))
      })),
      h('div.dex-info', {}, pick ? (() => {
        const state = caught.has(pick.id) ? 'caught' : seen.has(pick.id) ? 'seen' : 'unseen'
        if (state === 'unseen') return [h('h3', {}, `#${String(pick.id).padStart(3, '0')} ???`), h('p', {}, 'Not seen yet. Explore new biomes to find it!')]
        return [
          h('img.big', { src: pick.sprite, alt: pick.name, class: `big ${state === 'seen' ? 'silhouette' : ''}` }),
          h('h3', {}, `#${String(pick.id).padStart(3, '0')} ${pick.name}`),
          h('div.btypes', {}, pick.types.map(typeBadge)),
          h('p', {}, state === 'caught' ? '✔ Caught' : '👁 Seen — not caught yet'),
          h('p', {}, h('b', {}, 'Habitat: '), pick.habitats.map((b) => BIOMES[b].name).join(', ') || 'Unknown'),
          pick.legendary && h('p.legend', {}, '★ Legendary — appears only deep in its home biome (zone Lv 35+).'),
        ]
      })() : h('p', {}, `Seen ${seen.size} · Caught ${caught.size} / 151. Select an entry.`)))
  }

  render()
  layer().append(root)
  return { close }
}

