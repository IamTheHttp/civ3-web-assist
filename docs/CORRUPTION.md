# Corruption and waste in Civ3 Conquests: the rule in the game's code

This is the corruption and waste rule as the game computes it, read from the **GOG Civ3Conquests.exe (Conquests 1.22,
3,417,464 bytes)**, and how it differs from the community formula (CivFanatics "Everything About Corruption: C3C",
Apolyton).

**Result on a real save** (Maya, Monarch, Republic, Standard map 100×100, 42 cities, turn 194, default rules):

| Model | Corruption exact | Waste exact |
|---|---|---|
| Community formula | 27 / 42 cities | 27 / 42 cities |
| Rule from the exe (below) | **42 / 42** | **42 / 42** |

The community formula is never off by more than 1 coin or shield, but it is off by 1 in 15 cities each for corruption
and waste.

## Where it is in the exe

GOG addresses; C3X's `civ_prog_objects.csv` (github.com/maxpetul/C3X) maps them to the Steam and PCGames builds.

| Function | GOG address |
|---|---|
| `City_compute_corrupted_yield (city, gross_yield, is_production)` | 0x4B1190 |
| `Leader_get_optimal_city_number (leader)` | 0x5676C0 |
| Tile distance between two cities | 0x4378D0 |

All arithmetic is integer; every division truncates toward zero (for positive numbers: rounds down).

## The rule

`Y` is the city's gross commerce (for corruption) or gross shields (for waste). `OCN` is the world size's optimal city
number. Government corruption levels: 0 minimal, 1 nuisance, 2 problematic, 3 rampant, 4 catastrophic, 5 communal.

**1. Optimal number of cities for the player** (`Leader_get_optimal_city_number`):

```
N = OCN
  + OCN × 3 × (Forbidden Palace-type wonders the player owns) / 8      (communal: / 1)
  + OCN / 4                                                             if the civ is Commercial
  + OCN / 8    (minimal, nuisance)  |  OCN / 16 (problematic)  |  2 × OCN (communal)  |  0 (rampant, catastrophic)
  + AI players only: OCN / 8 above Regent, OCN / 4 above Monarch, OCN / 2 above Emperor (by the game difficulty)
N = N × (the player's difficulty: "optimal cities %") / 100
```

**2. Courthouse count.** `Ni` = corruption-reducing buildings in the city (Courthouse, Police Station) **+ 10 if the
city is the capital**. Then, for this city only:

```
Nopt = N + OCN × Ni / 4
Nopt = Nopt + OCN / 4                    waste only, if the city celebrates (We Love the King Day)
```

**3. Distance.** The game's tile distance between two cities (wrapped):

```
a = |dx|, b = |dy|;   distance = max(a, b) − ((a + b) / 2 − min(a, b) + 1) / 2
```

`d` = distance to the capital, or to a city with a Forbidden Palace-type wonder if that is closer.
**`Ni` += 7 for each Forbidden Palace-type wonder in this city** (this comes after step 2, so it doesn't raise `Nopt`).

```
MaxD = (map width + map height) / 4
D = 3d/4 (minimal) | d (nuisance, problematic) | 3d/2 (rampant) | MaxD/4 (communal)
D = D × 5 / 4                            if the city has no trade connection to the capital
D = clamp(D, 2, MaxD)                    never below 2
D = (D + 1) / 2                          waste only, if the city celebrates
repeat Ni times:  D = (D + 1) / 2        each halving rounds up
```

**4. Rank.** `R` = the player's other cities closer to the capital (ties are broken by city fields and then the city
id). Communal: `R` = cities / 2.

```
R' = R            if R < Nopt
R' = 2R − Nopt    otherwise
```

**5. Coins or shields lost:**

```
lost = (MaxD × ((R' × Y + 1) / 2)  +  D × Y × Nopt  +  MaxD × Nopt / 2)  /  (MaxD × Nopt)
```

