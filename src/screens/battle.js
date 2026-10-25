import { api } from '../api.js'
import { store } from '../store.js'
import { h, layer, typeBadge, hpBar, setHp, wait } from '../ui.js'
import { effectiveness, TYPE_COLORS } from '../../shared/types.js'
import { chooseUpgrade } from './upgrades.js'

const BALLS = ['pokeball', 'superball', 'ultraball']
const MEDS = ['potion', 'superpotion', 'revive']

// Runs a whole battle (wild or trainer). `start` makes the server begin or resume it.
// Resolves with the final 'end' event.
export async function runBattle(start) {
  let res
  try {
    res = await start()
  } catch (err) {
    return { outcome: 'none', error: err.message }
  }
  store.set(res.state)
  const ui = new BattleUI(res.battle, res.state)
  layer().append(ui.root)
  await wait(50)
  ui.root.classList.add('in')
  const end = await ui.play(res.events)
  return end ?? ui.loop()
}

class BattleUI {
  constructor(battle, state) {
    this.foe = battle.wild
    this.me = state.team.find((m) => m.uid === battle.activeUid)
    this.needSwitch = battle.needSwitch
    this.trainer = battle.trainer // null in wild battles
    this.upgradeQueue = []
    this.busy = false
    this.build(battle.biome)
  }

  build(biome) {
    this.foeSprite = h(`img.sprite.foe-sprite${this.foe.shiny ? '.shiny' : ''}`, { src: this.foe.sprite, alt: '', draggable: 'false' })
    this.meSprite = h('img.sprite.me-sprite', { src: this.me.backSprite, alt: '', draggable: 'false' })
    this.foeCard = h('div.bcard.foe-card')
    this.meCard = h('div.bcard.me-card')
    this.msg = h('div.bmsg')
    this.menu = h('div.bmenu')
    this.root = h(`div.screen.battle.biome-${biome}`, {},
      h('div.bfield', {},
        this.foeCard,
        h('div.pad.foe-pad', {}, this.foeSprite),
        h('div.pad.me-pad', {}, this.meSprite),
        this.meCard,
      ),
      h('div.bbottom', {}, this.msg, this.menu),
    )
    this.renderCards()
    this.onKey = (e) => {
      if (e.key === ' ' || e.key === 'Enter') this.advance?.()
      if (e.key === 'Escape' && !this.busy && this.backTo) this.backTo()
    }
    window.addEventListener('keydown', this.onKey)
    this.msg.addEventListener('click', () => this.advance?.())
  }

  renderCards() {
    const f = this.foe, m = this.me
    this.foeCard.replaceChildren(
      this.trainer && h('div.btrainer', {}, this.trainer.name,
        h('span', {}, Array.from({ length: this.trainer.total }, (_, i) => h(`span.tball${i < this.trainer.total - this.trainer.left ? '.out' : ''}`)))),
      h('div.bname', {}, (f.shiny ? '✨' : '') + f.name, h('span.blv', {}, `Lv${f.level}`)),
      h('div.btypes', {}, f.types.map(typeBadge)),
      (this.foeHp = hpBar(f.hp, f.maxHp)),
    )
    const xpR = m.xpNext ? (m.xp - m.xpLevelStart) / (m.xpNext - m.xpLevelStart) : 1
    this.meCard.replaceChildren(
      h('div.bname', {}, (m.shiny ? '✨' : '') + m.name, h('span.blv', {}, `Lv${m.level}`)),
      h('div.btypes', {}, m.types.map(typeBadge)),
      (this.meHp = hpBar(m.hp, m.maxHp)),
      (this.meHpText = h('div.bhpnum', {}, `${Math.max(0, m.hp)} / ${m.maxHp}`)),
      h('div.xpbar', {}, (this.xpFill = h('div.xpfill', { style: { width: `${xpR * 100}%` } }))),
    )
  }

  setXp(m) {
    const r = m.xpNext ? (m.xp - m.xpLevelStart) / (m.xpNext - m.xpLevelStart) : 1
    this.xpFill.style.width = `${Math.max(0, Math.min(1, r)) * 100}%`
  }

  // Shows a message; resolves on click/Space/Enter or after a short delay.
  say(text) {
    this.msg.textContent = text
    this.msg.classList.add('waiting')
    return new Promise((resolve) => {
      const t = setTimeout(done, 1500)
      const self = this
      function done() {
        clearTimeout(t)
        self.advance = null
        self.msg.classList.remove('waiting')
        resolve()
      }
      this.advance = done
    })
  }

  anim(el, cls, ms) {
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
    return wait(ms).then(() => el.classList.remove(cls))
  }

