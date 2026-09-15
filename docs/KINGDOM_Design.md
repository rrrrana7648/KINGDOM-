# 🏰 KINGDOM — Bedrock Add-on Design Document

**Status:** Design phase (NO CODE yet — coding starts only when the king says so)
**Target:** Minecraft Bedrock Edition — **Android first**, packaged as `.mcpack` / `.mcaddon`
**Play modes:** Single-player + Co-op (friends as Crown Officers)
**Theme:** British Crown Colony / Victorian era, custom textures & 3D models
**Currency:** ₹ Rupees (default; changeable)

---

## 0. Platform reality (read first)

- Mobile Minecraft = **Bedrock Edition**, not Java. It cannot run Forge/Fabric/Java mods (MineColonies is Java-only).
- Bedrock add-ons are written in **JavaScript (Script API) + JSON**, shipped as `.mcpack` / `.mcaddon`.
- **Possible:** custom NPC entities with AI, custom blocks/items, menus (server forms), dialogues, structure placement, jobs/schedules, full simulated economy, reading chest inventories, persistent saved data.
- **Not possible / restricted:**
  - ❌ In-game microphone access → voice orders use **Android keyboard dictation 🎤 into the chat/order box** (the add-on parses natural sentences), plus touch buttons.
  - ❌ Hundreds of smart NPCs at once on phones → design cap ~20–40 fully-simulated NPCs near the colony; distant/off-shift citizens are **abstract-simulated as numbers**.
  - Custom 3D models must stay simple (LOD for crowds).

---

## 1. Core fantasy

You are the **King / Governor** of a new colony. You do not labor — you **rule through a chain of command**:

> 👑 **King (you)** → 🎩 **Minister (Governor)** → 🧑‍💼 **Managers / Buyers / Clerks** → 👷 **Workers & Laborers** → 👨‍👩‍👧 **Families & population growth**

Give an edict with a deadline & budget → management hires, plans and reports → work gets done → the economy turns.

### Design ethics (non-negotiable)
- Population growth uses **willed, paid migration** (recruiter missions, refugee ships) — never kidnapping, imprisonment-to-"agree," forced marriage, or forced pregnancy.
- Families (marriage, children) run on **consent + requests the King approves/denies**. Singles can adopt orphans.
- Punishment exists as **law & justice** (trials, prison fines, banishment), not coercion of the innocent.
- Period *aesthetic* only (clothes, buildings, ships, trade) — no racial/caste hierarchy mechanics.

---

## 2. Game start flow

1. Player creates a new world and types **`/kingdom`**.
2. A **Founder** NPC arrives → dialogue setup: colony name, banner/flag color, difficulty, era flavor.
3. Founder becomes the first **Minister** and gathers **4 founding settlers**: 1 builder, 1 lumberjack, 1 farmer, 1 laborer.
4. Player places the **Governor's Mansion / Town Hall** → kingdom border claimed → HUD appears → game begins.
5. **Starting treasury: ₹1,000** (initial money supply).
6. Replacing a Minister is deliberately a **long political process**: nominate candidate → council approval → multi-day handover. Ministers have **loyalty + competence** stats.

---

## 3. Citizens & life simulation

Each citizen: name, age, job, skill level/XP, mood, health, family, home, wage, savings, class.

**Needs ladder (lower unmet needs wreck happiness):**
food → clean water → shelter → fuel (wood/coal) → clothing → healthcare → leisure (tavern/festivals/parks) → faith (neutral shrine).

- Day/night **schedules**: shifts, meals at market, sleep at home; absenteeism when sick/unhappy.
- **Skills & XP**: level 1→5+ per profession; masters work faster and produce Grade A goods.
- **Schools & apprenticeships**: children can rise from laborer → artisan → merchant → official (social mobility).
- Citizens without housing become homeless (slums), beg, or turn to crime.
- Death by age/disease/accident; widows & orphans; orphans are adoptable.

### Families & population (consent-based)
- Citizens court → send a **marriage permission request** to the King → household forms if housing exists.
- Couples (or single adopters) **request children** when food, housing, happiness pass thresholds; King approves/denies.
- Pregnancy stages over ~3 in-game days (model belly stages) → birth. **Aging is fixed at 6 in-game days of dependency:** Baby (days 1–2, crib) → Toddler (days 3–4, walking, follows mother) → Child (days 5–6, school/play) → **adult worker on day 7** with inherited skill bonuses.
- Growth also via **migration**: recruiter missions + refugee/migrant ships; inflow depends on fame, wages, food, housing.
- **Population policy (player-controlled, no hardcoded limit):** Unlimited (default) · Fixed cap (e.g. "only 40" — births & recruitment pause at cap, queue resumes if someone dies) · Auto-grow rate (e.g. +2 adults per 10 days when conditions allow). Recommended live-NPC performance band ~40; above that citizens are abstract-simulated (see §15).
- Disease/famine/war shrink population.

---

## 4. Government roles (appointed NPCs)