That is `Y × D / MaxD  +  (R' × Y / 2, rounded up) / Nopt`, **rounded to the nearest whole number** (halves up).

```
lost = lost × (difficulty's corruption %, per player) / 100          100 at every level in the default rules
lost = lost − (corruption value of police-type specialists in the city)
lost = min(lost, Y × (9 − Ni) / 10)                                    the cap, rounded down; never below 0
```

Special cases: Anarchy (catastrophic) loses all of `Y`; a city in disorder wastes all its shields.

## Differences from the community formula

| # | Community formula | Game |
|---|---|---|
| 1 | Optimal cities as a real number: `OCN × (L × (1 + 0.25 Commercial + gr + 3/8 × FP) + 0.25 Ni)`, with `gr` = 0.1 (minimal, nuisance), 0 (problematic) | Integer, truncated at each step. Government bonus `OCN/8` (minimal, nuisance) and **`OCN/16` for problematic** (not 0). The difficulty % multiplies the sum, then truncates. Example save: **24**, not 25.08. AI players get an extra bonus by difficulty. |
| 2 | The capital has no corruption (a special case) | The capital is a city with **10 extra Courthouses**: `D` halves to 1 and the cap becomes 0. |
| 3 | Distance `max(p, q) + min(p, q)/2` on rotated coordinates | The game's own tile distance (above); integer. |
| 4 | Distance part = `min(gd × d, MaxD) × 0.5^Ni / MaxD` | `D` is an integer, **at least 2**, scaled by government with truncation, **× 5/4 if not connected to the capital**, then halved per Courthouse **rounding up**. A city next to the palace still has `D` = 2 (4% on a Standard map). |
| 5 | Rank part `R / (2 Nopt)`; corruption = `round(Y × share)`, waste = `floor(Y × share)` | The rank numerator `R' × Y / 2` rounds up; distance and rank are added and **rounded to nearest once, for both corruption and waste**. The community "waste rounds down" comes from the cap. |
| 6 | Cap `0.9 − 0.1 Ni − 0.7 FP`, applied to the share | Same values: `(9 − Ni) / 10` with the capital +10 and each Forbidden Palace-type wonder +7, but applied to the coins and **rounded down**. So a capped city with 25 commerce loses 22, not 23 (shown as 88%, not 90%). |
| 7 | — | The difficulty's corruption % (DIFF record) multiplies the result before the cap. It is 100 at every level in the default rules, so it matters only for mods. |
| 8 | — | Police-type specialists subtract their corruption value. This is read from the code but not tested on a save. |

## Example: Tulúm (Republic, no Courthouse, rank 20, distance 21, 20 commerce)

| | Community | Game |
|---|---|---|
| Optimal cities | 25.08 | 24 |
| Distance (nearest palace: the Forbidden Palace, 13 tiles) | 13 / 50 = 26% → 5.2 | D = 13 → 13 × 20 / 50 = 5.2 |
| Rank part | 20 / 50.15 = 39.9% → 7.98 | (20 × 20 + 1) / 2 = 200, / 24 = 8.33 |
| Lost | round(5.2 + 7.98) = **13** | (50 × 200 + 13 × 20 × 24 + 50 × 24 / 2) / (50 × 24) = 16840 / 1200 = **14** |
| The game's save | | **14** |

## What is assumed

- **Trade connection:** the save data read here does not show the trade connection to the capital. All cities in the
  example save are connected, so the model assumes so; an unconnected city would show a mismatch.
- **Ties in rank:** cities at the same distance from the capital are ordered by city fields (memory offsets
  +0x358 to +0x364), then by id. Only the id order is used here; it matched every city in the save.
- **Police specialists** and **AI optimal-city bonuses** are transcribed from the code but were not on the tested save.

The Civ3 Empire Viewer (github.com/IamTheHttp/civ3-web-assist) uses this rule. Its Diagnostics panel reports how many
cities of your own save match the game exactly.
