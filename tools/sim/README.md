# Headless simulation tests

These run the **real add-on scripts** from `packs/BP_Kingdom/scripts` inside Node with an
in-memory mock of the Bedrock engine (`mock-server.mjs`), so core logic is testable on any
machine without Minecraft.

```bash
cd tools/sim
node --no-warnings --loader ./loader.mjs run-sim.mjs
```

Exits non-zero if any assertion fails. Covered through M8:

- clock mapping (20-minute vanilla day → colony hours)
- v1 → v8 save migration, sharding and save sanitization
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

The mock implements only the surface the scripts use; UI forms auto-cancel (menus are
verified manually per `docs/TESTING_M*.md`).
