import { TYPE_COLORS } from '../shared/types.js'

// Tiny DOM helper: h('div.card', {onclick}, children...)
export function h(tag, props = {}, ...children) {
  const [name, ...classes] = tag.split('.')
  const el = document.createElement(name || 'div')
  if (classes.length) el.className = classes.join(' ')
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), sv)
    else if (k === 'html') el.innerHTML = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return el
}

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function typeBadge(type) {
  return h('span.type', { style: { background: TYPE_COLORS[type] } }, type.toUpperCase())
}

export function hpColor(ratio) {
  return ratio > 0.5 ? 'var(--hp-good)' : ratio > 0.2 ? 'var(--hp-mid)' : 'var(--hp-low)'
}

export function hpBar(hp, max, { small = false } = {}) {
  const r = max ? Math.max(0, hp / max) : 0
  const fill = h('div.hpfill', { style: { width: `${r * 100}%`, background: hpColor(r) } })
  return h(`div.hpbar${small ? '.small' : ''}`, {}, h('span.hplabel', {}, 'HP'), h('div.hptrack', {}, fill))
}

export function setHp(barEl, hp, max) {
  const r = max ? Math.max(0, hp / max) : 0
  const fill = barEl.querySelector('.hpfill')
  fill.style.width = `${r * 100}%`
  fill.style.background = hpColor(r)
}

export const layer = () => document.getElementById('ui')

let toastTimer = null
export function toast(text, ms = 2200) {
  let el = document.getElementById('toast')
  if (!el) {
    el = h('div', { id: 'toast' })
    document.body.append(el)
  }
  el.textContent = text
  el.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('show'), ms)
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export function money(n) {
  return `₽${n.toLocaleString()}`
}

export function monSprite(mon, { back = false, cls = '' } = {}) {
  return h(`img.sprite${cls ? '.' + cls : ''}`, { src: back ? mon.backSprite : mon.sprite, alt: mon.name, draggable: 'false' })
}
