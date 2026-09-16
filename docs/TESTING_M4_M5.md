# ✅ M4–M5 manual test checklist — Market, Taxes, Mint & Bank (Bedrock 1.21.100+)

Prereqs: M1–M3 working (founding, released workers, work sites, a buyer stall or two).

## 1. Market & daily books (M4)
- [ ] Sidebar HUD now shows live **Net/day** (green▲/red▼), **GDP/day** and **Inflation %** instead of dashes.
- [ ] Dawn report includes GDP, net, market volume/shoppers, tax breakdown and a prices line.
- [ ] Kingdom Menu → **Treasury & Taxes** shows the income/expense books (taxes, sales, shops, rents, harbor, fees vs wages, freelance, building, missions, interest, welfare, trade).
- [ ] After a production day, GDP ≈ goods value + market spending; the audit ledger holds `market` and `tax` rows.
- [ ] Economist nudges appear when granaries run low or a stall starves.

## 2. Tax engine (M4)
- [ ] **Treasury & Taxes → Tax presets**: Low / Normal / High / Double War Tax / Holiday switch the rate line; wages next dawn reflect income + head tax.
- [ ] **Tax levers** set a custom mix (income, sales, head, land, import, export, war surcharge).
- [ ] **Declare 3-day tax holiday**: collections pause for 3 dawns, then normal rates resume automatically.
- [ ] Punishing sales tax (>20%) raises a black-market warning in the morning report.

## 3. Royal Mint & inflation (M5)
- [ ] Stock sugarcane + ink sacs + copper/iron ingots in the warehouse.
- [ ] **Mint & Bank → Mill paper / Grind ink / Engrave plate** consume stock and fill mint stores.
- [ ] **Print banknotes**: treasury and money supply rise by the face value minus press fees; plate wear climbs; a plate shatters at 100%.
- [ ] Printing far beyond GDP growth raises **inflation** over the next dawns (market meals and the price index climb); restraint cools prices.
- [ ] **Demonetization edict** crushes inflation at −12 mood colony-wide.

## 4. State Bank (M5)
- [ ] **Issue citizen loan**: borrower savings rise, treasury falls; the loan auto-repays a tenth daily plus interest; past-due loans flag in the report.
- [ ] **Crown borrow / repay**: national debt accrues daily interest; debt above half the money supply warns.
- [ ] **Set interest rates** changes both rates; a built State Bank hall cuts citizen rates by 2/level.

## 5. Persistence
- [ ] Quit & re-enter: taxes, mint stores, loans, debt, books history and ledger survive (sharded saves v5); old M3 worlds migrate forward without loss.

## Automated regression
`cd tools/sim && node --no-warnings --loader ./loader.mjs run-sim.mjs`
M4–M5 assertions cover market math (₹20/5 shoppers), tax totals, GDP/net closure, presets, holidays, black-market risk, the full mint chain, inflation arithmetic, loans, repayments and crown debt.
