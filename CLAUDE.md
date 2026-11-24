# Civ3 Empire Viewer

Offline single-file HTML viewer for Civilization III: Complete saves. Published at
github.com/IamTheHttp/civ3-web-assist. Layouts and formulas: `docs/REVERSE_ENGINEERING.md`.
Read `docs/learnings/README.md` first: workflow, player preferences, reverse-engineering method, open questions.

## The player and the setup
- Plays **Civilization III Complete, GOG version**, on **Windows**, with the C3X exe mod.
- Current game: **Maya**, Republic, Monarch difficulty, Standard 100x100 map wrapping east–west, 42 cities, turn 194.
  Default rules (`conquests.biq`).
- The save (`maya.SAV`) and `conquests.biq` go in `local-data/` (gitignored). Never commit game files or saves.
  Exception (the player's decision): the yield icons in `src/icons/` (shield, gold, upkeep, science, luxury, food), cut
  from the game's `Art/city screen/CityIcons.pcx`, with the disclaimer in the README and the help dialog. No other game
  art. `build.py` inlines them as data URIs.

## Rules
- **Verify, don't guess.** Every formula and offset in the viewer was checked against the real save. Report what is
  verified and what is inferred. The player dislikes made-up facts and asks for references.
- `index.html` is a build output of `build.py`. Edit `src/`, then rebuild, and commit both.

## Verified facts the viewer relies on
- Save = PKWare DCL compressed (`blast`); the JS port is fuzz-tested against the C original (4000 random + 300 valid streams).
- Corruption/waste: the game's own rule, transcribed from the exe (`City_compute_corrupted_yield` 0x4B1190 and helpers), matches
  **exactly in 42/42 cities** for both (the community formula: 27/42 each). Details and the differences: `docs/CORRUPTION.md`.
- AI cost factor (DIFF +104; human = 10) from the **game** difficulty scales AI food boxes, unit, building and tech costs
  (`Leader_get_food_cost_factor` 0x5660E0, `Leader_get_unit_cost` 0x56A210, building cost 0x569FE0, tech cost 0x569C10:
  unnamed in C3X, reads TECH +68 cost). History's AI comparison shows AI food, shields and science × 10 / factor.
- Other civs' cities: every CITY record passes the same self-checks as the player's (68/68 in the Maya save).
- Corruption is applied to **raw** commerce; then the slider split (`City_recompute_commerce` 0x4B07C0: luxury and science
  rounded, halves up; luxury cut if the two exceed the net; gold gets the rest); then building bonuses **add** (+50% each,
  +100% for research-doubling wonders), floored. Reproduces gold/sci/lux exactly in 41/42 cities; Memphis is calibrated
  (+1 gold from Wealth). Checked in-game at
  40% sci / 40% gold / 20% lux in 3 cities (Cobá: gold 13, sci 12, lux 4 with a Marketplace: no luxury bonus).
- Slider rate limit: GOVT +520 (OpenCiv3 `ScienceRateCap`, tenths) is 10 for every government in the default rules; the player
  confirmed 100% gold is possible under every government. The Effect columns use the save's slider, or the "Try slider" one.
- Tile yields: the game's rule (`Map_calc_food/shield/commerce_yield_at` 0x5D7180 / 0x5D75F0 / 0x5D7AD0) reproduces every
  city's food, shields and commerce from its worked tiles in **42/42** (Maya save) and **21/21** (1140 AD save). Worked tile: TILE +104 = city id (city tile included).
  City tile: food 2 (+1 Agricultural; exempt from the tile penalty with fresh water, river or lake: exe vtable call at 0x5D75A9), +1 shield and +1 commerce above the town limit, capital commerce at least 4.
  GOVT +24 trade bonus (+1 commerce on a tile with commerce: Republic, Democracy), +20 tile penalty (−1 on a yield above 2:
  Despotism, Anarchy), +12 building maintenance (none under Anarchy). Anarchy wastes every coin and shield (exe 0x4B1239;
  the player confirmed). Railroad (TILE +52 bit 1): +1 shield on a mined tile, +1 food on an irrigated one (not the city
  tile): 21/21 on the 1140 AD save. Farmland, Golden Age and Colossus-type wonders aren't transcribed (not on a save).
- Units: UNIT records (length 472; +28 owner, +32 nationality = civ, +40 type) match LEAD +376 unit count for every player
  (Maya 141; LEAD +380 military 77). Gold support (`Leader_sum_unit_maintenance` 0x55D310, `get_unit_support_info` 0x53A960):
  (units − free − units of another nationality or a type without PRTO +208 support) × GOVT +556 gold; free = GOVT +540
  + per town / city / metropolis +544/+548/+552 (+540 = −1: no unit costs). The game's income (0x55DD50) adds it to building
  upkeep. Maya, Republic: 141 units − 49 of another nationality = 92 counted, 84 allowed, 8 × 2 = 16 gold; the in-game
  Military Advisor shows 92 units and 84 allowed.
- Net gold per turn = cities' gold (incl. tax collectors) + gold per turn from deals (each other player's LEAD +3612 +
  4 × your player; exe 0x55DD50) − building upkeep − unit support. Maya: 146 + 6 (French) − 103 − 16 = 33, as the Domestic
  Advisor shows. Interest (Wall Street-type, 5% of the treasury, at most 50) is in the exe but not transcribed.
  The Domestic Advisor (F1) reconciles line by line: "From cities" 1169 = gold 144 + science 582 + corruption 443 (the game
  lists corruption as income and again as an expense), taxman +2, other civs +6, interest 0 = income 1177; science 582,
  entertainment 0, corruption 443, maintenance 103, unit costs 16; net +33.
