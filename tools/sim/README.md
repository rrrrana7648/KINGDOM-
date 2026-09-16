# Headless simulation tests

These run the **real add-on scripts** from `packs/BP_Kingdom/scripts` inside Node with an
in-memory mock of the Bedrock engine (`mock-server.mjs`, `mock-ui.mjs`), so core logic is
testable on any machine without Minecraft.

The mocks are **strict on purpose**: they expose only the members that exist in the stable
`@minecraft/server` 2.1.0 / `@minecraft/server-ui` 2.0.0 modules and throw on the same
misuse the real engine rejects (1.x positional `slider/dropdown/textField/toggle` arguments,
out-of-range defaults, non-string labels, incomplete `TitleDisplayOptions`, unknown
`TeleportOptions`, bad custom-command definitions, non-namespaced item ids, over-long lore…).
`world.beforeEvents.chatSend` is deliberately `undefined`, exactly like the stable module.
Forms auto-cancel unless a test queues an answer with `queueResponse({selection})` or
`queueResponse({formValues:[…]})`.

```bash
cd tools/sim
node --no-warnings --loader ./loader.mjs run-sim.mjs
```

Exits non-zero if any assertion fails. Covered through M12:

- clock mapping (20-minute vanilla day → colony hours)
- v1 → v12 save migration, sharding and save sanitization
- founding party composition and wages
- a full simulated day: woodcutting with replant, crop harvest/replant, quarrying,
  meals at every phase, curfew sleep, end-of-day delivery (virtual + physical chest)
- Day Roll wage totals, mood bounds, production reporting
- obstacle-avoiding movement and unreachable-column skip
- M3: floats, quotas, grades, freelance pay, cart-runner consolidation, ledger
- M4: market math, tax presets/holidays/black-market, GDP & net closure
- M5: mint chain, printing, inflation arithmetic, loans and crown debt
- M6: decree escrow/crews/progress/completion/failure, tax-edict restore, footprints
- M7: housing/rents, courtship→wedding→birth→aging, adoption, caps, wills
- M8: missions, clipper prices, exports/imports, refugees, auto-grow, hall effects
- M9: guards/militia/defense, crime→trial→sentence (fine/prison/banish/acquit), flight→bounty→recapture, won/lost raids, protest→riot→rebellion
- M10: season/year turns, weather, yields, festival, sickness/doctors/famine, research completion, fate expiry/fire/decisions
- M11: crown claim, commissions, writ gating, abdication
- M12: chat orders incl. gated writs, toggles, decisions
- M12.1: `main.js` boots on the strict mock; `/kingdom:start` → founding forms → Scepter;
  `/kingdom:menu`; `/kingdom:order` (mandatory word, optional args, `!` tolerated, console
  origin refused); Scepter use claims the Crown; a **full crawl of the Kingdom Menu**
  (16 pages, ~500 leaves — every form is built against the 2.0.0 signatures); the three
  simulation loops tick a real Day Roll; save shards stay under the 32 767-byte dynamic-property
  cap; relog keeps one Scepter; `entityDie` on citizens vs strangers

Touch feel, layout and sounds are still verified manually per `docs/TESTING_M*.md`.
