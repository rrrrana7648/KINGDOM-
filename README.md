# 🏰 KINGDOM — Bedrock Add-on (Android)

Rule a living Victorian-era colony inside Minecraft **Bedrock** (mobile): you are the King/Governor, a Minister carries out your edicts, managers hire workers, citizens marry, raise families, earn wages, trade, pay taxes, and your treasury shows live **GDP and net profit** — including a paper-and-ink Royal Mint with inflation.

- 📄 **Full game design (140 features):** [`docs/KINGDOM_Design.md`](docs/KINGDOM_Design.md)
- 🛠️ **Technical build plan & milestones:** [`docs/TECHNICAL_PLAN.md`](docs/TECHNICAL_PLAN.md)
- 🎯 Target: **Minecraft Bedrock 1.21.60+**, Android first, single-player + co-op
- 🧩 Language: **JavaScript (Script API 2.1.0)** + JSON — Bedrock cannot run Java/Forge mods
- 📦 Shipped as one `.mcaddon` (Behavior Pack + Resource Pack)

## ▶️ Play the current build (Milestones M1–M3)

- **M1:** `/kingdom:start` founding flow, Sir Edmund Hale (Minister), 2-men + 2-women founding party, Royal Scepter menu, live action-bar colony clock (vanilla 20-minute day), sidebar HUD, population policy, suggested wages, world-saved state.
- **M2:** citizens follow the King or live the daily schedule (breakfast · two shifts · lunch · deliveries · dinner · leisure · curfew sleep), need bars and mood, woodcutter/farmer/quarry labor with replanting and XP levels, follow/armed/profession orders, work-site marking, stockpile chest delivery, monster flight, daily wage roll, death handling, relog-safe NPC linking.
- **M3:** Crown Warehouse economy — hire licensed **commodity buyer clerks** (wood/stone/ore/grain/cash-crop/fish/livestock stalls) each with a linked chest, daily **coin float**, **quota**, adjustable **price band** and A/B/C quality grades; citizens choose **crown salary vs freelance piece-rate**; dawn cart-runner consolidates stall chests into the warehouse, refunds and re-funds floats; full **audit ledger**; save data is sharded for scale.

1. Run `bash tools/package.sh` (or download a release `.mcaddon`).
2. Copy `dist/KINGDOM.mcaddon` to your Android phone and open it with Minecraft — both packs import.
3. Create a new world → Behavior Packs & Resource Packs → enable **KINGDOM**.
4. Run `/kingdom:start` and follow Sir Edmund. Long-press the **Royal Scepter** (stick) to open the Kingdom Menu.

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

M1 scaffolded; milestones M2–M12 are defined in the technical plan. No content from the design's boundary list (forced labor/marriage/explicit content) will be implemented.
