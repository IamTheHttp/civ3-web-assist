# Reverse-engineering reference

Everything here was verified against the player's files unless marked *(inferred)* or *(community)*.

## Save file (SAV, after decompression; starts "CIV3")
- Embedded scenario (BIQ) at byte 562, length at byte 38. With default rules it holds only VER# + GAME (8 KB) → names/rules come from `conquests.biq`.
- **GAME** = first "GAME" after the embedded BIQ: +24 difficulty id, +36 number of cities, +64 turn, +80 human-players bitmap (player = lowest set bit ≥1), +17 flags byte (bit1 accelerated production, bit7 cultural conversions).
- **LEAD** (per player; find the one with +8 == player): +12 civilization (RACE index), +24 capital city id, +40 Golden Age end turn (C3X), +140 government, +16 power level, +376 unit count, +380 military units, +412 + 76k memory of player k (19 ints; see `docs/learnings/diplomacy.md`), +400/+404/+408 luxury/science/tax rate (tenths).
- **WRLD** (first block, length field 2): +22 height, +42 width, +174 world seed, +178 flags (bit0 wrap X, bit1 wrap Y), +238 world size id.
- **CITY** record = "CITY" header with length **136** (other CITY headers aren't cities). Offsets from the header:
  +8 id, +12/+14 x/y (int16), +16 owner (byte), +20 building upkeep, +24 flags byte (bit0 disorder, bit1 celebrating),
  +40 stored food, +44 shields stored, +52 build id, +56 build type (1 building, 2 unit), +220 culture/turn,
  +360 food (tiles), +364 **raw shields**, +368 **raw commerce**, +392 name[24],
  +492 food eaten, +496 waste, +500 corruption, +504 net food, +508 net shields, +512 final gold+sci+lux,
  +516 luxury, +520 science, +524 gold, +528/+532/+536 specialist output (lux/sci/gold, separate from the city's figures),
  +552 citizen count. Fixed part 556 bytes.
- **CTZN** × count, 308 bytes each: +272 type (0 happy, 1 content, 2 unhappy, 3 resister, 4 specialist), +292 specialist type (CTZN index in rules: 1 entertainer, 2 tax collector, 3 scientist…), +296 nationality = **civilization (RACE) index**, not player number.
- **TILE** (212 bytes, first header length 36, row by row, W/2 per row): +8 river edges, +12 resource (GOOD index), +30 city id,
  +34 continent/water body, +52 flags (bit0 road, 1 railroad, 2 mine, 3 irrigation, 6 pollution), +57 terrain (high nibble:
  the terrain used for yields), +62 bit0 grassland bonus shield, +104 id of the city working the tile.
- **UNIT** (length 472; OpenCiv3 Unit.cs): +28 owner (player), +32 nationality (civilization), +40 type (PRTO index).
- Then **BINF** (+8 count = number of building types, 12-byte history entries: year, builder civ, culture) and **BITM** (+8: 256-bit bitmap of buildings the city has **now**).
- Self-checks that pass on real data: gold+lux+sci == +512 (42/42); raw shields − waste == +508 (42/42).

## Rules (conquests.biq, compressed the same way; starts "BICX")
Sections: name(4) + count + entries each starting with their length. Offsets from the entry start (its length field):
- **BLDG**: +68 name[32], +144 required building, +148 cost (**tens of shields**), +172 upkeep, flags at +236:
  [0] bit0 center of empire, bit2 +50% research, bit3 +50% luxury, bit4 +50% gold; [1] bit0 reduces corruption;
  [2] bit3 capitalization (Wealth); [4] bits2-3 wonder/small wonder; [8] bit5 Forbidden-Palace-type; [12] bit4 doubles research.
  Default ids: Palace 0, Marketplace 4, Library 5, Courthouse 6, Bank 9, University 11, Research Lab 20, Police Station 28,
  Wealth 29, Forbidden Palace 56, Stock Exchange 76, Secret Police HQ 82. 83 buildings.
- **TERR** (after a bitmap of possible resources, one bit each rounded up to bytes): +0 name, +64 irrigation, +68 mining,
  +72 road bonus, +84 food, +88 shields, +92 commerce. **GOOD**: +4 name, +76 prerequisite tech, +80 food, +84 shields,
  +88 commerce. BLDG: +208 production (quarters), +224 obsolete by tech; flag bits: +237 bit5 power plant, +250 bit1 tourist attraction, +238 bit7 shields on water, +239 bit0 food on water (Harbor), bit1 commerce on water.
- **PRTO**: +8 name[32], +84 cost (plain shields), +208 needs support (C3X `UnitType.requires_support`). **GOVT**: +28 name, +380 corruption level (0 minimal, 1 nuisance,
  2 problematic, 3 rampant, 4 catastrophic, 5 communal), +396 number of governments, +516 required advance, +520 slider rate limit
  (tenths; 10 in every default government, matching the game). **DIFF**: +4 name, +108 optimal cities %. **WSIZ**: +4 optimal city number.
- **RULE**: +288 max town size, +292 max city size (OpenCiv3's 248/252 are 40 bytes off).
- **RACE**: city-name list (24 bytes each) and great-leader list (32 each) come first, plus 4 eras × 520 bytes of art paths:
  noun at +180+shift, culture group +2300+shift, aggression +2312+shift, shunned / favorite government +2320/+2324+shift, traits byte at +272+2080+shift (bit0 militaristic, 1 commercial, 2 expansionist, 3 scientific,
  4 religious, 5 industrious, 6 agricultural, 7 seafaring), shift = 24·cities + 32·leaders. Maya = #31 (Industrious, Agricultural).
- **CTZN**: specialist outputs (entertainer 1 lux, tax collector 2 gold, scientist 3 research in default rules).

## Formulas
**Corruption/waste**: the rule in the game's code (`City_compute_corrupted_yield`), exact in 42/42 cities for both;
see `docs/CORRUPTION.md`, which also lists how it differs from the community formula.

**Tile yields** (the game's rule, 42/42): terrain + irrigation (a city tile counts as irrigated; irrigated desert +1 for
Agricultural) / mine / road + river +1 commerce + resource (with its tech) + lake +1 food; on a large water body the city's
water buildings. City tile: food set to 2 (+1 Agricultural); +1 shield and +1 commerce above the town limit (+2 above the
city limit; Commercial +3/+5 commerce, Industrious +3 shields); at least 1 shield and 1 commerce (capital: 4). Then the
government: trade bonus +1 commerce on a tile with commerce; tile penalty −1 on a yield above 2 (not food on an Agricultural
river city tile). Never below 0.

**Unit support** (gold, the game's rule): max(0, units − free − units of another nationality − units of a type without
support) × GOVT +556; free = GOVT +540 + Σ cities (+544 town, +548 city, +552 metropolis); GOVT +540 = −1: none (Anarchy).

**Tourist attractions** (exe 0x4B0710): + commerce before corruption per flagged building by age (current year − BINF year):
over 1000 → 2, 1500 → 4, 1750 → 6, 1875 → 8, 2000 → 10, 2250 → 12, 2500 → 14. **GAME** (BIQ, after one int per playable
civ from +16): +40 time unit (0 years), +52 start year, +64 turns per period[7], +92 years per turn[7].

**Production** (exe 0x4B05D0): (raw − waste) × (4 + Σ production of the city's buildings + the best power plant that has
its required building) / 4, rounded down.

**Commerce replay** (`City_recompute_commerce` 0x4B07C0): net = raw + tourist − corruption (+ per-city calibration); lux = round(net·L/10), sci = round(net·S/10) (halves up), lux = net − sci if lux + sci > net, gold = net − lux − sci;
each × (1 + Σ bonuses) floored; +50% per Library/University/Research Lab (sci) or Marketplace/Bank/Stock Exchange (gold), +100% research-doubling wonders.

**Culture flip** *(community, Apolyton 2002, not verified in-game)*: P = [(N+S)·C·H·R − T]/D per foreign civ;
N foreign citizens (resisters ×2), S tiles of the 21 in their borders, C 2 if they have more culture in the city,
H 2 disorder / 0.5 WLTKD, R their/your total culture, T military units, D ≈ 2000·(their capital dist / your capital dist) clamped 500..8000.
