# PRD #5: Poke Arena

| | |
|---|---|
| Status | v1 – ready to build |
| Platform | Desktop web browser (keyboard + mouse) |
| Stack | Phaser 3 + Vite client, Node game server (runs inside the Vite dev server and standalone) |
| Data source | PokéAPI (Gen 1 data baked into the server at build time) |

---

## 1. Summary

Poke Arena is a single-player, open-world Pokémon game set in one large, continuous overworld split into biomes. The player picks one of three Gen 1 starters, explores, battles and catches wild Pokémon, and manages a team of up to 5. The player **wins** by catching all 151 Gen 1 Pokémon and **loses** when their whole team faints with no Revives left.

All game-critical numbers — Pokémon stats, what spawns where, battle results, catch rolls and what the player owns — are decided by the **server**. The browser only draws the world and sends the player's choices.

## 2. Goals

1. Recreate the core Pokémon loop: **explore → encounter → battle → catch → grow the team → explore further.**
2. Make the world feel open: no loading screens between areas, biomes blend together, and you can walk anywhere that isn't water or an obstacle.
3. Make completion (151/151) a long-term goal that rewards visiting every biome and the harder areas far from the start.
4. Make Revives the player's "lives", so the lose condition creates real tension.
5. Make the server the single source of truth, so the client can't fake stats, catches or encounters.

## 3. Starters

| Dex # | Pokémon | Type | Starting level |
|---|---|---|---|
| 1 | Bulbasaur | Grass / Poison | 5 |
| 4 | Charmander | Fire | 5 |
| 7 | Squirtle | Water | 5 |

The player chooses one on the New Game screen. The chosen starter counts as **caught** in the Pokédex.

## 4. Core Gameplay Loop

1. The player walks the overworld (Main Game Screen).
2. Wild Pokémon roam the world as visible sprites near the player. Some wander and some chase the player.
3. Touching a wild Pokémon starts a **battle** (Battle Screen).
4. In battle the player can fight, throw a Poké Ball, use an item, switch Pokémon or run.
5. Winning gives XP (level ups, new moves, evolution) and money. Catching adds the Pokémon to the team or the PC box and to the Pokédex.
6. The player heals and restocks at **Poké Centers** scattered across the world.
7. Areas farther from the starting town have higher-level Pokémon and rarer species.

## 5. Screens

### 5.1 Title Screen
- Game logo, animated background and the three starters' sprites.
- **Continue** – shown only if the server has a save for this browser that isn't game-over.
- **New Game** – asks for a trainer name (1–12 characters), then shows a starter choice of three cards (sprite, name, type). Confirming creates a new save on the server and replaces any old one for this browser.
- Shows the controls.

### 5.2 Main Game Screen (overworld)
- Top-down tile world rendered by Phaser; the camera follows the trainer.
- The trainer is drawn as a small character; the lead team Pokémon follows behind.
- **HUD** (always visible):
  - Current biome name and its wild level range
  - Money (₽)
  - Pokédex progress: `Caught X / 151`
  - Team strip: the 5 team slots with a mini sprite and HP bar each
  - **Minimap** (top-right): biome colours, Poké Centers, player position
  - Hints: `B` Backpack, `M` toggle minimap
- Walking onto a Poké Center opens the Poké Center panel.
- Short toasts for events ("Saved", "Entered Swamp").

### 5.3 Battle Screen
- Classic layout: the wild Pokémon top-right (front sprite) and the player's Pokémon bottom-left (back sprite), each with name, level, type badges and an animated HP bar. The player's side also shows HP numbers and an XP bar.
- Background tinted to the biome the battle started in.
- Message box that plays the server's battle events one at a time (click / Space / Enter to advance).
- Command menu: **FIGHT**, **BAG**, **POKéMON**, **RUN**.
  - FIGHT: up to 4 moves with type, power and a hint of how effective each would be.
  - BAG: Poké Balls (throw) and medicine (use on a team member).
  - POKéMON: switch to another conscious team member (uses your turn). Forced and free when the active Pokémon faints.
  - RUN: try to escape.
- Animations: attack lunge, hit flash, HP drain, faint drop, ball throw with 0–3 shakes, catch confirmation.

