import Phaser from 'phaser'
import './style.css'

const API = 'https://pokeapi.co/api/v2/pokemon'
const STARTER_ID = 1 // Bulbasaur
const WILD_ID = 19 // Rattata

const PLAYER_SPEED = 180 // px/s
const WILD_SPEED_PER_STAT = 1.5 // px/s per point of base speed
const SPRITE_SCALE = 1.5

async function fetchPokemon(id) {
  const res = await fetch(`${API}/${id}`)
  if (!res.ok) throw new Error(`PokeAPI ${id}: HTTP ${res.status}`)
  const data = await res.json()
  const stat = (name) => data.stats.find((s) => s.stat.name === name).base_stat
  return {
    id: data.id,
    name: data.name.charAt(0).toUpperCase() + data.name.slice(1),
    sprite: data.sprites.front_default,
    hp: stat('hp'),
    speed: stat('speed'),
  }
}

class WorldScene extends Phaser.Scene {
  constructor() {
    super('World')
  }

  create() {
    this.ready = false
    this.status = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Loading Pokémon…', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.cursors = this.input.keyboard.createCursorKeys()
    this.wasd = this.input.keyboard.addKeys('W,A,S,D')

    Promise.all([fetchPokemon(STARTER_ID), fetchPokemon(WILD_ID)])
      .then(([starter, wild]) => this.loadSprites(starter, wild))
      .catch((err) => {
        console.error(err)
        this.status.setText(`Failed to load Pokémon:\n${err.message}`)
      })
  }

  loadSprites(starter, wild) {
    this.load.image('starter', starter.sprite)
    this.load.image('wild', wild.sprite)
    this.load.once(Phaser.Loader.Events.COMPLETE, () => this.spawn(starter, wild))
    this.load.start()
  }

  spawn(starter, wild) {
    this.status.destroy()
    const { width, height } = this.scale

    this.player = this.physics.add
      .sprite(width * 0.25, height / 2, 'starter')
      .setScale(SPRITE_SCALE)
      .setCollideWorldBounds(true)

    this.wild = this.physics.add
      .sprite(width * 0.8, height * 0.3, 'wild')
      .setScale(SPRITE_SCALE)
      .setCollideWorldBounds(true)
    this.wildSpeed = wild.speed * WILD_SPEED_PER_STAT

    this.wildLabel = this.add
      .text(0, 0, `${wild.name}\nHP ${wild.hp}/${wild.hp}`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1)

    this.add.text(12, 12, `${starter.name}  ·  WASD / arrows to move`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff',
    })

    this.ready = true
  }

  update() {
    if (!this.ready) return

    // Player movement
    const left = this.cursors.left.isDown || this.wasd.A.isDown
    const right = this.cursors.right.isDown || this.wasd.D.isDown
    const up = this.cursors.up.isDown || this.wasd.W.isDown
    const down = this.cursors.down.isDown || this.wasd.S.isDown

    const dir = new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0))
    dir.normalize().scale(PLAYER_SPEED)
    this.player.setVelocity(dir.x, dir.y)
    if (dir.x !== 0) this.player.setFlipX(dir.x > 0) // front sprites face left

    // Wild Pokémon chases the player, stopping when it reaches them
    const dist = Phaser.Math.Distance.Between(this.wild.x, this.wild.y, this.player.x, this.player.y)
    if (dist > 48) {
      this.physics.moveToObject(this.wild, this.player, this.wildSpeed)
      this.wild.setFlipX(this.player.x > this.wild.x)
    } else {
      this.wild.setVelocity(0, 0)
    }

    this.wildLabel.setPosition(this.wild.x, this.wild.getTopLeft().y + 12)
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: 960,
  height: 640,
  backgroundColor: '#5a9e4b',
  pixelArt: true,
  physics: { default: 'arcade' },
  loader: { crossOrigin: 'anonymous' },
  scene: WorldScene,
})
