# ✅ M3 manual test checklist — Crown Warehouse economy (Bedrock 1.21.60+)

Prereqs: M1–M2 working (founding, released workers, work sites).

## 1. Warehouse
- [ ] Place a chest for the central warehouse, look at it → **Warehouse, Sites & Buyers →
      Register warehouse chest**; coordinates show green.
- [ ] Crown workers (salaried) deliver there; items appear in the chest and in
      **Treasury → Warehouse stock**; rations rise with grain/fish/meat crops.

## 2. Hiring commodity buyers
- [ ] Place a chest near the forest, look at it → Buyers → **Hire wood buyer → Hire — use the
      chest I'm looking at**: a clerk villager spawns beside it ("WOOD BUYER L1"), title shows
      stall opened, ₹60 float leaves the treasury.
- [ ] Buyer list shows `float ₹60/60 · quota 0/128 · ×1`; repeat for other commodities at
      separate chests (stone at the quarry, grain by the farm, …).
- [ ] Hiring while at a fixed population cap is blocked with a warning.

## 3. Freelance vs crown pay
- [ ] Roster → woodcutter → **Release as freelance (piece-rate)**; worker's line shows
      "piece-rate".
- [ ] During the shift the freelancer walks to the wood stall, sells felled logs: clerk float
      drops, worker Savings rise, quota counter rises, ledger gains **purchase** rows with
      grade C/B/A (grade improves at L3/L5) and unit rate.
- [ ] Open buyer detail and set price band ×1.1 → new sales pay 10% more; ×0.9 pays less.
- [ ] Set a tiny quota: once reached, extra goods stay with the worker (sold next dawn);
      a salaried crown worker still delivers past the quota and earns nothing extra.
- [ ] With **no** matching stall, freelancers sell at the warehouse counter, paid directly
      from the treasury; if the treasury is empty the sale is refused.

## 4. Daily settlement
- [ ] Dawn report shows salaries, freelance purchases, floats funded, rations, production.
- [ ] At the dawn cart-run the stall chest is physically emptied into the warehouse chest,
      stall stock moves into the warehouse ledger, unspent float returns to the treasury and
      the day's float is re-funded (quota resets to 0).
- [ ] Buyer clerk earns ₹12/day crown salary; a freelance worker earns **no** daily salary.

## 5. Ledger & dismissal
- [ ] Kingdom Menu → **Audit Ledger** lists newest transactions (commodity, grade, qty, rate,
      pay, seller) with Older/Newer pages.
- [ ] Buyer detail → **Dismiss buyer**: stall closes, unspent float returns, clerk becomes a
      following laborer; past ledger entries remain.
- [ ] Quit & re-enter: stalls, floats, ledger and stock survive (sharded saves); NPCs relink.

## Automated regression
`cd tools/sim && node --no-warnings --loader ./loader.mjs run-sim.mjs`
M3 assertions cover float funding, freelance pay at stalls, grade rates, quota rejection,
crown quota bypass, warehouse fallback pay, chest→chest cart-runner consolidation, float
return/refund, salary rules, ledger writes and v1→v3 sharded migration.
