# Civ3 Empire Viewer

Offline single-file HTML viewer for Civilization III: Complete saves. Published at
github.com/IamTheHttp/civ3-web-assist. Layouts and formulas: `docs/REVERSE_ENGINEERING.md`.
Read `docs/learnings/README.md` first: workflow, player preferences, reverse-engineering method, open questions.

## The player and the setup
- Plays **Civilization III Complete, GOG version**, on **Windows**, with the C3X exe mod.
- Current game: **Maya**, Republic, Monarch difficulty, Standard 100x100 map wrapping east–west, 42 cities, turn 194.
  Default rules (`conquests.biq`).
- The save (`maya.SAV`) and `conquests.biq` go in `local-data/` (gitignored). Never commit game files or saves.

## Rules
- **Verify, don't guess.** Every formula and offset in the viewer was checked against the real save. Report what is
  verified and what is inferred. The player dislikes made-up facts and asks for references.
- `index.html` is a build output of `build.py`. Edit `src/`, then rebuild, and commit both.

## Verified facts the viewer relies on
- Save = PKWare DCL compressed (`blast`); the JS port is fuzz-tested against the C original (4000 random + 300 valid streams).
- Corruption/waste: the game's own rule, transcribed from the exe (`City_compute_corrupted_yield` 0x4B1190 and helpers), matches
  **exactly in 42/42 cities** for both (the community formula: 27/42 each). Details and the differences: `docs/CORRUPTION.md`.
- AI cost factor (DIFF +104; human = 10) from the **game** difficulty scales AI food boxes, unit and building costs
  (`Leader_get_food_cost_factor` 0x5660E0, `Leader_get_unit_cost` 0x56A210, building cost 0x569FE0).
- Corruption is applied to **raw** commerce; then the slider split (lux and gold rounded to nearest, science gets the rest);
  then building bonuses **add** (+50% each, +100% for research-doubling wonders), floored. Reproduces gold/sci/lux exactly
  in 40/42 cities; the other 2 are calibrated per city (the capital has +10 commerce not in its record; Memphis +1 gold from Wealth).
- Slider rate limit: GOVT +520 (OpenCiv3 `ScienceRateCap`, tenths) is 10 for every government in the default rules; the player
  confirmed 100% gold is possible under every government. The Effect columns use the save's slider, or the "Try slider" one.
- Specialist output is stored separately (fields 528/532/536) and is NOT in the city's gold/sci/lux.
- Difficulty optimal-cities % (DIFF +108): Chieftain 100, Warlord 95, Regent 90, Monarch 85, Emperor 80, Demigod 70,
  Deity 60, Sid 50. Difficulty corruption % (DIFF +116): 100 at every level in the default rules.
- Building costs in BIQ are in **tens of shields**; unit costs are plain shields.
- Growth: box = 2 × factor × (sizeClass+1); factor 10 for humans (AI: difficulty), halved with accelerated production;
  sizeClass: >maxCity → 2, >maxTown → 1, else 0 (from the game exe's city screen code).
- Food: food from tiles (+360) − food eaten (+492) = net food (+504) in 42/42 cities.
- Size caps: BLDG flag byte +237 bit3 allows size level 2, bit4 level 3 (OpenCiv3 `Bldg.cs`). Default rules: Aqueduct (level 2);
  Hospital and Shakespeare's Theater (level 3). Every city with a full food box at a size limit lacks the building (9/9).
  Cities above the town limit without an Aqueduct exist (Copán, size 12: fresh water, not in the save data), so growth
  counts as blocked only when the food box is full at the limit.
- Known techs: after the 856-byte GAME block, one int per continent (GAME +300), then one int per tech; bit k = player k
  knows it (OpenCiv3 `Sav.cs`). Maya: 37/83; every building in production needs a known tech (25/25).
- Map tiles: 212-byte records (first header length 36), row by row, W/2 per row; +8 river edges, +30 city id (short),
  +34 continent/water body (short), +57 low nibble terrain (TERR: 11 Coast, 12 Sea, 13 Ocean). City tiles match 42/42;
  all 7 cities with a Harbor / Coastal Fortress are coastal. All 9 cities past size 6 without an Aqueduct have fresh
  water: 8 a river on the city tile, 1 a one-tile lake (lake = water body of ≤ 20 tiles: the limit is assumed).
- Players (LEAD, save offset = C3X `Leader` memory offset − 20): +140 government, +384 city count (matches CITY records
  7/7), +412 reputation[32] × 76 bytes (first int: war declarations on this player), +3356 at war[32] (bytes),
  +3388 embassy[32] (bytes), +3740 contact[32], +3868 treaties[32] (meaning of bits unknown), +3996 allies against
  player k[32] (bitmask of players). Each LEAD is followed by its CULT record: +12 total culture, +16 culture last turn
  (yours equals the sum of your cities' culture). GAME +84: remaining players bitmap. AI governments all read Republic
  in the Maya save (not confirmed in-game). Attitude isn't stored: the game computes it (`Leader.get_attitude_toward`).
- BLDG +216 spaceship part (−1 if not one), +220 required advance; flag byte +237 bit6 near water, bit7 near river;
  +240 bit0 coastal (OpenCiv3 `Bldg.cs`; spaceship flag matches the 10 SS parts in the default rules).
- Current buildings = BITM bitmap, not BINF history (captured cities keep the history of destroyed Palaces etc.).

## How to work here
- Build: `python3 build.py`. Tests: see README "Develop". The UI suite needs Python `playwright` (+ `playwright install chromium`)
  and the save in `local-data/`.
- What-ifs are outlined in amber, keyed by city id + name, and cleared for a different game (world seed).

## Player preferences
- Wants things that "just run"; tests in-game and reports back precisely.
- Pushes back when something seems off — check the reasoning against data and show the evidence.
- Wants concise UI text, strong contrast colours, no side-scrolling, customizable views.

## Open items
- Luxury multipliers are unverified (the player's lux slider is 0%).
- Communism/Anarchy corruption is unverified.
- The model assumes every city is connected to the capital by trade (not read from the save; otherwise distance × 5/4;
  mismatches show "~").

## Ideas (not started)
- **Unit targets for milestones.** Workers and military units need the save's UNIT records (or the LEAD unit counts),
  which the viewer doesn't read yet; check them against a real save first.