| Role | Responsibility |
|---|---|
| 🎩 Minister / Governor | Your second-in-command; receives all edicts, delegates, reports |
| 🏗️ Foreman | Builders, laborers, construction & deadlines |
| ⛏️ Mine Overseer | Miners, quarries, prospecting |
| 🌾 Farm Master | Farmers, plantations, irrigation, food reserves |
| 💰 Treasurer | Tax policy, wages, price book, budgets, reports |
| 🛒 Chief Buyer | Supervises commodity buyers & floats |
| 📦 Warehouse Keeper | Storage, receiving, stock logistics |
| ⚖️ Magistrate | Courts, crime, prison, inspector cases |
| ⚔️ Guard Captain | Redcoats/sepoys, patrols, walls, conscription |
| 🏦 Banker | Mint, loans, savings, reserves, national debt |

### Edicts & deadlines
1. Open Royal Decree menu (or dictate/type): *"build a warehouse in 7 days"*, *"recruit 10 workers"*, *"double the war tax for 2 weeks"*, *"prepare defenses"*.
2. Set **deadline (in-game days)** and **budget**.
3. Manager hires workers, draws materials from warehouse, assigns shifts.
4. **Progress reports** (Day 2: materials 40%… Day 5: behind schedule — request 2 more laborers).
5. Early finish → bonus wages + happiness; missed deadline → unrest; repeat failure → Minister recall process.

### Talking to citizens
- Walk near + interact, or say/type a full name: *"John Carter, come here"*, *"John Carter, become a miner"*, *"fetch 32 cobblestone"*.
- Marriage/child/profession orders arrive as **requests the citizen accepts or refuses** based on mood, pay, and King popularity.

---

## 5. Production, jobs & buildings

**Work buildings (place/upgrade 1–5, each level = more workers & better output):**
Town Hall/Governor's Mansion · Builder's Hut · Lumberjack Camp · Forester (replanting) · Farm & irrigation · Plantations (tea/cotton/spices) · Well · Fisherman's hut · Herder pasture · Mine Entrance & Prospector · Quarry · Blacksmith · Paper Mill · Ink Works · Mint/Printing Press · Bank · Warehouse · Commodity Buyer stalls · Market square & shop plots · Bakery · Tailor · Hospital · School · Tavern · Houses/tenements/plot deeds · Barracks & guard towers · Walls & gates · Courthouse & prison · Harbor + warehouse crane · Clock tower · Railway station (late tech) · Monument gardens.

**Construction modes**
- 📐 Blueprint buildings: workers construct block-by-block from warehouse stock (you see scaffolding and progress).
- ✏️ Royal Scepter zone: mark your own design area and the Foreman builds it.
- 🏚️ Citizen self-build: citizens buy plots, take bank mortgages, and build their own homes/shops.

**Tool wear:** tools degrade and break; blacksmith quality changes work speed; tool shortages idle workers.

**Resource depletion:** mines run dry (prospect new shafts), forests deplete (foresters replant), quarries expand.

---

## 6. Economy — the circular loop

```
Workers PRODUCE goods
   → sell at licensed Buyer stalls / Receiving Counter = WAGES
        → goods stored in Crown Warehouse
             → used in construction / sold at market / EXPORTED via harbor
Citizens SPEND wages: market food, rent/mortgage, tools, clothes, leisure
Crown INCOME: taxes, duties, rent, crown-plantation sales, exports, license fees, mint
Crown EXPENSE: wages, floats, construction, recruitment, soldiers, subsidies, debt interest
────────────────────────────────────────────────────────────
NET PROFIT/day = Total Income − Total Expenses      (HUD, live, green▲/red▼)
GDP/day       = market value of all goods + services produced
```

### 6.1 Crown Warehouse
- Real building with **registered chest zones**; scripts read actual chest contents.
- Receiving Counter: Clerk pays depositing workers instantly from a daily **coin float**.
- **Price book**: per-commodity Crown buy price + quality grades A/B/C.
- **Reserve targets & quotas**: e.g. keep ≥640 logs, stop buying at 2,000.
- Full ledger: seller, qty, grade, rate, amount (audit trail).

### 6.2 Licensed Commodity Buyers (one stall per commodity)
Stalls: 🪵 Wood · 🪨 Stone · ⛏️ Ore & Gems · 🌾 Grain · ☕ Tea/Cotton/Spices · 🐟 Fish · 🐑 Livestock/Wool/Hides.
Each buyer: wage, daily float, Minister-approved price band, quota, linked storage chests; cart runners move stock to warehouse.
- Skilled buyers grade quality & detect short-weighting.
- **Corruption**: buyers may skim/collude; Inspectors audit; court handles convictions (fine/prison/banishment). Higher wages + happiness reduce corruption.
- Late policy: **privatize** a commodity — sell a monopoly license to a merchant who pays fees + duties.

### 6.3 Market & internal trade
- Citizens trade among themselves (baker buys wheat); sales count in GDP and incur sales tax.
- Supply/demand moves prices; shortages create spikes; over-taxation creates a **black market & smuggling** (night boats, bribes).
- Crown shops vs citizen-owned shops via plot deeds.

### 6.4 Housing & land economics
- Crown tenements: citizens pay **rent** (eviction risk → unrest).
- Private homes: citizen buys plot, pays **land tax**, optional bank mortgage with interest.
- Free shelter is a policy (costs Crown, boosts happiness, attracts migrants).

---

## 7. 🏦 Royal Mint, money supply & banking