- Tourist attractions (exe 0x4B0710): a building with BLDG +248 bit 17 (default rules: 18 wonders) older than 1000 years
  adds commerce before corruption: <1500 → 2, <1750 → 4, <1875 → 6, <2000 → 8, <2250 → 10, <2500 → 12, else 14. Age =
  current year − its BINF year. Year from the GAME calendar (start −4000; periods 25/25/40/50/100/100/100 turns at
  50/40/25/20/10/5/2 years): turn 194 = 790 AD. Chichén Itza: +10 (Mausoleum 6 + Zeus 4), the commerce the save omits.
- Production (`City_recompute_production` 0x4B05D0): shields = (raw − waste) × (4 + Σ BLDG +208 + best power plant) / 4,
  floored. Power plants (BLDG +237 bit5) count only with their required building (Factory), only the best one; a building
  obsolete by a known tech (+224) counts nothing. Default rules: Factory 2, Manufacturing Plant 2, Coal/Hydro/Solar 2,
  Nuclear 4, Iron Works 4 (CivFanatics agrees: +50% each, Nuclear +100%). CITY +508 is the production after the
  multiplier: reproduced in 5/5 cities with Factory (×1.5) or Factory + Coal Plant (×2) on the 1140 AD save.
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
  +3388 embassy[32] (bytes), +3740 contact[32], +3868 treaties[32] (bit1 right of passage; other bits unknown),
  +3996 allies against player k[32] (bitmask of players; in your own record: your allies against k). Both confirmed
  in-game (Japan and France: right of passage, allied with you against the Ottomans and the Celts). Each LEAD is followed by its CULT record: +12 total culture, +16 culture last turn
  (yours equals the sum of your cities' culture). GAME +84: remaining players bitmap. AI governments all read Republic
  (confirmed in-game). Attitude isn't stored: the viewer computes it with the game's rule (`Leader_get_attitude_toward` 0x440100;
  details in `docs/learnings/diplomacy.md`); matches the diplomacy screen for 4/4 civs (Japan, France Gracious; America,
  Ottomans Furious).
- BLDG +216 spaceship part (−1 if not one), +220 required advance; flag byte +237 bit6 near water, bit7 near river;
  +240 bit0 coastal (OpenCiv3 `Bldg.cs`; spaceship flag matches the 10 SS parts in the default rules).
- War weariness (`docs/learnings/war-weariness.md`): points per enemy at LEAD +3228 + 4k. Faces per city (exe 0x4BD780):
  base size (high) or size/2 (low; GOVT +560), per enemy at war ≤30 → 0, 31–60 → ½, 61–120 → 1, >120 → 2 × base, summed,
  at most the size. CITY +152..+160 store unhappiness causes in % (+153 base, +154 war weariness): the formula matches
  **49/49** cities that have unhappy citizens (Maya save, all civs, all Republic) and **59/59** on the 1140 AD save
  (all civs: Republic low 28/28, Democracy high 29/29, Fascism none 2/2).
- Trade (Diplomacy columns): the trade screen (exe 0x50FA60) lists a tech when one side knows it and the other can research it
  (0x561580: prerequisites TECH +88..+100 known, TECH +72 era ≤ the receiver's era LEAD +224) and TECH +104 lacks 0x80000
  (0x437F80; none in the default rules). No embassy needed (confirmed in-game). Luxuries: CITY +132 = bitmask of GOOD
  (+60 class: 1 luxury) a city reaches from its civ's own sources, imports not included; France shows only Dyes
  (confirmed in-game). Strategic resources: GOOD +60 class 2. An AI sells a resource only with a spare source: the game keeps
  per civ a byte of sources − 1 (Leader +5656, readers add 1; trade check exe 0x55EAE0); the viewer counts resource tiles
  (TILE +12) in the civ's borders (TILE +9) linked to one of its cities by road, railroad, river or city tiles (the game's
  per-tile connected_city_ids, Tile +110, aren't in the save; rivers assumed to connect; harbours not followed). You can sell your last one (confirmed in-game).
  Treasury = LEAD +48 + +52 (`Leader_set_treasury` 0x4C2350; France 100, confirmed in-game). 0x55DA60 caps only the gold per turn
  that you offer. An AI refuses to pay more gold per turn than its net gold per turn − its cities − 1
  (`Leader_consider_trade` 0x440EE0; each gold per turn counts 18 in its deal value): France 80 − 12 − 1 = 67, confirmed
  in-game. Net gold per turn (`Leader_compute_income` 0x55DD50) = cities' gold + tax collectors + gold per turn received −
  paid (living players) − building upkeep (CITY +20) − unit support; an AI gets DIFF +92 more free units and DIFF +96 per
  city (Monarch 4 and 1; exe 0x55D310). Not transcribed: a per-city term (City +624 in memory) and interest. The same rule
  gives your +33.
- Culture flip (exe 0x4B28D0, each city every turn; transcribed, **not checked against a flip**): needs GAME +17 bit 7
  (culture flipping on); a capital or a city with flip immunity (CITY +64 turns) never flips. Per other living civ k:
  P = k's citizens in the city (CTZN +296 = k's race; twice if CTZN +8 is set, always 0 on the saves) + k's tiles among
  the 20 around it (TILE +9 owner) − 2, at most 10; ×2 in disorder (CITY +24 bit0); ×2 if k's culture in the city
  (CITY +224 + 4k, the culture each owner accumulated) is above the owner's; × (k's CULT +12 + 1) / (owner's + 1),
  at most ×4; ÷2 celebrating (bit1); − military units on the tile (PRTO +96 attack or +88 defence > 0; UNIT +12/+16
  position) × DIFF +120 (1). Flips if random(D) < P, D = 2000 × dist(k's capital) / dist(owner's capital), 500..8000;
  dist = max − ((dx+dy)/2 − min + 1)/2 on wrapped |dx|, |dy|. Not counted: ×1.4 the turn after the owner lost a city by
  capture (Leader +5576, not in the LEAD record).
- Unit ids (UNIT +8): unique within a save (1454/1454 on the WWI save). An upgrade keeps the id (12 Cannon → Artillery
  between the 1140 and 1270 AD saves); the game reuses a dead unit's id (a Spearman's id later on a Cavalry). PRTO +72
  bombard, +120 upgrades to (may be another civ's unique unit: Cannon → Hwach'a; the chain continues from it).
  History's Army chart: military units (attack, defence or bombard > 0) in shields, and losses by id between stored
  turns (an id with a type off the old unit's upgrade chain counts as lost; a reused id of the same type can't be told).