  async play(events) {
    this.busy = true
    this.menu.classList.add('hidden')
    let end = null
    for (const e of events) {
      switch (e.t) {
        case 'text':
          await this.say(e.text)
          while (this.upgradeQueue.length) await chooseUpgrade(this.upgradeQueue.shift())
          break
        case 'foeSwitch':
          this.foe = e.mon
          this.trainer = { ...this.trainer, left: e.left }
          this.foeSprite.src = e.mon.sprite
          this.foeSprite.classList.toggle('shiny', !!e.mon.shiny)
          this.renderCards()
          await wait(50)
          this.foeSprite.classList.remove('fainted')
          await wait(350)
          break
        case 'attack': {
          const el = e.side === 'wild' ? this.foeSprite : this.meSprite
          el.style.setProperty('--fx', TYPE_COLORS[e.moveType])
          await this.anim(el, e.side === 'wild' ? 'lunge-foe' : 'lunge-me', 320)
          break
        }
        case 'damage': {
          const target = e.side === 'wild' ? this.foe : this.me
          target.hp = e.hp
          const el = e.side === 'wild' ? this.foeSprite : this.meSprite
          this.anim(el, 'hit', 450)
          setHp(e.side === 'wild' ? this.foeHp : this.meHp, e.hp, e.maxHp)
          if (e.side !== 'wild') this.meHpText.textContent = `${e.hp} / ${e.maxHp}`
          await wait(500)
          break
        }
        case 'heal': {
          const target = e.side === 'wild' ? this.foe : this.me
          target.hp = e.hp
          setHp(e.side === 'wild' ? this.foeHp : this.meHp, e.hp, e.maxHp)
          if (e.side !== 'wild') this.meHpText.textContent = `${e.hp} / ${e.maxHp}`
          await wait(400)
          break
        }
        case 'faint':
          (e.side === 'wild' ? this.foeSprite : this.meSprite).classList.add('fainted')
          await wait(500)
          break
        case 'switch':
          this.meSprite.classList.add('recalled')
          await wait(250)
          this.me = e.mon
          this.meSprite.src = e.mon.backSprite
          this.meSprite.classList.remove('fainted')
          this.renderCards()
          await wait(50)
          this.meSprite.classList.remove('recalled')
          await wait(300)
          break
        case 'ball':
          await this.throwBall(e)
          break
        case 'levelup':
        case 'xp':
          if (e.mon.uid === this.me.uid) {
            const leveled = e.t === 'levelup'
            this.me = e.mon
            if (leveled) {
              this.renderCards()
              this.anim(this.meCard, 'glow', 600)
              this.upgradeQueue.push(e.mon.uid) // XP bar filled: pause for upgrade cards after the next message
            } else this.setXp(e.mon)
          }
          break
        case 'evolve':
          if (e.mon.uid === this.me.uid) {
            await this.anim(this.meSprite, 'evolving', 1600)
            this.me = e.mon
            this.meSprite.src = e.mon.backSprite
            this.renderCards()
          }
          break
        case 'needSwitch':
          this.needSwitch = true
          break
        case 'end':
          end = e
          break
      }
    }
    this.busy = false
    if (end) await this.close()
    return end
  }

  async throwBall(e) {
    const ball = h(`div.ball.${e.item}`)
    this.root.querySelector('.bfield').append(ball)
    await wait(30)
    ball.classList.add('thrown')
    await wait(550)
    this.foeSprite.classList.add('captured')
    await wait(350)
    for (let i = 0; i < e.shakes; i++) await this.anim(ball, 'shake', 650)
    if (e.caught) {
      ball.classList.add('sealed')
      await wait(500)
    } else {
      ball.classList.add('burst')
      this.foeSprite.classList.remove('captured')
      await wait(350)
      ball.remove()
    }
  }

  async close() {
    window.removeEventListener('keydown', this.onKey)
    this.root.classList.remove('in')
    await wait(300)
    this.root.remove()
  }

  // ---- Command menus ---------------------------------------------------------
  loop() {
    return new Promise((resolve) => {
      this.resolveEnd = resolve
      this.showMain()
    })
  }

  async send(action) {
    if (this.busy) return
    this.busy = true
    let res
    try {
      res = await api.battleAction(action)
    } catch (err) {
      this.busy = false
      await this.say(err.message)
      return this.needSwitch ? this.showParty(true) : this.showMain()
    }
    this.needSwitch = false
    store.set(res.state) // before playing, so upgrade picks made during playback aren't overwritten
    const end = await this.play(res.events)
    if (end) return this.resolveEnd(end)
    if (res.battle?.needSwitch) {
      this.needSwitch = true
      return this.showParty(true)
    }
    this.showMain()
  }