**Start: ₹1,000 money supply.** Minting more needs a physical chain:
1. **Paper Mill** — sugarcane/bamboo/cotton rags + labor → paper
2. **Ink Works** — ink sacs / soot + gum (small proportion; 1 ink covers many notes)
3. **Plate Engraver** — copper/iron plates (wear → maintenance)
4. **Printing Press** — labor + paper + ink + plates → banknote batch → added to treasury **ledger** (currency kept digital/non-physical for performance; Mint building is the dedicated place)

**Money mechanics**
- Track **money supply, GDP growth, inflation, gold/silver reserve ratio**.
- Print faster than GDP → **inflation**: prices & wage demands rise, savings erode, foreign exchange rate worsens.
- Print too little → deflation, stall closures, unemployment.
- Taxes payable in ₹ → gives paper currency demand/value.
- Mint dashboard: *Money supply · GDP · Inflation % · Reserve cover %*.
- **Counterfeiting** crime events; optional **demonetization** edict (old notes invalid in 7 days; crushes corruption, hurts short-term happiness).

**State Bank**
- Citizen savings accounts + **loans/mortgages** for houses, farms, shops (interest).
- Crown can borrow from foreign merchant banks → **national debt + interest repayments**; King sets interest rate.

---

## 8. 🏦 Taxes, policies & welfare (Treasurer menu)

Levers: income tax · sales tax · land/rent tax · head tax · import duty · export duty · war surcharge.
Presets: Low 🌱 / Normal / High / **Double War Tax** ⚔️ / Tax Holiday (festival).
Spending: wage bonuses, festival feasts, poor relief, pensions (war widows/veterans), subsidies.
Consequences: high tax + low food → strikes, protests, riots, black market, desertion; low tax + surplus → migrant boom. Treasurer warns before collapse.

---

## 9. Harbor & world trade

- Clipper ships arrive on schedules with **fluctuating world prices & events** ("London tea boom!", "cotton glut — prices crash").
- Exports: tea, cotton, spices, silk, grain; imports: settlers, machinery, luxury goods, metal, medicine.
- Tariffs, trade bans, harbor upgrades = larger ships & better prices.
- Merchant banks offer Crown loans here.

---

## 10. Real-life situations (event systems)

- **Weather/seasons:** monsoon floods, drought, storms damaging roofs, wildfires; irrigation & granaries mitigate; famine → rationing & price spikes.
- **Health:** mine injuries, cholera (dirty water), plague → hospital/doctor/herbs, quarantine, graveyards.
- **Crime & justice:** warehouse theft, smuggling, black market, bribery, embezzlement, counterfeiting → constables → Magistrate trials → fines/prison/banishment; Inspectors audit officials.
- **Labor:** strikes over wages, unemployment/beggars, festivals/holidays/rest days, absenteeism.
- **Politics:** Minister loyalty/competence, protests → riots → rebellion if popularity collapses; petitions from citizens.
- **Defense:** bandit raids, rival powers; redcoat/sepoy guards, patrols, walls/towers; conscription & war tax; veteran pensions.
- **Records (era flavor):** census office, citizen papers/permits, *Royal Gazette* with edicts & news.
- **Daily "Day Roll" at dawn:** production → wages → sales/rent/tax/duties → GDP & net profit → inflation tick → morning report + HUD refresh.

---

## 11. Co-op (friends)

Friends join as **Crown Officers** with role permissions: Treasurer, General, Chief Architect, Recruiter, Magistrate. King grants/revokes roles; all share the kingdom HUD & ledger. Kingdom data stored centrally on the host world.

## 12. Royal UI (mobile, touch-first)

- 🪄 **Crown/Scepter item** opens Kingdom Menu; persistent **Royal Button** for direct Minister contact.
- HUD sidebar: Treasury · Net profit/day · GDP · Population · Happiness · Food · Security · Inflation.
- Forms: population list, job management, active decrees + deadlines, price book, tax levers, mint/bank, reports.
- Orders via **dictated/typed natural sentences** (name commands for citizens) + quick buttons.

## 13. Art & audio direction (custom)

- Victorian Crown Colony: cobblestone + brass + dark wood, Governor's Mansion, clock tower, harbor cranes, clipper ships, bazaar, redcoats & sepoys, top hats/bonnets, later steam railway.
- Custom 3D models for: king crown/scepter, Minister & guards, commodity stalls, press/mint machinery, ships; simple LOD models for crowds.
- Coins/notes, GUI parchment-brass art, era sound stings (bell, ship horn, press clank).

## 14. Tech / research tree

Irrigation → improved tools → steam pump → **railway (fast logistics)** → **telegraph (instant orders/reports instead of runners)** → modern medicine → better mint plates.

## 15. Performance strategy (mobile)

- ~20–40 live NPCs in loaded colony chunks; off-screen citizens abstract-simulated each Day Roll.
- Currency & ledgers digital (world dynamic properties / persistent storage), not dropped item entities.
- Ticking budgets: economy sim runs once per in-game day, not every tick; pathfinding throttled; simple crowd models.

## 16. Package structure (planned, not built yet)

- **Behavior Pack:** `manifest.json`, Script API JS (economy, NPC AI, edicts, mint, saving), entity/block/item JSON, structures (blueprints).
- **Resource Pack:** textures, geometry models, materials, GUI art, sounds, lang files.
- Combined export → single **`.mcaddon`** importable on Android with one tap.

## 17. Milestones (full vision, delivered in slices)

