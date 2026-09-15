# 🏰 KINGDOM — Bedrock Add-on (Android)

Rule a living Victorian-era colony inside Minecraft **Bedrock** (mobile): you are the King/Governor, a Minister carries out your edicts, managers hire workers, citizens marry, raise families, earn wages, trade, pay taxes, and your treasury shows live **GDP and net profit** — including a paper-and-ink Royal Mint with inflation.

- 📄 **Full game design (140 features):** [`docs/KINGDOM_Design.md`](docs/KINGDOM_Design.md)
- 🛠️ **Technical build plan & milestones:** [`docs/TECHNICAL_PLAN.md`](docs/TECHNICAL_PLAN.md)
- 🎯 Target: **Minecraft Bedrock 1.21.60+**, Android first, single-player + co-op
- 🧩 Language: **JavaScript (Script API 2.1.0)** + JSON — Bedrock cannot run Java/Forge mods
- 📦 Shipped as one `.mcaddon` (Behavior Pack + Resource Pack)

## ▶️ Play the current build (Milestones M1–M12)

- **M1:** `/kingdom:start` founding flow, Sir Edmund Hale (Minister), 2-men + 2-women founding party, Royal Scepter menu, live action-bar colony clock (vanilla 20-minute day), sidebar HUD, population policy, suggested wages, world-saved state.
- **M2:** citizens follow the King or live the daily schedule (breakfast · two shifts · lunch · deliveries · dinner · leisure · curfew sleep), need bars and mood, woodcutter/farmer/quarry labor with replanting and XP levels, follow/armed/profession orders, work-site marking, stockpile chest delivery, monster flight, daily wage roll, death handling, relog-safe NPC linking.
- **M3:** Crown Warehouse economy — hire licensed **commodity buyer clerks** (wood/stone/ore/grain/cash-crop/fish/livestock stalls) each with a linked chest, daily **coin float**, **quota**, adjustable **price band** and A/B/C quality grades; citizens choose **crown salary vs freelance piece-rate**; dawn cart-runner consolidates stall chests into the warehouse, refunds and re-funds floats; full **audit ledger**; save data is sharded for scale.
- **M4:** market days (citizen spending → GDP services, sales tax, Crown shop profit), seven-lever **tax engine** with presets (Low/Normal/High/Double War Tax/Holiday), live **GDP & net-profit** books, economist nudges, black-market warnings.
- **M5:** **Royal Mint** physical chain (mill paper, grind ink, engrave plates, print ₹100 batches), money supply, **inflation** and price index, demonetization edict, **State Bank** citizen loans/mortgages and Crown foreign debt with rates.
- **M6:** royal **decrees with deadlines & budgets** (build, recruit, stockpile, tax edict, custom), manager reports, completion bonuses, missed-deadline strikes; **blueprint construction** with crews, warehouse materials and real raised footprints; building halls buff their trades; scepter town plazas; hands-off ruling budget.
- **M7:** consent-gated **courtship → marriage requests → engagements → weddings**, child requests with thresholds, 3-day pregnancies, **6-day childhood** (baby → toddler → child → adult with inherited XP), single-adopter orphans, named **house registry** with rents, wills & inheritance.
- **M8:** **recruiter missions** and **refugee ships** (willing, paid migration gated by food/beds/happiness and population policy), buildable **harbor** with clipper schedules, world-price booms/gluts, exports, imports and duties, auto-grow tithe-days.
- **M9:** the underworld (theft, smuggling, embezzlement audits, counterfeiting, fugitives & bounties), the **Magistrate's court** (docket, tariff laws, fines/prison/banishment, chain gang), posted **guards** with day patrols + alternating night watches, inspectors, paid **militia**, bandit **raids**, and the unrest ladder (petitions → strikes → riots → rebellion).
- **M10:** the turning year (40-day seasons, monsoon/frost/storms shaping farms & scaffolds), **festivals**, rationing & quarantine, sickness/doctors/plague/famine with a **graveyard**, a 16-card **fate deck** with pending royal decisions, and a 7-inquiry **research tree** (irrigation, tools, steam, railway, telegraph, medicine, platecraft).
- **M11:** co-op rule — first scepter claims the **Crown**, which commissions Chamberlain/Treasurer/Magistrate/Marshal; gated writs bind every menu and the full **`!chat orders`** system (`!help`).
- **M12:** forged **custom items** (Royal Scepter, gavel, guard badge, royal seal, research scroll), curated sound **stings** with mute, live security + sky HUD, and one-command packaging & validation.

1. Run `bash tools/package.sh` (or download a release `.mcaddon`).
2. Copy `dist/KINGDOM.mcaddon` to your Android phone and open it with Minecraft — both packs import.
3. Create a new world → Behavior Packs & Resource Packs → enable **KINGDOM**.
4. Run `/kingdom:start` and follow Sir Edmund. Long-press the **Royal Scepter** (custom regalia, auto-granted) to open the Kingdom Menu — or rule from chat with `!help`.

> Custom commands in API 2.1.0 are stable — no Beta Experiments toggle needed. The command is namespaced by Bedrock rules: **`/kingdom:start`** (a bare `/kingdom` is not permitted by the engine).

## 🗂️ Layout

```
docs/      design + technical plan
packs/
  BP_Kingdom/  behavior pack — scripts (the simulation)
  RP_Kingdom/  resource pack — art/models/sounds (M12 art pass)
tools/package.sh → dist/KINGDOM.mcaddon
```

## 🚧 Status

M1–M12 built and regression-tested (`tools/sim`, green, zero warnings). No content from the design's boundary list (forced labor/marriage/explicit content) was implemented.
