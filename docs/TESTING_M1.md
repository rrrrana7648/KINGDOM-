# ✅ M1 manual test checklist (Android Bedrock 1.21.100+)

After importing `dist/KINGDOM.mcaddon` and enabling **both** packs on a new world:

1. **Command**
   - [ ] Typing `/kingdom:` shows `/kingdom:start` in command suggestions.
   - [ ] `/kingdom:start` opens the **Found Your Kingdom** form (name, banner, difficulty).
   - [ ] Cancelling the form prints the cancellation hint, no crash.
2. **Minister**
   - [ ] On confirm, a title banner appears and **Sir Edmund Hale · Minister** spawns in front of you.
   - [ ] His greeting form has **Gather my four settlers**.
3. **Founding party**
   - [ ] Tapping it spawns 2 male + 2 female named settlers with profession name tags
       (Builder, Woodcutter, Farmer, Laborer).
   - [ ] You receive a **Royal Scepter** (renamed stick) with lore.
   - [ ] Roster in the scepter menu shows all 5 citizens with correct suggested wages
       (₹60 Minister, ₹9 Builder, ₹6 Woodcutter/Farmer, ₹5 Laborer).
4. **Clock & HUD**
   - [ ] Action bar above the hotbar shows ticking clock + phase + Day 1, changing through
       Dawn → Morning shift → Midday meal → Curfew over 20 real minutes.
   - [ ] Sidebar "KINGDOM" lists population (5), Treasury ₹1000, Happiness, policy.
   - [ ] After a full 20-minute day cycle a **Dawn of Day 2** morning report posts to chat.
5. **Scepter menu**
   - [ ] Long-press/use scepter opens Kingdom Menu; all five buttons open their forms.
   - [ ] Population Policy changes persist: set Fixed cap 40 → HUD last line updates.
   - [ ] Treasury page shows Royal Economist wage samples incl. ₹35 deep-dark miner.
6. **Persistence**
   - [ ] Save & quit → reopen world: colony, citizens, policy all still present
       (dynamic property), and a missing scepter is re-granted on respawn.
7. **Repeat**
   - [ ] Running `/kingdom:start` again says the kingdom already exists (no duplicates).

## Known M1 limitations (by design, later milestones)
- NPCs are vanilla villagers with name tags (custom models at M12).
- Settlers follow vanilla villager AI — work/follow/schedule AI is M2.
- HUD shows dashes for Food/Security/GDP/Inflation until those systems land.