- **M1** `/kingdom` start, Founder→Minister, 4 settlers, Town Hall, HUD skeleton.
- **M2** Citizens: needs, schedules, skills, homes; builder/lumberjack/farmer labor loop.
- **M3** Warehouse + receiving + price book + licensed buyers; wages & ledgers.
- **M4** Market, taxes, GDP/net-profit Day Roll, treasury reports.
- **M5** Mint, paper/ink chain, inflation, bank loans/debt.
- **M6** Edicts with deadlines, managers, blueprint + scepter building, upgrades.
- **M7** Families: courtship, marriage requests, pregnancy stages, children; schools.
- **M8** Recruitment missions + refugee ships; harbor trade & price events.
- **M9** Crime, courts, inspectors, corruption; guards, raids, conscription.
- **M10** Seasons/disease/famine events; tech tree; railway/telegraph.
- **M11** Co-op officer roles & permissions.
- **M12** Custom art/audio pass, voice-dictation command polish, Android testing & packaging.

## 18. Open decisions (defaults chosen — change any time)

- Recruitment: **recruiter missions + refugee ships both**
- Era: **British Crown Colony / Victorian**
- Currency: **₹ Rupees**
- Orders: **keyboard dictation + menu buttons both**

---

## 19. Founding party & follow/life orders

- After `/kingdom`, the starting population is **2 men + 2 women** founders who stay with the King and await Minister instruction.
- Orders: **"Stay with me" / "Follow me"** (retinue for founding & inspections), **"Carry a sword for safety at night"** (gear up + threat retreat AI), **"Now go work and live your life"** (release into full autonomy: shifts, market meals, socializing, sleep, romance, festivals).

## 20. Dynamic / custom professions (voice-defined jobs)

Players invent professions by describing work: *"cut sugarcane and replant every morning"*, *"guard the north gate"*. Parsed into an editable job template:
- Target blocks/entities/zones · actions (harvest+replant, fell+replant saplings, mine, patrol, fish, transport, craft, build) · required tool (auto-requested from blacksmith) · workplace/camp zone · wage mode · shift hours · danger allowance · custom job title.
- Templates saved in the **Job Book**, reusable, multi-action, with conditional priorities ("if rain → warehouse work").
- Profession swaps on command; related-skill XP transfers partially.

## 21. Two labor modes

| | 🟡 Crown Employee | 🟢 Freelance / Self-employed |
|---|---|---|
| Pay | Fixed daily wage by profession, grade, danger + allowances | Piece rate: quantity × item type × quality grade |
| Risk | Stable income, crown meals/tools possible | Boom/bust with weather & harvest |
| Sales | Crown orders only | Best price among buyers, market stalls, private citizens |
| Behavior | Scheduled & supervised | Compare offers each morning; may quit crown service for better pay; own tools (bank loans possible) |

Morning report notes labor market moves (e.g. woodcutters turning freelance when crown prices are low).

## 22. Expeditions & work camps

- Multi-day off-site work: *"send 20 woodcutters for 10 days"* → camp with tents, beds, campfire, cook, food crates, storage racks, optional armed escort.
- Daily cycle: work → meal → sleep; cart convoy returns with stockpile at end.
- Events: predators, bandits, injuries, weather delays, desertion, morale/homesickness; visits by King allowed. Same system for mining surveys & army marches.

## 23. Worker capacity, XP, mood & medical

- **Capacity starts EQUAL to a normal player (36 effective slots)** and grows with level — see §31. Camps/warehouses extend hauling further.
- XP from time + output; levels 1–5+, masters produce Grade A, train apprentices, earn & demand more.
- Mood: wage fairness, food, sleep, health, housing, safety, loneliness (solved by friends/family/tavern — affects all genders, never an entitlement to a partner), court-ordered punishment fairness, weather, festivals, King popularity. Arbitrary punishment = colony-wide loyalty loss.
- Medical: hospital, doctor, herb garden, clean water; injuries, infection, pregnancy care with lighter duties, childbirth risk, epidemics & quarantine, graveyards; disabled citizens take desk/craft jobs; sickness → absenteeism → GDP dip.

## 24. Army

Barracks & ranks (sepoy → sergeant → officer), training, weapons & armor (muskets late tech), patrols, tower shifts, expedition escorts, conscription (paid; forced drafts hurt happiness; volunteer bonuses preferred), veteran pensions, deserter trials.

## 25. Romance & family (non-explicit, consent-based)

- Sims-style chaste system: crushes, compatibility, courtship, affection meter, dates (tavern/park), love letters, jealousy/rival drama; every proposal can be accepted or refused.
- Marriage requests go to the King for political approval; households require housing.
- **King: one living consort (Queen/King-consort)** earned via courtship questline (gifts, family approval, royal wedding festival); consort becomes an influencing NPC. Divorce/widow remarriage allowed. No harems, no compulsory marriage.
- Children only via couple/single-adopter requests passing food/housing/happiness thresholds (see §3).

## 26. Life & flavor features

Royal banquets & wedding feasts · seasonal festivals · traveling theater/circus boats · tavern music & dice nights · pets & camp dogs (raid warnings) · elephants/oxen for logging & cart hauling · royal zoo · messenger pigeons (pre-telegraph) · treasure maps & shipwreck salvage · honor duels between rivals · Gazette gossip columns · hot-air balloon resource scouts · spies in rival colonies · class fashion (top hats/bonnets) · market lottery · mandatory holiday rest-days (no work, big happiness gain).

