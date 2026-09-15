# ✅ M2 manual test checklist (Android Bedrock 1.21.60+)

Prereq: M1 complete (`/kingdom:start`, 4 settlers + Minister, Royal Scepter).

## 1. Release & orders
- [ ] Scepter → **Orders → All — go work & live your life**: chat confirms release.
- [ ] Roster shows workers as "works"; each NPC's overhead icon changes through the day (🍞 ⛏ 📦 ♪ 💤).
- [ ] **Orders → All — follow me**: they gather and trail the King (within ~60 blocks).
- [ ] Roster → a worker → **Carry a sword at night** / stand down toggles the armed flag.
- [ ] Roster → a worker → **Change profession** updates wage and name tag.

## 2. Work sites
- [ ] Stand in a grove → **Sites → Set forest site here**; coordinates show green.
- [ ] Repeat for farmland (farm), an exposed stone face (quarry), and an optional rest site.
- [ ] Look at a chest within 8 blocks → **Register chest I'm looking at**; wrong block gives a hint.
- [ ] During work hours the woodcutter fells the LOWEST log first, replants saplings, and walks
      around trunks (not through them); top logs 3+ blocks up are skipped, not stuck on.
- [ ] Farmer harvests mature wheat/carrots, replants growth 0; builder/laborer mines exposed stone.

## 3. Daily life (20-minute cycle)
- [ ] 06:00 breakfast at the town anchor, 07:30 walk to sites, 12:00 lunch home, 13:00 back,
      17:30 delivery walk, evening wander, 21:00 sleep at the home/town site with 💤.
- [ ] Rations on the HUD decrease ~12/day for 4 released settlers; farmer deliveries refill them.
- [ ] Delivered items appear in the registered chest AND in Treasury → warehouse stock list.
- [ ] Low food (below ~2 days) prints a morning warning.

## 4. Growth & pay
- [ ] Sustained work pops "⭐ … reached level N" with particles/sound; name tag level rises,
      work visibly completes faster, wage auto-rises.
- [ ] Dawn report lists produced items, meals eaten/missed, wages paid (₹86/day at L1 with
      Minister: 60+9+6+6+5) and treasury balance.
- [ ] Treasury below 3 days of wages warns.

## 5. Danger & persistence
- [ ] Spawn/lead a zombie within ~9 blocks of a worker: ⚠ icon, they flee to town; armed workers
      don't lose safety mood.
- [ ] Kill a worker (creative) → death notice; roster/HUD counts the living only.
- [ ] Save, quit, re-enter: citizens, zones, stockpile and wages persist; scepter re-granted;
      NPCs re-link automatically (relog-safe tags).

## Automated regression
`cd tools/sim && node --no-warnings --loader ./loader.mjs run-sim.mjs`
Runs the actual scripts headless (clock math, founding, a full simulated day, migration, chest
delivery) and asserts behavior without Minecraft installed.
