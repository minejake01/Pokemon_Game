// Turns raw numbers (stats, upgrade picks) into capped "game numbers", shared by server and client.
// Every bonus has a hard ceiling so no Pokémon (or trainer) can become too strong.

// Level-up upgrade cards. Each pick adds a stack; the bonus grows with diminishing returns
// towards `max` and never reaches it: bonus = max × (1 − 0.85^stacks).
export const UPGRADES = {
  damage: { name: 'More Damage', icon: '⚔️', scope: 'mon', max: 0.5, desc: 'This Pokémon deals more damage with every move.' },
  speed: { name: 'Faster Attacks', icon: '⚡', scope: 'mon', max: 0.5, desc: 'Raises Speed, so this Pokémon strikes first more often.' },
  walk: { name: 'Faster Walking', icon: '👟', scope: 'player', max: 0.4, desc: 'You walk and run faster in the overworld.' },
}
export const UPGRADE_KEYS = Object.keys(UPGRADES)

export function upgradeBonus(key, stacks = 0) {
  return UPGRADES[key].max * (1 - 0.85 ** Math.max(0, stacks))
}

// Attack ÷ Defense is clamped so a huge stat gap can't one-shot everything.
export const STAT_RATIO_LIMIT = 3
export const clampRatio = (r) => Math.min(STAT_RATIO_LIMIT, Math.max(1 / STAT_RATIO_LIMIT, r))

// Raw stats + upgrade stacks → the numbers battles actually use.
export function gameStats(raw, boosts = {}) {
  return {
    ...raw,
    spe: Math.round(raw.spe * (1 + upgradeBonus('speed', boosts.speed))),
    power: 1 + upgradeBonus('damage', boosts.damage),
  }
}

export const pctText = (x) => `+${Math.round(x * 100)}%`