## 27. Content boundaries (design constraints)

- No kidnapping/imprisonment-to-comply labor; migration is willing & paid.
- No forced/arranged-on-command marriages, no harems; all romance is consent-based.
- No sexual/explicit content; romance stays chaste (Sims/Tonnie level).
- Punishment only via lawful court process; no racial/caste hierarchy mechanics.

---

## 28. Royal Economist — suggested prices & wages (player never balances alone)

When creating a job/edict the game suggests wage/price with reasoning and a stable range; player may accept, tweak, or fully override.
**Wage formula:** `base wage (₹/day) × skill multiplier × danger multiplier + allowances`
- Skill: L1 ×1.0 · L2 ×1.1 · L3 ×1.25 · L4 ×1.4 · L5 ×1.6
- Danger: safe ×1.0 · night/water/heights ×1.2 · mob-risk caves ×1.5 · lava/deepslate ×2.0 · **Deep Dark/Ancient City ×3.0** · active war ×2.5
- Night shift +20%; expedition camp allowance +30%; overtime +50%.
Economist monitors: 3-day stock vs reserve targets, buyer queue length, freelance vs crown pay gap, food price vs wage ratio, money-supply/inflation. Nudges: *"fish stocks empty 3 days — raise fish rate or lose 2 fishermen."* Player can lock prices or allow auto-adjust within an approved band.

## 29. Appendix A — wage & price sheet (₹, suggested defaults, tunable)

**Crown base daily wages (L1):** apprentice/child ₹2 · laborer/hauler/cart-runner ₹5 · woodcutter/forester/farmer/picker/herder ₹6 · fisher ₹7 · quarry ₹8 · builder/cook ₹9 · shallow miner (coal/iron/copper)/sepoy/clerk ₹10 · trained soldier ₹14 · blacksmith ₹15 · buyer ₹12 · deepslate miner (gold/redstone/lapis) ₹18 · inspector ₹18 · master builder ₹20 · sergeant ₹22 · foreman/overseer ₹25 · officer ₹35 · deep-dark diamond miner ₹35 · banker ₹35 · treasurer/magistrate ₹30–40 · doctor ₹40 · Minister ₹60 + mansion · teacher ₹10 · tailor ₹10 · baker ₹9 · courier ₹7 · matchmaker/priest ₹9.

**Crown commodity buy prices (₹/item; ledger keeps paise):**
- Materials: dirt/sand/gravel 0.02 · cobblestone 0.05 · stone 0.10 · deepslate cobble 0.12 · granite/andesite 0.08 · clay 0.30 · flint 0.40 · obsidian 5
- Wood: oak/birch log 0.50 · spruce 0.55 · jungle/dark oak 0.70 · plank 0.30 · sapling 0.20 · stick 0.03
- Ores: coal 1 · charcoal 0.70 · raw iron 1.50 / ingot 4 · raw copper 0.80 / ingot 2 · raw gold 5 / ingot 12 · redstone 0.50 · lapis 0.30 · quartz 1 · amethyst shard 8 · emerald 25 · diamond 60 · ancient debris 250
- Food: wheat 0.20 · flour 0.35 · bread 0.80 · potato/carrot/beetroot 0.15 · sugarcane 0.25 · sugar 0.40 · tea leaf 2 · cotton boll 1.50 · spice pod 2 · coffee berry 2.50 · cocoa 1 · raw fish 1 (tropical 3, puffer 2) · cooked fish 1.5 · raw meat 0.8–1.2 · cooked 1.5–2 · egg 0.20 · milk 1.50
- Animal/textile: wool 2 · leather 1.50 · feather 0.30 · rabbit hide 0.40 · string 0.50
- Trade goods: paper 0.60 · ink unit 4 (inks ~100 notes) · cloth 4 · clothing set 25 · fine suit/bonnet 60 · brick 0.40 · glass 1 · torch 0.20 · candle/lamp 3 · arrow 0.50 · gunpowder 6
- Tools/arms: wooden tool 8–12 · stone 20–28 · iron 70–90 (+25% swords) · diamond 350–450 · shield 40 · iron armor 60/piece · diamond armor 300/piece

**Other:** market meal 1.5–3 · tenement bed rent 1/day · small house buy 400 / rent 3 · family house (2 beds+) 900–1500 · shop plot 600+.
**Selling:** citizen retail ≈ 2× crown buy price; harbor export ≈ 1.5–3× with world-price fluctuation; import duties configurable.
**Mint cost:** per ₹100 batch ≈ 1 paper unit (3 sugarcane) + 0.01 ink + ₹2 labor + ₹1 plate wear; minting beyond GDP growth triggers inflation (§7).

## 30. Daily schedule, adjustable day length & clock

