# 🛠️ KINGDOM — Technical Plan & Build Guide

_Bedrock Add-on (Behavior Pack + Resource Pack), plain JavaScript ES modules, no build step required._

## 1. Target stack (verified 2026-09)

| Piece | Version | Notes |
|---|---|---|
| Minecraft Bedrock (Android) | **1.21.60+** | stable Script API |
| `@minecraft/server` | **2.1.0** (manifest dep) | custom commands stable since 2.1.0 |
| `@minecraft/server-ui` | **2.0.0** | ActionFormData / ModalFormData |
| Language | JavaScript ESM | TypeScript optional later; plain JS ships directly |
| Package | `.mcaddon` (zip of BP + RP) | one-tap import on Android |

> Custom slash commands require a namespace, so the founding command is **`/kingdom:start`** (the engine rejects `/kingdom` without a namespace). The Royal Scepter item is an always-working alternative.

## 2. Repository layout

```
KINGDOM-/
├─ docs/
│  ├─ KINGDOM_Design.md        # full game design (140 features)
│  └─ TECHNICAL_PLAN.md        # this file
├─ packs/
│  ├─ BP_Kingdom/              # Behavior Pack (the brain)
│  │  ├─ manifest.json
│  │  ├─ scripts/
│  │  │  ├─ main.js            # bootstrap: commands, events, tick loops
│  │  │  ├─ core/              # state, names, clock, hud, economist
│  │  │  ├─ economy/           # buyers, pricebook, tax, market, finance, mint, bank
│  │  │  ├─ game/              # founding, menu, citizens, schedule, jobs,
│  │  │  │                     # movement, npcRegistry, dayroll, decrees
│  │  │  ├─ build/             # catalog, construction
│  │  │  ├─ social/            # family, housing
│  │  │  └─ world/             # harbor, migration
│  │  ├─ entities/  items/  blocks/  recipes/   # JSON content (later)
│  │  └─ structures/                            # blueprints (later)
│  └─ RP_Kingdom/              # Resource Pack (the looks; custom art later)
│     ├─ manifest.json
│     ├─ texts/en_US.lang
│     ├─ textures/  models/  sounds/  ui/
└─ tools/
   └─ package.sh               # zips packs/ → dist/KINGDOM.mcaddon
```

## 3. Save-data architecture

- One world dynamic property `kingdom:save_v1` holds a JSON document (M1 small; later sharded by domain: `kingdom:citizens`, `kingdom:ledger`, … because each property has a size cap).
- All mutation goes through `state.js` (`getState()/saveState()`); never store truth on NPC entities alone (they can die/despawn).
- Citizen record (v1):
```json
{ "id": "c-3", "entityId": "-2147...", "fullName": "Thomas Carter",
  "sex": "m", "role": "settler", "profession": "woodcutter",
  "ageStage": "adult", "ageDays": 0, "level": 1, "xp": 0,
  "wageMode": "crown", "wage": 6, "employer": "crown",
  "home": null, "spouse": null, "mood": 80, "health": 20,
  "status": "following" }
```
- Kingdom record: name, banner, difficulty, day, treasury, moneySupply, tax policy, population policy, decrees[], ledgers.

## 4. Core systems by milestone (mapped to design doc)

| Milestone | Systems | Key files | Status |
|---|---|---|---|
| M1 | `/kingdom:start` founding modal, Minister + 2M/2W settlers, scepter menu, clock HUD, day counter, save/load, economist tables | `main`, `state`, `founding`, `citizens`, `hud`, `clock`, `economist` | ✅ built |
| **M2 (current)** | follow/life orders, daily schedule state machine, needs & mood, XP/levels + speed, woodcutter/farmer/quarry labor loops, work-site zones, physical chest delivery, day-roll wages, death handling | `game/schedule`, `game/jobs`, `game/movement`, `game/npcRegistry`, `game/dayroll` (+ sim tests) | ✅ built |
| **M3 (built)** | warehouse chest routing, 7 licensed commodity buyer stalls, clerks, floats, quotas, price bands, A/B/C grades, crown salary vs freelance piece-rate, cart-runner consolidation, audit ledger (sharded saves v3) | `economy/buyers`, `economy/pricebook`, updated `jobs`/`dayroll`/`menu` | ✅ built |
| M4 | market sim, tax engine, Day Roll GDP/net profit, reports | `economy/tax`, `economy/market`, `economy/finance` | ✅ built |
| M5 | paper/ink/mint chain, inflation, bank loans & debt | `economy/mint`, `economy/bank` | ✅ built |
| M6 | decrees + deadlines + managers, blueprint & scepter construction, upgrades | `game/decrees`, `build/construction`, `build/catalog` | ✅ built |
| M7 | courtship, marriage requests, 6-day child aging, houses registry, schools | `social/family`, `social/housing` | ✅ built |
| M8 | recruitment missions, refugee ships, harbor trade events | `world/harbor`, `world/migration` | ✅ built |
| M9 | crime, courts, inspectors, guards/army, raids | `security/*` | ⬜ planned |
| M10 | seasons/weather/disease events, tech tree, railway/telegraph | `events/*`, `tech/tree` | ⬜ planned |
| M11 | co-op officer roles & permissions | `net/roles` | ⬜ planned |
| M12 | custom art/audio, command-parser polish, Android test & packaging | `RP_Kingdom/*` | ⬜ planned |

## 5. Engine rules we code around

- **Time:** default keeps vanilla 20-min cycle; `colonyHour = (world.getTimeOfDay()/1000 + 6) mod 24`. Day Roll fires when `world.getDay()` increments. Longer day presets (M-series) pause vanilla and script-drive time.
- **NPCs M1:** vanilla `minecraft:villager_v2` spawned by script with nameTags + registry tags; fully custom models arrive with the art pass (M12).
- **Economy ticks once per in-game day**, never per frame; HUD tick = 20 ticks; AI tick budgets throttled.
- **Currency is ledger-only** (no dropped coin entities).
- Everything player-facing goes through **server-ui forms** (thumb/touch friendly).

## 6. Build & test loop (Android)

1. Edit files under `packs/`.
2. Run `bash tools/package.sh` → `dist/KINGDOM.mcaddon`.
3. Copy to the phone (Drive/USB) and open with Minecraft → imports both packs.
4. Create world: enable both packs; (custom commands are stable API — no Beta experiment needed on 2.1.0).
5. Run `/kingdom:start`.
- Desktop quick-test: Windows Bedrock or the Minecraft Preview build; watch the content log for script errors.

## 7. Coding conventions

- One file per system; `main.js` only wires events.
- All rupee amounts are integers in **paise** internally (₹1 = 100 paise) to avoid float drift; display divides.
- Every new save field needs a `migrate()` case bumping `version`.
- No hard-coded balance numbers outside `economist.js` / data tables.
- Content boundary rules (design §27) are enforced in code: no coercion systems, all family formation is consent-gated.
