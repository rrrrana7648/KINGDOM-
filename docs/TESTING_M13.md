# KINGDOM M13 — Testing the hundred-features dawn (v0.13.0)

Manual in-game checklist: scepter → the four new halls (**🏛️ Court & Society · 🧭 Ventures & Exchange · 🏭 Industry & Workforce · 🛡️ Garrison & Shadows**) or chat (`!help` page 2). Automated: `node --no-warnings --loader ./loader.mjs run-sim.mjs` from `tools/sim` (M13 block ≈ 85 asserts).

## 1. Prestige & tiers (🏛️ Court)
1. Day 1: report shows `⛺ Camp` + `ventures ±₹0`.
2. Raise roofs, coin, souls: score climbs (soul ×2, building ×10, wonder ×50, tech ×15); at 100+ → `🏡 Hamlet` fanfare, mood +5.
3. Score 250+ with roofs & philosophy → `🏘️ Town`: knighthoods & charters unlock.
4. `!knight` before Town: refused (dignity). After: `Arise, Sir …!`, name-tag shows ⚔️.

## 2. Desks, calendar, honors, census
1. 🏛️ → 🪑: name a Foreman + Farm Master (felons & the Minister rejected).
2. At dawn: foreman +1 labor on active sites; farm master +6 rations (needs a farm zone); overseer +3 stone.
3. 🗓️: enable sabbath — every 7th dawn `🔕 Sabbath` line, shifts rest, mood +2.
4. Feast day: on season feast day `🍰` line, food −1/soul, mood +4 (skipped if the granary is bare).
5. ⚔️: knight any adult (treasury −100); medal a 60xp+ guard (−25); paint a house crest (−15, `crest` on the plaque, residents +mood).
6. 📋: every 10th dawn `📋 CENSUS` line + history; a 2000xp master auto-retires → `👴` line, ₹3/day pension line, salary stops.

## 3. Ventures (🧭)
1. Stockpile 32 oak logs → 🐪 timber train: 10% drover fee upfront, departs; 4 dawns later `🏁` profit line (value ×1.3–1.7). Guards cut bandit risk.
2. Citizens with 50+ savings → 📜 issue bonds: treasury +₹50 each; every 10th dawn coupon line (₹2.5 each); redeem returns face.
3. 📋 post oak commission (64/₹48) → contractor takes it: pace + warehouse releases fill it; `✅` line, payout, contractor keeps 40%.
4. 📑 build Insurance Office, buy fire cover (₹3/day, ₹2 with a fire station); tenement fire: `🚒 contained` if a fire station stands (70%), else `🔥` + `underwriters pay ₹150`.
5. 🏷️ pawn: build the shop; a broke citizen pawns (₹8 now, ₹10 due in 5 days); default forfeits their tool edge. Banned desks breed fence lots.
6. 🔨: racket contraband (below) appears as a lot; one lot hammers per dawn (×1.5 with the house).
7. `!contract 1`, `!caravan grain`, `!bonds 2` work from chat.

## 4. Satellites & expeditions
1. Town tier, 4 spare souls + governor, ₹200 → 🏘️ charter "Newfield": party emigrates, village listed; every 5th dawn `🌾` tithe (₹20 + 10 grain at 5 souls, loyalty-gated).
2. Sullen capital (low mood) at tithe dawn: excuses instead of tithes; telegraphs steady loyalty.
3. 🧭 launch seam survey (leader + crew): souls `away` (name-tag 🧭, eat from packs); return dawn loot (14 raw iron at neutral lots) + 30xp each. Ruins feed the museum; trappers coin furs; beasts boost prestige.

## 5. Industry (🏭)
1. Stockpile 2+ logs → order wood tools: forged next dawn, issued free to crown trades (`🪓` lines), speed visibly faster (wood ×1.05 … diamond ×1.5).
2. Crown/self policy toggle; self: a freelancer with savings buys their own edge at canteen prices (iron ₹25).
3. 🙋 workload: three open build decrees → `🙋` decision at dawn → Audiences → hire: arrivals next dawn. Toggle auto-hire + budget: hires within budget automatically (₹5/head).

## 6. Garrison & shadows (🛡️)
1. Stockpile 2 iron + 1 log → forge musket; or buy (₹15 each, racks hold 10 without a hall). Defense = 10/armed guard (min with muskets); fortress +20/lv; drill yard +6xp/guard/dawn.
2. Post guards unarmed: `⚠️ musket-less` line; arm them: raid power jumps.
3. 🕵️ plant agent (₹60): dispatches land (raid warnings, tips); hire counter-spy (₹30): enemy leaks end, spies get turned (+₹15 on the spy card).
4. 🌙 ring curfew: crime pressure −0.1; citizens keep home nights, unrest −1.5/dawn, mood −1/dawn.
5. Win a raid: `🎖️ VICTORY PARADE` line, mood +4.

## 7. New fate cards
1. Few guards + poor town → 🗡️ racket decision: pay (−₹60, shame) or raid (2+ guards → contraband lot + cheers; else a stall shutters).
2. Rich treasury → 👑 tribute decision: pay (−₹100) or steel (win → ballads +mood; lose → −15%).
3. 3+ buildings → ⛰️ quake line (fortress softens); farm zone → 🦠 blight (Farm Master halves); harbor → 🐟 run day; guards → 🧭 rescued travelers arrive as hires; 4+ adults → 🦊 trapper coin; 2+ guards → 🎺 band mood.

## 8. Offices & old math (regression)
1. All M4–M12 checklists still pass; sim `🎉 ALL SIM TESTS PASSED`, zero warnings.
2. Exact-coin asserts (riot −₹59, loot quarter, coupon ₹2.5) unchanged — M13 ticks are silent on legacy saves.
3. Chat: `!knight`, `!medal`, `!literacy`, `!caravan`, `!bonds`, `!contract`, `!village`, `!voyage`, `!agent`, `!musket` all gated by writs; `!help` lists page 2.