- **Default: the vanilla 20 real-minute day–night cycle is kept** (20 real minutes = 24 colony hours; 1 real minute = 1.2 colony hours; MC tick 0 = 06:00 colony time). The mod's brass **HUD clock** reads live world time: `colonyHour = (worldTick ÷ 1000 + 6) mod 24`, refreshing every second. Optional longer presets (40/60/90 min) in Kingdom Menu → Time; when chosen, scripts pause vanilla and drive the cycle.
- Schedule: **06:00** dawn bell & family breakfast · **07:00** commute · **07:30** shift 1 · **12:00–13:00** lunch (home/market/tavern) · **13:00–17:30** shift 2 · **17:30** goods delivery & wages · **18:00** family dinner + leisure · **21:00** sleep/curfew. Guards/night shifts invert the schedule; school for children in morning.
- Brass **HUD clock** with phase bells (Dawn/Forenoon/Noon/Dusk/Curfew/Night Watch); the **Day Roll** runs at the 06:00 wrap each new in-game day.

## 31. XP, capacity & speed progression

| Level | Capacity | Speed | Quality |
|---|---|---|---|
| L1 | normal player (36 slots) | 1.0× | C |
| L2 | +25% | 1.1× | mostly C/B |
| L3 | +50% | 1.25× | B |
| L4 | 2× normal | 1.4× | B/A |
| L5 Master | 3× normal (108 stacks) | 1.6× | Grade A; trains apprentices |

XP from time served + items delivered (rare items give more). Visibly faster chopping/mining as levels rise.

## 32. Tool tiers & procurement

Each job spec declares a minimum and recommended tool tier. Wrong tier = polite refusal + automatic requisition (*"gold ore needs an iron pickaxe; diamond recommended for speed"*). Minister routes requisition → blacksmith craft or harbor import; meanwhile worker takes matching lower-tier work. Crown tools replaced on wear free; freelancers buy/loan their own. Deep Dark kits: diamond + shield + torch supply + hazard pay.

## 33. Workload management & auto-hiring

Minister converts every decree into required work-hours vs capacity: *"Workload 140% — hire 6 laborers, extend deadline 2 days, or authorize overtime +50%."* King sets an auto-approve budget (e.g. new wages up to ₹50/day) for hands-off ruling; otherwise requests arrive as decisions.

## 34. Matchmaking, weddings & housing registry

- King may suggest a match; Minister courts **both** people; consent depends on compatibility, affection, mood, King popularity. Both accept → **2-day engagement** (banns, feast prep) → wedding festival. Refusal is final with a stated reason; punishing refusal is blocked and crashes loyalty.
- After wedding: couple requests shelter (house, **2 beds, personal space**); Minister allots a vacant crown house, queues new construction, or approves a private plot mortgage.
- **Houses are named & registered** (e.g. plaque "Carter House"; door inspection lists residents, beds, storage). Births cause overcrowding → upgrade/relocate decree. Courthouse holds **wills**; on death the house & savings pass to heirs; no heir = property reverts to Crown (widows/orphans protected).
- Professional **Matchmaker** NPC rates compatibility and suggests couples for a small fee.

## 35. Event deep dive (triggers → effects → responses)

1. **Bandit raid** — low security, rich visible stockpiles; theft/injuries; respond: guards/militia, walls/towers, ransom (fame hit), patrols.
2. **Mine collapse** — deep work without supports; trapped/injured; rescue decree, timber supports, hospital, downtime.
3. **Deep Dark incident** — Warden awakened; casualties + miners refuse shifts; close shaft, hazard pay ×3, better kits, alternate seams.
4. **Monsoon flood** — season + poor drainage; farms/roads/roofs damaged; drainage works, granary reserves, repairs.
5. **Drought & famine** — no irrigation; food prices spike, starvation, emigration; rationing, grain imports, wells/irrigation.
6. **Cholera/plague** — dirty water, overcrowding; deaths, quarantine; hospital, doctor, sewer tech, graveyard.
7. **Tenement fire** — wooden district + drought; spread; fire brigade pump cart, wells, brick rebuild edict.
8. **Strike** — wages below living ratio; production halts; negotiate raise, festival bonus, wait (output 0); crackdown banned-as-policy (causes riots).
9. **Embezzlement/short weights** — weak inspection; missing coins/stock; Inspector audit → Magistrate trial → fine/prison/banishment.
10. **Counterfeit ring** — high printing/inflation; fake notes erode trust; constable investigation, demonetization edict.
11. **Trade boom / glut** — harbor world-price events; export rush or price crash; stockpile/expand production or diversify/subsidize.
12. **Pirate blockade** — harbor level; exports stall; armed escort ships, toll payment, overland caravans.
13. **Refugee ship** — random; accept (housing/food burden, future labor + fame) or turn away (fame/happiness loss).
14. **Protest → riot → rebellion** — high tax, hunger, conscription, refusals punished; petitions early; reforms, audience, festival; troops last resort.
15. **Dignitary / royal inspection** — high fame; gifts & parade expectations; rewards/fame if splendid, embarrassment if slummy.
16. **Comet/omen, superstition** — random; priest/festival calms; ignored = mood dip.
17. **Escaped circus elephant** — theater boat visits; chase event; capture → royal logging elephant; fail → forest damage.
18. **Diamond strike / gold rush** — discovery; freelance rush, boomtown, tool shortage; Crown claims royalty or licenses claims.
19. **Bank run** — debt/fear/inflation; savings withdrawals spike; suspend withdrawals, raise rates, back reserves with metal.
20. **Birth/twins, birthday, wedding, death** — family events; gifts, feasts, inheritance, named graves; twins = rare happiness boost.
21. **Rival-colony spy/saboteur** — rivalry growth; counter-intelligence from coffee-house rumors; expel or feed false data.
22. **Crime lord racket** — weak constables + poverty; protection money stalls close; raid the den, legalize markets, welfare.

