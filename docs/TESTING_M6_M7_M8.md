# ✅ M6–M8 manual test checklist — Decrees, Families, Harbor (Bedrock 1.21.60+)

Prereqs: M1–M5 working (economy, taxes, mint). Builders/laborers released to live & work.

## 1. Decrees with deadlines (M6)
- [ ] **Decrees & Building → + Build decree**: pick a cottage, stand on open ground, confirm — a site is staked where you stand and a crew is posted.
- [ ] Builders walk to the scaffold with 🏗 tags; the dawn report shows % progress, material waits, then completion with a real footprint (platform, corner posts, torch).
- [ ] Completion registers effects: cottages add beds, halls buff their trades (market spending, farm/lumber speed, school, tavern mood, bank rates, mint wear, harbor ships, warehouse quota).
- [ ] **+ Recruit / Stockpile / Tax edict / Custom** decrees track, complete with bonuses, or fail loudly (mood loss + Minister strike). Tax edicts restore previous rates on expiry.
- [ ] **Manage sites & crews** posts/releases builders; **Stake town plaza** levels a mood-lifting square; the hands-off budget slider saves.

## 2. Families & houses (M7)
- [ ] Stand in a dwelling → **Families & Houses → Register house**: named plaque, beds, Crown rent. The homeless move in at dawn; rents flow to the treasury.
- [ ] Evening leisure builds affection; at mutual devotion a **marriage request** reaches **Audiences & Requests** (or file via the ₹9 Matchmaker).
- [ ] Approve → 2-day engagement → wedding festival (mood, feast, ledger); newlyweds share a roof. Deny → kindly final, no punishment possible.
- [ ] **File a child request** (food/housing/happiness thresholds enforced) → approve → 3-day pregnancy → birth → Baby (1–2) → Toddler (3–4, follows mother) → Child (5–6, schools when a schoolhouse stands) → adult laborer on day 7 with inherited XP.
- [ ] Single adopters welcome toddler orphans; fixed population caps pause births (requests wait).
- [ ] Kill a citizen (creative): death notice, will read, estate passes to spouse/child/Crown; houses and bonds settle.

## 3. Harbor & migration (M8)
- [ ] Build a **Harbor** (decree) → clippers drop anchor every 3–5 days with a boom commodity (×2.2–3) and a glut (×0.4–0.7), cried in the report.
- [ ] **Harbor & Missions → Export** sells warehouse goods at world prices minus export duty; **Buy imports** (tools, medicine, feast, ingots) with import duty.
- [ ] **Launch recruiter mission**: cost and return day shown; the party returns with willing settlers scaled by food/beds/happiness (muster with your retinue until released).
- [ ] Refugee ships beach (~12% of dawns, even without docks): **welcome** (rations, grateful laborers) or **turn away** (mood loss) in Audiences; undecided ships sail on.
- [ ] Fixed caps hold migrants and refugees in queue; **Auto-grow** policy drips newcomers every 10th dawn when fed and cheerful.

## 4. Persistence
- [ ] Quit & re-enter: decrees, sites, buildings, houses, requests, pregnancies, missions, ships and debts survive (sharded saves v8); children and migrants relink; old worlds migrate v3→v8.

## Automated regression
`cd tools/sim && node --no-warnings --loader ./loader.mjs run-sim.mjs`
M6–M8 assertions cover decree escrow/crew/progress/completion math, deadline failure, tax-edict restore, housing assignment/rents, courtship→wedding→birth→aging, adoption, cap pauses, wills, missions, clipper prices, exports/imports, refugees, auto-grow and hall effects.
