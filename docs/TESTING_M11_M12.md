# Testing M11 (Officers & Orders) & M12 (Art, Stings, Packaging)

Manual in-game checklist. Headless coverage: `node --loader ./loader.mjs run-sim.mjs` in `tools/sim`.

## M11 — Co-op officers & chat orders

1. **Coronation**: first player to use the Scepter is 👑 CROWNED (message + main
   menu "you rule as 👑 Crown"). Second player rules as "visitor".
2. **Open realm**: with no officers, every player may do everything (solo-safe).
3. **Commission**: 🕯️ Officers → commission each office by gamertag. Only the
   Crown can commission/dismiss (others see "Only the Crown…").
4. **Writs bite**: with a Magistrate + Marshal + Treasurer + Chamberlain:
   - a stranger's ⚖️ sentence / 🥷 bounty / 📜 laws refuse ("belongs to the Magistrate");
   - guard posting/recall + muster refuse ("belongs to the Marshal");
   - tax presets/levers/holiday refuse ("belongs to the Treasurer");
   - mint print/loans/crown-debt/rates/demonetize refuse ("belongs to the Treasurer");
   - marriage/child approvals + festival refuse ("belongs to the Chamberlain");
   - the matching officer succeeds; the Crown always succeeds.
5. **Dismissal**: dismiss the Magistrate — their gavel writ dies immediately.
6. **Chat orders**: say `!help`, then run every order: `!status !treasury !mood
   !docket !cases !guards !tech !officers !judge !bounty !muster !festival !ration
   !quarantine !decide !grant !revoke !advance`. Gated orders honor writs
   (Bob's `!judge` refuses once a Magistrate exists).
7. **Toggles**: ⏰ Clock → chat orders OFF — `!status` is ignored (normal chat).
   Sound stings OFF — verdicts/festivals/dawns fall silent.

## M12 — Art, stings, packaging

1. **The Scepter**: `/kingdom:start` + relog grants `kingdom:scepter` (gold
   sprite). Using it opens the menu. Old stick-scepters still open menus.
2. **Regalia**: creative inventory holds the gavel, guard badge, royal seal and
   research scroll with proper names (lang) and sprites.
3. **Stings**: dawn bell on every morning report; gavel on sentence; trumpet on
   muster/commission/decision; festival on feast day; alarm on lost raid;
   wedding on approved marriage. No crash with stings muted.
4. **HUD**: sidebar shows 🛡️ Security rating + ✊ unrest and the 🌦 sky line
   (season + weather). Action-bar clock unchanged.
5. **Repaint**: `node tools/art/make-art.mjs` regenerates all 5 sprites.
6. **Package**: `bash tools/package/package.sh` builds `dist/KINGDOM.mcaddon`;
   both manifests read the same version; `node tools/package/validate.mjs`
   (if present) passes with 0 errors.

## Regression

- Full sim green; no warnings.
- Two-player smoke: crown + officer act simultaneously; no form dead-ends.
- `.mcaddon` installs on a clean device; founding → dawn → menu all work.