  setMenu(prompt, buttons, back) {
    this.msg.textContent = prompt
    this.backTo = back ?? null
    const items = buttons.map((b) => b instanceof Node ? b : h('button.bbtn', { onclick: b.onclick, disabled: b.disabled, style: b.style }, b.label))
    if (back) items.push(h('button.bbtn.back', { onclick: back }, '← Back'))
    this.menu.replaceChildren(...items)
    this.menu.classList.remove('hidden')
    this.menu.querySelector('button:not([disabled])')?.focus()
  }

  showMain() {
    this.setMenu(`What will ${this.me.name} do?`, [
      { label: 'FIGHT', onclick: () => this.showMoves(), style: { '--accent': '#e74c3c' } },
      { label: 'BAG', onclick: () => this.showBag(), style: { '--accent': '#f39c12' } },
      { label: 'POKéMON', onclick: () => this.showParty(false), style: { '--accent': '#27ae60' } },
      { label: 'RUN', onclick: () => this.send({ type: 'run' }), disabled: !!this.trainer, style: { '--accent': '#2980b9' } },
    ])
    this.menu.className = 'bmenu grid2'
  }

  showMoves() {
    const btns = this.me.moves.map((m, i) => {
      const eff = effectiveness(m.type, this.foe.types)
      const hint = m.effect?.fixed ? (eff === 0 ? 'No effect' : 'Fixed dmg') : eff === 0 ? 'No effect' : eff > 1 ? 'Super effective' : eff < 1 ? 'Not very effective' : ''
      return h('button.bbtn.move', { onclick: () => this.send({ type: 'move', index: i }), style: { '--accent': TYPE_COLORS[m.type] } },
        h('span.mname', {}, m.name),
        h('span.mmeta', {}, typeBadge(m.type), ` ${m.power || '—'} pow · ${m.acc}%`),
        hint && h('span.mhint', { class: `mhint ${eff > 1 ? 'good' : eff < 1 ? 'bad' : ''}` }, hint),
      )
    })
    this.setMenu('Choose a move.', btns, () => this.showMain())
    this.menu.className = 'bmenu grid2'
  }

  showBag() {
    const st = store.state
    const btns = [...BALLS, ...MEDS].map((key) => {
      const item = st.items[key]
      const count = st.bag[key] ?? 0
      return h('button.bbtn.item', {
        disabled: count <= 0 || (item.kind === 'ball' && !!this.trainer),
        title: item.kind === 'ball' && this.trainer ? "You can't catch a trainer's Pokémon" : null,
        onclick: () => (item.kind === 'ball' ? this.send({ type: 'ball', item: key }) : this.pickTarget(key)),
      }, h('span.icon', { class: `icon ico-${key}` }), h('span.mname', {}, item.name), h('span.count', {}, `×${count}`))
    })
    this.setMenu('Choose an item.', btns, () => this.showMain())
    this.menu.className = 'bmenu grid3'
  }

  pickTarget(itemKey) {
    const item = store.state.items[itemKey]
    const btns = store.state.team.map((m) => {
      const ok = item.kind === 'revive' ? m.hp <= 0 : m.hp > 0 && m.hp < m.maxHp
      return h('button.bbtn.party', { disabled: !ok, onclick: () => this.send({ type: 'item', item: itemKey, uid: m.uid }) },
        h('img.mini', { src: m.sprite, alt: '' }), h('span.mname', {}, `${m.name} Lv${m.level}`), hpBar(m.hp, m.maxHp, { small: true }), h('span.count', {}, `${m.hp}/${m.maxHp}`))
    })
    this.setMenu(`Use ${item.name} on which Pokémon?`, btns, () => this.showBag())
    this.menu.className = 'bmenu grid3'
  }

  showParty(forced) {
    const btns = store.state.team.map((m) => {
      const active = m.uid === this.me.uid && !forced
      return h('button.bbtn.party', {
        disabled: m.hp <= 0 || active,
        onclick: () => this.send({ type: 'switch', uid: m.uid }),
      }, h('img.mini', { src: m.sprite, alt: '' }), h('span.mname', {}, `${m.name} Lv${m.level}`), hpBar(m.hp, m.maxHp, { small: true }),
      h('span.count', {}, active ? 'In battle' : m.hp <= 0 ? 'Fainted' : `${m.hp}/${m.maxHp}`))
    })
    this.setMenu(forced ? 'Choose your next Pokémon!' : 'Switch to which Pokémon?', btns, forced ? null : () => this.showMain())
    this.menu.className = 'bmenu grid3'
  }
}