## 36. Life features — round two

Cricket cup & race days (betting) · town crier + notice boards · weekly Royal Gazette (prices, edicts, gossip, duel scandals) · photographer studio & wanted posters · harbor commodity exchange (futures) · fire/marine insurance office · pawnbrokers (possible stolen-goods fences) · sewers & gas street lamps · fire-brigade pump carts · parks/bandstands/fountains · museum & wonder buildings (paying tourists) · observatory forecasts + farmer's almanac · post office, stamps, parcels, pigeon lofts · census every 10 days, birthday feasts · orphanage & adoption · named graveyards, remembrance day · retirement homes & pensions · knighthood titles & coats of arms, weekly throne audience & petition box · elopements & love rivals · coffee houses (rumor/intel hubs) · weights-and-measures inspectors · slum-upgrading programs · Empire Day parade, harvest-home, maypole fair, winter fireworks · workhouse (food for labor, no detention) · railway timetables, bullock carts, elephant logging corps · sealed survey maps from balloon scouts · street/district naming & map plaques.

---

## 37. The Big Feature List — 120 more systems (the "hundreds of features" pass)

### 👑 Royal & political (1–20)
1. Weekly throne audience with a petition queue; approve/deny each.
2. Royal decree archive (every edict, date, outcome, cost).
3. King popularity measured **per district**, shown on the map.
4. Morning briefing book (overnight events, reports, requests).
5. Council of advisors: War, Treasury, Works, Health, Trade seats.
6. Kingdom prestige tiers: Camp → Hamlet → Town → City → Dominion.
7. Found **satellite villages** via royal charter; appoint district governors.
8. Laws editor: define sentences for theft/smuggling/desertion.
9. Convict work gangs (lawful sentences, road-breaking labor).
10. Bounty board: wanted posters, bounty-hunter NPCs.
11. Diplomatic envoys, gifts, embassies with rival colonies.
12. Treaties: trade, non-aggression, mutual defense, vassalage.
13. Spy network with coded dispatches; counter-spies & honeytraps.
14. Assassination plots; royal food-taster & armored guard escort.
15. Royal succession: name heir; regency council if the King is absent in co-op.
16. Co-op viceroy: a friend rules while you're offline within permissions.
17. Curfew edict (lamp-lit patrol hours); affects crime & happiness.
18. Titles office: knight citizens ("Sir Ravi"), grant coats of arms.
19. Royal wardrobe: crowns, uniforms, gowns affect prestige & NPC reactions.
20. Throne-room building requirements; audiences only possible there.

