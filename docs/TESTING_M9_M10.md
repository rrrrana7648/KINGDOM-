# Testing M9 (Justice) & M10 (Sky, Health, Fate, Research)

Manual in-game checklist. Headless coverage: `cd tools/sim && node --no-warnings --loader ./loader.mjs run-sim.mjs`.

## M9 — Crime, courts, guards, unrest

1. **First blood**: found, release all, advance several dawns. Watch for 🌑 crime
   lines in the morning report (theft/smuggling/bribery/assault).
2. **Investigations**: open ⚖️ Court & Watch → 🌑 Investigations. Evidence should
   climb faster after posting guards.
3. **Post the watch**: 🛡️ Royal Guard → post 2 guards (₹12/day). They patrol the
   town anchor by day (⛏ icon) and alternate 🌙 night watches. HUD Security rises.
4. **The docket**: when a case hits trial, ⚖️ The docket lists it with the tariff.
   Sentence each way across cases: fine (treasury + fines line), prison (⛓ gang
   breaks cobble, release line), banish (estate seized, citizen gone), acquit.
5. **Neglect**: leave a trial 4+ dawns — the suspect flees (🥷). Post a bounty;
   hunters should drag them back within a few dawns (faster with constables).
6. **Laws**: 📜 amend theft fine → new sentences use it; strikes ≥ banishAfter show
   BANISH advice.
7. **Militia**: ⚔️ conscript 4 (₹20 bonus). Rating jumps; muster expires in 5 days.
8. **Raid**: with 0 guards and a fat treasury, raids come within ~10 dawns
   (🛡️ RAID! loot/granary/repairs/wounded). With 4+ guards, raids are repelled
   (+20xp, cheers). Verify `lastRaidDay` cooldown (~5 days).
9. **Unrest ladder**: set income 40% + sales 30% with an empty granary. Expect 📢
   petitions → ✊ protest (strike day, shifts idle) → 🔥 riot (damage, pressure
   vents) → ⚔️ rebellion (crushed with guards, sacks treasury without).
10. **Inspectors**: post an inspector; buyer skimming (embezzle cases) should get
    caught faster (trial-ready audits).

## M10 — Seasons, health, events, research

1. **The year**: 10-day seasons Spring→Summer→Autumn→Winter; HUD sky line shows
   season/weather. Summer brings monsoon 🌧️/⛈️, Winter 🧊 frost.
2. **Storm bound**: on ⛈️ storm dawns, outdoor crews shelter (no deliveries);
   guards still patrol. Frost/foul weather slows construction.
3. **Farmers & sky**: heatwave/drought cut harvests; research 💧 Irrigation and
   compare yields.
4. **Festival**: 🌦 Sky → 🎪 proclaim (2 rations/citizen + ₹10). Town leisures all
   day, +10 mood, unrest −8, 🎪 in the dawn report + sting.
5. **Rationing**: toggle 🍞 — alternate meals become thin gruel (granary drain
   halves). Toggle 🤒 quarantine during a fever wave — fewer new cases.
6. **Sickness**: crowd 6+ adults into 2 beds with no well — 🤒 cases within days;
   the sick rest home. Hire a doctor (change profession) — rounds shorten fever.
   Build a hospital — full nightly healing.
7. **Famine**: set food 0 for 3 dawns — 🍞 FAMINE, health fails, possible
   emigration. Refill — count resets.
8. **Fate**: ~35% of dawns fire an event line; decision cards (🏴‍☠️🐪🗺️🎩🏦💵)
   queue in 💌 Audiences with 2-day expiry. Resolve each road; verify effects.
9. **Research**: build a school, post a teacher — +3 RP/day. 🔬 choose Tools,
   endow ₹100 — EUREKA line, work visibly faster. Steam needs Tools; Railway
   needs Steam.
10. **Graveyard**: deaths (raid/famine/fever) inscribe ⚰ stones in 🌦 Sky.

## Regression

- Full sim green; no warnings.
- Save from 0.8.0 loads: version migrates to 12, all M9–M12 domains present.
- `!help` lists every order; each gated order refuses strangers once officers exist.
