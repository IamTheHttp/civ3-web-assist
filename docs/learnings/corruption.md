# Corruption: the game's rule, not the community formula

- The viewer transcribes `City_compute_corrupted_yield` (0x4B1190). Exact in 42/42 cities for corruption and waste; the
  community formula was exact in only 27/42 (always within 1, which hid the error). Full rule and differences:
  `docs/CORRUPTION.md` (written for a forum post).
- Shown "85–89%" in capped cities is correct: the cap rounds the coins lost **down**.
- The capital is "10 extra Courthouses" (0x4B12C0, C3X: `ADDR_ADD_CAPITAL_CORRUPTION_BUILDING_EFFECT`); a Forbidden
  Palace city is 7 (cap 20%, with a Courthouse 10%).
- Not in the save, so assumed: trade connection to the capital (else distance × 5/4), no police specialists.
- A Courthouse saves the most coins in far, high-commerce cities; in the Forbidden Palace city it halves a small loss.
  The CH/PS Effect columns show the gain and the payback (cost ÷ net gain per turn, both in gold by the worths set in Tiers).
