# War weariness

Read from the GOG exe. The face count is checked against the save (49/49 cities of all civilizations, CITY +153/+154).

## Points

- One counter per enemy: LEAD +3228 + 4 × enemy (memory `Leader +0xCB0`, C3X `war_weariness[32]`). Points are never
  summed across enemies; only the faces are.
- Per-turn update (0x500AD0), for each other player still in the game:
  - At war: + this turn's war damage from both sides (your memory of them, reputation field 14, plus theirs of you), so
    both sides get the same combat points. Then +1 if any of your combat units stands in their territory; otherwise, if
    none of their units stands in yours, −1 while above 30. Negative points don't rise on their own.
  - At peace: × 19 / 20, rounded toward zero, while above 0.
  - Leader +0xA4 (C3X `Mobilization_Level`) = 1: +1 per enemy per turn at war, no decay at peace.
- War damage adder (0x5631B0): +1 per combat or bombard hit, +2 unit killed (`Unit_score_kill`), +1 pillage, +16 city
  captured, +8 nuke, +2 from unit actions not identified (0x5BD98A etc.).
- Declaring war (`Leader_declare_war` 0x501F20): the declarer +60 if its diplomatic mood toward the target is Gracious,
  +30 if Polite; the target −30. Skipped when the declarer's reputation field +0x10 toward the target is set.
- Making peace (0x5025B0) halves the war damage memory and doesn't touch the points.
- High government, average points over enemies above 90: the government falls into anarchy (0x560D08 → 0x55CE50).

## Faces per city (0x4BD780, inside `City_recompute_happiness` 0x4BCFF0)

- Base: city size (high, Democracy) or size / 2 rounded down (low, Republic and Feudalism); GOVT +560: 0 none, 1 low,
  2 high.
- Per enemy at war: points ≤ 30 → 0, 31–60 → base / 2, 61–120 → base, > 120 → 2 × base; summed over enemies.
- Then −size/4 per Police Station-type building (BLDG +236 bit 22, not obsolete), −1 per Universal Suffrage-type wonder
  the player owns (BLDG +248 bit 11; `Leader_count_wonders_with_flag`), at least 0, at most the size.
- The faces subtract from the luxury steps, not the content steps: Temple-type content cancels them before any citizen
  turns unhappy.
- Enemy with negative points (it declared war on you): +size/4 content per such enemy, at most the size (0x4BD6D0).

## Checked and not checked

- Checked: CITY +152..+160 hold the share of each unhappiness cause in %, rounded down, and all 0 when the city has no
  unhappy citizen. +153 base unhappy = working citizens (size − specialists) − DIFF +68 content; +154 war weariness.
  Prediction matches 49/49 cities (Maya save, all civilizations, all Republic). This confirms the per-enemy counters,
  the thresholds, the low formula, the sum and the size limit.
- Not on the tested save: high (Democracy), Police Station, Universal Suffrage, the negative-points bonus (it isn't a
  cause byte), the anarchy rule.
- Happiness sum (not transcribed): luxury steps = (city luxury + specialist luxury) / RULE +176 (= 1), plus luxury
  resources (Marketplace table 0,1,2,4,6,9,12,16,20,24,28,32 at 0x665868), minus war weariness; content steps from
  buildings (BLDG +180 in the city, +176 in every city) and martial law. Istanbul (Ottomans) is 2 steps short with the
  3 luxuries at CITY +132; an imported luxury would close it.
- CITY +132 reads as the city's resource bitmask (GOOD index bits; the same in all 42 Maya cities). Not confirmed.
  OpenCiv3's `LuxuryConnectedCount` / `Bits` (+76 / +80) are 0 in every city.
