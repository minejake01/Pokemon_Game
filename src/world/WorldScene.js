import Phaser from 'phaser'
import { getWorld, isWalkable, biomeAt, zoneLevel, distFromTown, MAP_W, MAP_H, TILE, BLOCKING } from '../../shared/world.js'
import { buildTileset, buildTrainer, buildCenter } from './tiles.js'
import { api } from '../api.js'
import { store } from '../store.js'

const WALK = 150 // px/s
const RUN_MULT = 1.6
const MAX_WILDS = 9
const SPAWN_MIN = 7, SPAWN_MAX = 15 // tiles from the player
const DESPAWN_DIST = 26 // tiles
const WILD_SCALE = 0.62
const FOLLOW_GAP = 14 // trail samples between trainer and follower

export class WorldScene extends Phaser.Scene {
  constructor() {
    super('World')
  }

  init(data) {
    this.bridge = data.bridge
    this.world = getWorld(store.state.seed)
  }

  create() {
    if (!this.textures.exists('tiles')) {
      this.textures.addCanvas('tiles', buildTileset())
      this.textures.addSpriteSheet('trainer', buildTrainer(), { frameWidth: 24, frameHeight: 32 })
      this.textures.addCanvas('center', buildCenter())
    }
    this.buildMap()

    const { x, y } = store.state.pos
    this.player = this.physics.add.sprite(x, y, 'trainer', 0).setOrigin(0.5, 0.9)
    this.player.body.setSize(14, 10).setOffset(5, 21)
    this.player.setCollideWorldBounds(true)
    this.physics.world.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)
    this.physics.add.collider(this.player, this.groundLayer)
    this.physics.add.collider(this.player, this.decoLayer)

    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE)
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15)
    this.cameras.main.setRoundPixels(true)
    this.fitZoom()
    this.scale.on('resize', () => this.fitZoom())

    this.cursors = this.input.keyboard.createCursorKeys()
    this.keys = this.input.keyboard.addKeys('W,A,S,D,SHIFT')

    this.wilds = new Map() // spawnId -> { sprite, label, spawn, nextThink }
    this.wildGroup = this.physics.add.group()
    this.physics.add.collider(this.wildGroup, this.groundLayer)
    this.physics.add.collider(this.wildGroup, this.decoLayer)
    this.physics.add.overlap(this.player, this.wildGroup, (_, s) => this.touchWild(s.getData('spawnId')))

    this.trail = []
    this.follower = null
    this.followerSpecies = null
    this.loadQueue = Promise.resolve()
    this.unsub = store.subscribe(() => this.refreshFollower())
    this.events.once('shutdown', () => this.unsub())
    this.refreshFollower()

    this.cooldownUntil = this.time.now + 1500
    this.lastSent = { x, y }
    this.lastBiome = null
    this.atCenter = null
    this.battling = false
    this.despawnIds = []

    this.time.addEvent({ delay: 700, loop: true, callback: () => this.spawnTick() })
    this.time.addEvent({ delay: 1500, loop: true, callback: () => this.reportPosition() })
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.checkSurroundings() })
    // Reloaded mid-battle: resume it.
    if (store.state.inBattle) {
      this.battling = true
      this.time.delayedCall(300, () => {
        this.scene.pause()
        this.bridge.onBattle({ id: null }, () => {})
      })
    }
    this.events.on('resume', () => {
      this.input.keyboard.resetKeys()
      this.cooldownUntil = this.time.now + 1500
    })
  }

  fitZoom() {
    const z = Phaser.Math.Clamp(this.scale.height / (17 * TILE), 1, 2.5)
    this.cameras.main.setZoom(Math.round(z * 4) / 4)
  }

  buildMap() {
    const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: MAP_W, height: MAP_H })
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)
    const ground = [], deco = []
    for (let y = 0; y < MAP_H; y++) {
      ground.push(Array.from(this.world.ground.subarray(y * MAP_W, (y + 1) * MAP_W)))
      deco.push(Array.from(this.world.deco.subarray(y * MAP_W, (y + 1) * MAP_W)))
    }
    this.groundLayer = map.createBlankLayer('ground', tileset).putTilesAt(ground, 0, 0)
    this.decoLayer = map.createBlankLayer('deco', tileset).putTilesAt(deco, 0, 0)
    this.groundLayer.setCollision([...BLOCKING])
    this.decoLayer.setCollision([...BLOCKING])

    for (const c of this.world.centers) {
      this.add.image((c.x + 0.5) * TILE, (c.y + 1) * TILE + 6, 'center').setOrigin(0.5, 1).setDepth((c.y + 1) * TILE)
    }
  }

  // ---- Follower (lead Pokémon walks behind the trainer) --------------------
  refreshFollower() {
    const lead = store.state?.team.find((m) => m.hp > 0) ?? store.state?.team[0]
    if (!lead || lead.speciesId === this.followerSpecies) return
    this.followerSpecies = lead.speciesId
    const key = `pk${lead.speciesId}`
    this.ensureTexture(key, lead.sprite).then(() => {
      if (this.followerSpecies !== lead.speciesId) return
      if (this.follower) this.follower.setTexture(key)
      else this.follower = this.add.image(this.player.x, this.player.y, key).setScale(0.5).setOrigin(0.5, 0.85)
    })
  }

  ensureTexture(key, url) {
    if (this.textures.exists(key)) return Promise.resolve(true)
    this.loadQueue = this.loadQueue.then(() => new Promise((resolve) => {
      if (this.textures.exists(key)) return resolve(true)
      const done = (ok) => {
        this.load.off(`filecomplete-image-${key}`)
        this.load.off('loaderror', onErr)
        resolve(ok)
      }
      const onErr = (file) => file.key === key && done(false)
      this.load.once(`filecomplete-image-${key}`, () => done(true))
      this.load.on('loaderror', onErr)
      this.load.image(key, url)
      this.load.start()
    }))
    return this.loadQueue.then(() => this.textures.exists(key))
  }

  // ---- Wild Pokémon --------------------------------------------------------
  async spawnTick() {
    if (this.battling || this.spawnBusy) return
    const ptx = Math.floor(this.player.x / TILE), pty = Math.floor(this.player.y / TILE)

    for (const [id, w] of this.wilds) {
      if (Phaser.Math.Distance.Between(w.sprite.x, w.sprite.y, this.player.x, this.player.y) > DESPAWN_DIST * TILE) {
        this.removeWild(id)
        this.despawnIds.push(id)
      }
    }
    if (this.despawnIds.length >= 4) api.despawn(this.despawnIds.splice(0)).catch(() => {})

    if (this.wilds.size >= MAX_WILDS) return
    let tx, ty, ok = false
    for (let i = 0; i < 12 && !ok; i++) {
      const a = Math.random() * Math.PI * 2, d = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN)
      tx = Math.floor(ptx + Math.cos(a) * d)
      ty = Math.floor(pty + Math.sin(a) * d)
      ok = isWalkable(this.world, tx, ty) && distFromTown(tx, ty) >= 8
    }
    if (!ok) return
    this.spawnBusy = true
    try {
      const { spawn } = await api.spawn(tx, ty)
      if (spawn && (await this.ensureTexture(`pk${spawn.speciesId}`, spawn.sprite)) && !this.battling) this.addWild(spawn)
    } catch (err) {
      console.warn('spawn failed', err)
    } finally {
      this.spawnBusy = false
    }
  }

  addWild(spawn) {
    const sprite = this.wildGroup.create((spawn.tx + 0.5) * TILE, (spawn.ty + 0.5) * TILE, `pk${spawn.speciesId}`)
    sprite.setScale(WILD_SCALE).setOrigin(0.5, 0.75).setData('spawnId', spawn.id).setAlpha(0)
    sprite.body.setSize(40, 30).setOffset(28, 50)
    sprite.setCollideWorldBounds(true)
    this.tweens.add({ targets: sprite, alpha: 1, duration: 400 })
    const label = this.add.text(sprite.x, sprite.y, `Lv${spawn.level}`, {
      fontFamily: 'monospace', fontSize: '10px', color: '#fff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 1)
    if (spawn.aggressive) label.setColor('#ffb3b3')
    this.wilds.set(spawn.id, { sprite, label, spawn, nextThink: 0 })
  }

  removeWild(id) {
    const w = this.wilds.get(id)
    if (!w) return
    w.sprite.destroy()
    w.label.destroy()
    this.wilds.delete(id)
  }

  clearWilds() {
    for (const id of [...this.wilds.keys()]) this.removeWild(id)
  }

  thinkWild(w, time) {
    const s = w.sprite
    const d = Phaser.Math.Distance.Between(s.x, s.y, this.player.x, this.player.y)
    if (w.spawn.aggressive && d < 5 * TILE && time > this.cooldownUntil) {
      this.physics.moveToObject(s, this.player, 85)
    } else if (time > w.nextThink) {
      w.nextThink = time + 900 + Math.random() * 2200
      if (Math.random() < 0.4) s.setVelocity(0, 0)
      else {
        const a = Math.random() * Math.PI * 2
        s.setVelocity(Math.cos(a) * 40, Math.sin(a) * 40)
      }
    }
    if (s.body.velocity.x !== 0) s.setFlipX(s.body.velocity.x > 0) // front sprites face left
    s.setDepth(s.y)
    w.label.setPosition(s.x, s.y - 44).setDepth(s.y + 1)
  }

  touchWild(spawnId) {
    if (this.battling || this.time.now < this.cooldownUntil) return
    const w = this.wilds.get(spawnId)
    if (!w) return
    this.battling = true
    this.player.setVelocity(0, 0)
    for (const o of this.wilds.values()) o.sprite.setVelocity(0, 0)
    this.reportPosition(true)
    this.cameras.main.flash(250, 255, 255, 255)
    this.time.delayedCall(260, () => {
      this.scene.pause()
      this.bridge.onBattle(w.spawn, () => this.removeWild(spawnId))
    })
  }

  // Called by main after a battle closes.
  afterBattle({ respawn } = {}) {
    this.battling = false
    if (respawn) {
      this.player.setPosition(respawn.x, respawn.y)
      this.trail = []
      this.clearWilds()
      this.cameras.main.fadeIn(500)
    }
    this.scene.resume()
  }

  // ---- Periodic checks -----------------------------------------------------
  reportPosition(force = false) {
    const { x, y } = this.player
    if (!force && Math.abs(x - this.lastSent.x) + Math.abs(y - this.lastSent.y) < 4) return
    this.lastSent = { x, y }
    return api.position(Math.round(x), Math.round(y)).catch(() => {})
  }

  checkSurroundings() {
    if (this.battling) return
    const tx = Math.floor(this.player.x / TILE), ty = Math.floor(this.player.y / TILE)
    const biome = biomeAt(this.world, tx, ty)
    const zl = zoneLevel(tx, ty)
    if (biome !== this.lastBiome || zl !== this.lastZone) {
      const changed = biome !== this.lastBiome
      this.lastBiome = biome
      this.lastZone = zl
      this.bridge.onBiome(biome, zl, changed)
    }
    this.bridge.onMove(tx, ty)

    const c = this.world.centers.find((cc) => cc.x === tx && cc.y === ty)
    if (c && this.atCenter !== c.id) {
      this.atCenter = c.id
      this.player.setVelocity(0, 0)
      this.reportPosition(true).then(() => this.bridge.onCenter(c))
    } else if (!c && this.atCenter) {
      const prev = this.world.centers.find((cc) => cc.id === this.atCenter)
      if (Math.abs(prev.x - tx) + Math.abs(prev.y - ty) > 1) this.atCenter = null
    }
  }

  update(time) {
    if (this.battling || !this.bridge.canMove()) {
      this.player.setVelocity(0, 0)
      return
    }
    const k = this.keys, c = this.cursors
    const dx = (c.right.isDown || k.D.isDown ? 1 : 0) - (c.left.isDown || k.A.isDown ? 1 : 0)
    const dy = (c.down.isDown || k.S.isDown ? 1 : 0) - (c.up.isDown || k.W.isDown ? 1 : 0)
    const v = new Phaser.Math.Vector2(dx, dy).normalize().scale(WALK * (k.SHIFT.isDown ? RUN_MULT : 1))
    this.player.setVelocity(v.x, v.y)
    const moving = dx !== 0 || dy !== 0
    if (dx !== 0) this.player.setFlipX(dx < 0)
    this.player.setFrame(moving && Math.floor(time / 140) % 2 ? 1 : 0)
    this.player.setDepth(this.player.y)

    if (moving) {
      const last = this.trail[this.trail.length - 1]
      if (!last || Math.abs(last.x - this.player.x) + Math.abs(last.y - this.player.y) > 2) {
        this.trail.push({ x: this.player.x, y: this.player.y })
        if (this.trail.length > 60) this.trail.shift()
      }
    }
    if (this.follower) {
      const p = this.trail[Math.max(0, this.trail.length - FOLLOW_GAP)] ?? { x: this.player.x - 20, y: this.player.y }
      this.follower.x += (p.x - this.follower.x) * 0.25
      this.follower.y += (p.y - this.follower.y) * 0.25
      if (Math.abs(p.x - this.player.x) > 1) this.follower.setFlipX(this.player.x > this.follower.x)
      this.follower.setDepth(this.follower.y)
    }

    for (const w of this.wilds.values()) this.thinkWild(w, time)
  }
}