### 💰 Economy & trade (21–45)
21. Overland **trade caravans** with camels/oxen when no harbor exists.
22. Foreign currency exchange booth at the harbor.
23. Tax farmers (auctioned tax contracts) — efficient but corruption-prone.
24. Treasury bonds citizens buy; coupon payouts every 10 days.
25. Guild halls (carpenters', masons', weavers') that set wages & license masters.
26. Minimum-wage edict; auto-calculated living wage shown beside it.
27. Price-control & rationing coupon system during famines.
28. National granary reserve with spoiled-grain turnover.
29. Royal auction house for seized/rare goods.
30. Street food carts & vendors simulated as micro-businesses.
31. Shop customer simulation: foot traffic depends on location & prices.
32. Business bankruptcy: shops close, assets auctioned, workers jobless.
33. Deed & land-registry office; property transfers & leases.
34. Government contracts auction: supply 500 bricks to the Crown, etc.
35. Seasonal labor market (harvest & tea-picking wage spikes).
36. Pawnshop microloans against tools; regulated or banned by policy.
37. Hawker licenses; unlicensed hawkers chased by constables.
38. Weights & measures audit days; crooked scales destroyed publicly.
39. Royal monopolies (salt, opium-for-export, gunpowder) with smuggling counterparts.
40. Merchant estates: rich NPCs build mansions and lend money privately.
41. Market days vs quiet days; weekly bazaar traffic surge.
42. Debt courts: seized property, debtors on workhouse crews (sentenced, not detained without trial).
43. Trade-company shares bought/sold by citizens; crash events.
44. Coin clipping & sweating crime; assayer detects fineness.
45. Ledger export: view full kingdom accounts in forms.

### 🏭 Industry & resources (46–70)
46. Deep-mine elevators, timber supports, drainage levels.
47. Ore-sorting tables; byproduct loss if unstaffed.
48. Water-wheel sawmill (river placement; output ×1.5).
49. Steam sawmill late-game (needs coal + engineer).
50. Wind pumps for dry farms; irrigation canals with flow ranges.
51. Tea plucking seasons & withering houses.
52. Apiaries (wax for candles, honey for the bakery).
53. Coastal salt pans; salt tax (infamous but historically real).
54. Charcoal kilners' camp (forestation cost vs cheap fuel).
55. Brickyards & glassworks (clay/sand + coal inputs).
56. Textile chain: cotton → gin → spinning → yarn → loom → cloth → tailor.
57. Indigo/dye works; dye vats, colored uniforms & fashion goods.
58. Tannery → leatherworks → saddler → harness for elephants/horses.
59. Brewery (ale supply = tavern happiness; drunkenness events).
60. Sugar refinery; rum export (tax it heavily or ban it).
61. Gem cutter & polisher; jewelry gift economy (courtship + diplomacy).
62. Goldsmith & assay office with hallmark stamps.
63. Machinery workshop: spare parts keep pumps/press/rail running.
64. Coal depot & fuel logistics; winter fuel shortages kill mood.
65. Quarry expansion tiers; cobblestone/brick/granite production lines.
66. Forester-managed wood lots with rotation replanting.
67. Rubber/lac/rosin gatherers for late industry.
68. Ice houses (winter harvest, summer luxury treats).
69. Grain windmills & steam flourmills (bread price driver).
70. Assembly-queue crafting: managers submit requisitions, workshops fulfill in order.

### 🏗️ Infrastructure (71–90)
71. Road tiers: dirt → gravel → cobble → paved; cart speed scales.
72. Bridges & toll bridges; tolls fund roads but annoy merchants.
73. Canals + barges (massive cargo, slow, cheap).
74. Railway: stations, timetables, freight cars, passenger revenue.
75. Docks, cranes, lighthouse, bonded warehouses, drydock.
76. Water supply: wells → cisterns → cast-iron piped water.
77. Public fountains (social hubs, marriage-meet spots).
78. Sewer network (cholera collapses once covered).
79. Gas works + street lamps (night crime ↓, night shifts possible).
80. Post boxes, mailmen twice-daily collections, parcel rates.
81. Telegraph to satellite villages: instant reports & orders.
82. Fire stations, watch towers, alarm bells, pump-cart crews.
83. Street signs & district naming by the King.
84. Public baths & wash-houses (health + social life).
85. Rubbish collection; filth drives rats & disease.
86. Graveyards outside walls; undertaker profession.
87. Market awnings & stall rentals; stall placement matters.
88. Fort walls with crenellations, gatehouses, moats.
89. Flagpoles & royal banners (color chosen at founding).
90. Monument & wonder construction (tourism + prestige).

### 🧑‍🤝‍🧑 Social & domestic (91–105)
91. Literacy rate; schools slowly raise all skill-XP gains.
92. University unlocks doctor/engineer/barrister/master professions.
93. Libraries & reading rooms; coffee-house rumor quality ↑.
94. Newspaper subscriptions; literate citizens read edicts = faster compliance.
95. Festival calendar editor (rest days, feasts, holidays).
96. Funeral rites & mourning leave; unburied dead cause horror mood.
97. Family surnames + commoner crests; shared address plaques.
98. Friendship & rivalry graph; feuds, pranks, patched quarrels.
99. Honesty reputation per citizen; predicts theft/corruption risk.
100. Fashion trends: citizens save for status clothes (cloth demand waves).
101. Pets & companion animals per household; pet death sadness event.
102. Birthday feasts auto-held if the family can afford one.
103. Dowry & wedding-gift customs (both families save; stress event).
104. Family moves & house upgrades on new children.
105. Nannies for working mothers (optional policy: creche building).

### ⚔️ Military & security (106–120)
106. Drill yard & training schedule; recruit XP via drills.
107. Armory stock; guards unequipped → warnings instead of patrols.
108. Cannon foundry & harbor batteries vs pirate ships.
109. Militia roster (part-time citizens; call-up decrees).
110. War maps with front-line progress reports.
111. Rival-colony sieges: starvation timers, tunnel-digging events.
112. Scouts & rangers (fast, long vision, balloon spotters).
113. Military bands (morale + parade prestige).
114. Medal ceremonies; decorated heroes boost kingdom-wide mood.
115. War-wounded hospital wing; prosthetic hooks → clerk jobs.
116. Prison stockade with exercise yard & work gang schedules.
117. Night watchmen (lamp route, whistle alarms).
118. Raid intelligence: spies warn 1–2 days ahead.
119. Tribute demands from bandit kings; pay or fight.
120. Victory parades & war memorials after conflicts.

### 🌦️ Nature, world & flavor (121–140)
121. Four seasons with temperature & clothing/fuel demand.
122. Monsoon forecast (almanac %); plant/harvest timing matters.
123. Locust swarms, crop blight, rat plagues.
124. Earthquakes & hurricanes with building-damage reports.
125. Heatwaves (work speed ↓), frostbite winters.
126. Salmon/fishing-runs & whaling voyages (lamp oil).
127. Nomad caravans with rare goods & rumors.
128. Ancient ruin expeditions & museum relics.
129. Frontier fur trappers & outpost charters.
130. Exotic-animal captures for the royal zoo.
131. Tourist visitors once wonders exist (passport checks, souvenirs).
132. Comets/eclipses/omens with festival responses.
133. Wild animal adoption (camp dogs, messenger falcons).
134. Berry-bloom & spice-flower visual seasons.
135. Treasure maps from fishermen; shipwreck salvage claims.
136. Flower-seed exchange & royal garden competitions.
137. Cave discovery expeditions (new mine seams).
138. Migratory bird seasons affecting hunting.
139. Erosion & river course shifts near canals (maintenance).
140. Lost travelers rescued by guards = new migrants or rewards.

*(Each numbered item gets: data fields, trigger conditions, UI surface, and balance values — tracked as build tickets during development.)*