### 5.4 Backpack
Opened with `B` or the HUD button (not available during battle). It has four tabs:
- **Items** – each item's count and description; Potions / Super Potions / Revives can be used on a team member.
- **Team** – the 5 team slots with full details (stats, moves, XP to next level). Reorder with ▲/▼ (slot 1 leads in battle), or send a member to the Box (at least one conscious Pokémon must stay on the team).
- **Box (PC)** – every caught Pokémon not on the team. Move one to the team if there is a free slot.
- **Pokédex** – a grid of #001–#151. Unseen entries show `???`, seen ones show a silhouette, caught ones show the full sprite, types and the biomes it lives in.

### 5.5 Extra overlays (not separate screens)
- **Poké Center panel** – Heal team, Poké Mart (buy items), Close.
- **Game Over** – shown when the lose condition is met. The save is closed and the only option is New Game.
- **Victory** – shown the moment the 151st species is caught. It shows stats (time played, battles, catches) and lets the player keep exploring.

## 6. World & Biomes

### 6.1 Map
- One continuous **180 × 180 tile** map (32 px tiles), surrounded by ocean.
- The map is generated from a **world seed** chosen by the server for each save. The same seed always gives the same world, and the server and client run the same shared generator, so the server always knows the biome of any tile.
- **Starting Town** is in the centre: a cleared plaza with the first Poké Center.
- About **15 Poké Centers** are spread across the map on a jittered grid, so every biome has at least one.
- Tiles are either walkable ground or blocking (water, trees, boulders, dead trees, lava rocks). Obstacles are sparse enough that land areas stay connected.

### 6.2 Biomes
Biomes come from noise layers for elevation, temperature (colder to the north, hotter to the south) and moisture.

| Biome | Where | Look | Main types (spawn affinity) |
|---|---|---|---|
| Meadow | Mild, average moisture | Bright grass, flowers, few trees | Normal, Flying, Electric, Bug, Grass |
| Forest | Mild, wet | Dark grass, dense trees | Grass, Bug, Poison, Psychic, Normal |
| Swamp | Very wet, low-lying | Murky green-brown mud, dead trees | Poison, Ghost, Water, Grass |
| Snowfield | Cold north | White snow, pines | Ice, Water, Psychic |
| Mountain | High elevation | Grey rock, boulders | Rock, Ground, Fighting, Psychic, Electric, Dragon |
| Volcano | Hot, dry south | Dark ash, lava rocks | Fire, Rock, Ground |
| Lakeshore | Next to water | Sand beaches | Water, Flying, Dragon |

All 15 Gen 1 types appear in at least one biome, so **every one of the 151 species can be found in the wild somewhere.**

### 6.3 Difficulty by distance
- Wild level = `3 + 0.55 × max(0, distance from town centre − 8)` (distance in tiles), ±2 at random, minimum 2, capped at 60. No wild Pokémon spawn inside Starting Town (radius 8).
- The HUD shows the current zone's level range.

## 7. Pokémon

### 7.1 Species data (server)
For each of the 151 species: Dex number, name, **Gen 1 types** (e.g. Clefairy is Normal and Magnemite is pure Electric), base stats (HP, Attack, Defense, Sp. Atk, Sp. Def, Speed), catch rate, base XP, level-up evolution (target and level) and the minimum level it naturally appears at.

### 7.2 Individual Pokémon
- Each one has a unique id, species, level (1–100), XP, **IVs** (0–31 per stat, rolled by the server) and current HP.
- Stats use the standard formulas:
  - HP = ⌊(2·Base + IV)·L/100⌋ + L + 10
  - Other stats = ⌊(2·Base + IV)·L/100⌋ + 5
- XP curve is "medium fast": XP needed to reach level L = L³.