- Custom rules (embedded in the save): GOVT +396 = number of governments, then 3 ints each, so every GOVT field after
  it moves 12 bytes per government above 8 (read only when the record is long enough). A building obsolete by a known tech
  adds no commerce bonus and doesn't reduce corruption (fits every city of the EME mod save: gold/sci/lux 41/41, corruption
  41/41; Scribe and Castle are obsolete there). Other civs' production uses the owner's known techs (AI cities 356/356).
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
- Communism corruption is unverified (Anarchy: confirmed in-game).
- Tile yields don't model farmland, Golden Age or Colossus-type wonders (none on the tested saves, so any city
  with them shows in Diagnostics as not reproduced). From the exe so far: Golden Age (LEAD +40 = end turn) +1
  shield and +1 commerce on a tile that has some; wonders with flag 32 (`Leader_count_wonders_with_flag`) + commerce on a
  tile that has some. Verify each on a save that has it.
- The model assumes every city is connected to the capital by trade (not read from the save; otherwise distance × 5/4;
  mismatches show "~").

- War weariness: Police Station (−size/4), Universal Suffrage (−1 per city) and the +size/4 content for an enemy that
  declared war on you are read from the exe, not seen on a save.

- Attitude doesn't count resource deals (−5, helper 0x55E8E0: a table behind leader +5652, 96 bytes per entry, 3 per
  player). Its save layout is unknown: it isn't in the data after each LEAD in the memory layout. To locate it: two saves of
  one turn, before and after a single resource trade with one AI.

## Ideas (not started)
- **Unit targets for milestones.** The viewer reads UNIT records (checked against LEAD +376/+380); milestones could use them.