### 7.3 Moves
- There is a move pool for each type. Each move has a level it is learned at, power, accuracy and a Gen 1-style category: Fire, Water, Grass, Electric, Ice, Psychic and Dragon moves are **special**; everything else is **physical**.
- A Pokémon knows up to 4 moves picked automatically from its types' pools plus the Normal pool, based on its level. Its newest and strongest moves replace older ones, and there's no move-learning prompt.
- Special effects supported: **drain** (heal 50% of damage dealt), **fixed damage** (Dragon Rage = 40, Night Shade / Seismic Toss = user's level), **priority** (Quick Attack goes first) and **multi-hit**.

### 7.4 Evolution
- When a Pokémon reaches its species' evolution level it evolves at the end of battle. It keeps its IVs, its HP stays at the same percentage and the new species is marked caught.
- Evolutions by stone, trade or friendship don't exist in v1. Those species (e.g. Raichu, Alakazam, Vaporeon) can only be caught in the wild.

## 8. Battle System (server-decided)

- One-on-one wild battles.
- **Turn order:** priority first, then higher Speed, with random tie-breaks. Items, balls, switching and running always go before the wild Pokémon's move.
- **Damage:** `((2L/5 + 2) · Power · A/D) / 50 + 2`, multiplied by STAB (1.5), type effectiveness (Gen 1 chart with Ghost → Psychic fixed to 2×), a critical hit (1/16 chance, 1.5×) and a random factor of 0.85–1.00. Minimum 1 damage unless the target is immune.
- **Accuracy:** each move rolls against its accuracy.
- **Wild AI:** picks a move at random, weighted towards higher expected damage.
- **Running:** succeeds automatically if your Speed ≥ theirs; otherwise the chance is 50% + 15% per earlier failed attempt in this battle.
- **XP:** `baseXP · wildLevel / 7` goes to the Pokémon that knocked out the wild Pokémon.
- **Money:** ₽ `wildLevel × 20` for knocking out a wild Pokémon.
- **Fainting:** a fainted Pokémon can't battle until revived. When the active Pokémon faints and there is another conscious one, the player must switch.

## 9. Capturing

| Ball | Multiplier | Price |
|---|---|---|
| Poké Ball | 1× | ₽200 |
| Super Ball | 1.5× | ₽600 |
| Ultra Ball | 2× | ₽1,200 |

- Catch value: `a = ((3·MaxHP − 2·HP) · CatchRate · Ball) / (3·MaxHP)`, capped at 255. Catch chance is `a / 255`.
- The server returns the number of shakes (0–3) and whether the catch worked. The client animates it.
- A caught Pokémon keeps its current HP. It joins the team if there are fewer than 5 members; otherwise it goes to the Box.
- Every wild Pokémon you battle is marked **seen**; catching marks it **caught**.

## 10. Items

| Item | Effect | Price | Starting count |
|---|---|---|---|
| Poké Ball | Catch, 1× | ₽200 | 10 |
| Super Ball | Catch, 1.5× | ₽600 | 3 |
| Ultra Ball | Catch, 2× | ₽1,200 | 1 |
| Potion | Restore 20 HP | ₽300 | 3 |
| Super Potion | Restore 60 HP | ₽700 | 1 |
| Revive | Revive a fainted Pokémon to 50% HP | ₽1,500 | 3 |

Starting money: ₽3,000.

## 11. Team & Storage
- **Up to 5 Pokémon on the team.** Slot 1 is sent out first.
- Unlimited **Box** storage for everything else.
- At least one conscious Pokémon must stay on the team when moving others to the Box.

## 12. Poké Centers & Economy
- **Heal:** restores full HP to every **conscious** team member, for free. **Fainted Pokémon are not revived at Poké Centers; only Revives bring them back.** This keeps Revives meaningful as "lives".
- **Poké Mart:** buy any item from §10 with money.
- Visiting a Center makes it the respawn point.

## 13. Win & Lose

### Lose
At the end of any battle in which **every team member has fainted**:
- If the player has **at least 1 Revive**, one is used automatically on the lead Pokémon (back at 50% HP) and the player is sent back to the last Poké Center they visited.
- If the player has **0 Revives**, it's **Game Over**: the save is marked finished and the Game Over overlay appears.

### Win
- Catch all **151** species (evolving into a species counts). The Victory overlay appears once, and the player can keep playing afterwards.

## 14. Server Responsibilities ("Server decides")

| Concern | Server's role |
|---|---|
| Pokémon stats | Owns species base stats, IV rolls, stat formulas, levels, XP and evolution |
| Spawn chances | Picks the species and level for each wild spawn based on the biome at the requested tile, species rarity (catch rate), level gating and distance |
| Pokémon you have | Owns team, box, Pokédex (seen/caught), items and money |
| Battles | Runs every turn (damage, accuracy, crits, catch rolls, run rolls, AI) and returns a list of events for the client to animate |
| Persistence | Saves each player as JSON on disk after every change |

The client never sends stats or results, only intentions ("use move 2", "throw a Super Ball", "spawn something near tile (x, y)").

### 14.1 Spawn weighting
`weight(species, biome) = rarity × affinity × levelGate`
- `rarity` = catchRate / 255
- `affinity` = the highest biome affinity among the species' types (0 means it never spawns in that biome)
- `levelGate` = 1 if the zone level ≥ the species' natural minimum level, otherwise 0.1
- **Legendaries** (Articuno – Snowfield, Zapdos – Mountain, Moltres – Volcano, Mewtwo – Mountain, Mew – Forest) only spawn in their own biome, in zones of level 35 and above, with a fixed small weight.

### 14.2 HTTP API (JSON, `/api/*`, player id in the `X-Player-Id` header)

| Method & path | Purpose |
|---|---|
| `POST /api/new` | Create a save `{name, starter}` → `{playerId, state}` |
| `GET /api/state` | Full player state |
| `GET /api/dex` | All 151 species (name, types, sprite, habitats) |
| `POST /api/position` | Save trainer position `{x, y}` |
| `POST /api/spawn` | Ask for a wild spawn at tile `{tx, ty}` → spawn or `null` |
| `POST /api/battle/start` | Start a battle with a spawn `{spawnId}` |
| `POST /api/battle/action` | `{type: move\|ball\|item\|switch\|run, …}` → `{events, battle, state}` |
| `POST /api/item/use` | Use medicine outside battle `{item, uid}` |
| `POST /api/team/move` | Move a Pokémon between team and box `{uid, to}` |
| `POST /api/team/order` | Reorder the team `{uids}` |
| `POST /api/center/heal` | Heal at a center `{centerId}` |
| `POST /api/mart/buy` | Buy `{item, qty}` |

## 15. Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Move |
| Shift (hold) | Run (1.6× speed) |
| B | Open / close the Backpack |
| M | Toggle the minimap |
| Space / Enter / click | Advance battle text, confirm |
| Esc | Close a panel / go back in battle menus |
| Mouse | All menus are clickable |

## 16. Technical Architecture

```
shared/world.js        – deterministic world generator (used by client AND server)
server/data/pokemon.json – 151 species, generated by scripts/build-data.mjs from PokéAPI
server/game/*          – species, moves, type chart, encounters, battle engine, items, store
server/api.js          – HTTP router (plain Node, no framework)
server/index.js        – standalone production server (serves dist/ + API)
vite.config.js         – mounts the same API inside the dev server
src/                   – Phaser world scene + DOM screens (title, battle, backpack, overlays)
```
- `npm run dev` starts the game and the server together on one port.
- `npm run build && npm start` runs it in production.
- Saves are stored in `server/saves/` (git-ignored).
- Sprites come from the PokéAPI sprites repository on GitHub.

## 17. Acceptance Criteria
1. You can start a new game with any of the three starters, and it continues after a page reload.
2. The world has all 7 biomes, Poké Centers and water borders, and is generated the same way every time for the same save.
3. Walking around causes visible wild Pokémon to appear that match the current biome (e.g. Ice types in Snowfield).
4. Battles show correct type effectiveness, STAB, XP, level ups and evolution.
5. All three ball types work, with their 1×/1.5×/2× effect applied by the server.
6. The team never has more than 5 Pokémon; extras go to the Box and can be swapped in the Backpack.
7. A team wipe with Revives uses one and respawns you; a team wipe with no Revives ends the game.
8. Catching the 151st species shows the Victory overlay.
9. Editing client code or requests can't change stats or catch results (the server validates everything).

## 18. Out of Scope (v1)
1. Gen 2 or later Pokémon.
2. Gen 2 or later types (Dark, Steel, Fairy).
3. Status conditions (poison, sleep, paralysis…) and stat-changing moves.
4. Trainer battles, gyms, NPC dialogue and a story.
5. Stone, trade and friendship evolutions.
6. Multiplayer, trading and accounts (a save is tied to a browser through a random player id).
7. Mobile and touch controls, audio.
