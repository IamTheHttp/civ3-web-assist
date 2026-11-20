# Civ3 Empire Viewer

Offline single-file HTML viewer for Civilization III: Complete saves. Published at
github.com/IamTheHttp/civ3-web-assist. Layouts and formulas: `docs/REVERSE_ENGINEERING.md`.

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
- The corruption/waste model (community formula) matches the game **within 1 coin/shield in 42/42 cities**; waste needs the WLTKD rule.
- Corruption is applied to **raw** commerce; then the slider split (lux and gold rounded to nearest, science gets the rest);
  then building bonuses **add** (+50% each, +100% for research-doubling wonders), floored. Reproduces gold/sci/lux exactly
  in 40/42 cities; the other 2 are calibrated per city (the capital has +10 commerce not in its record; Memphis +1 gold from Wealth).
- Specialist output is stored separately (fields 528/532/536) and is NOT in the city's gold/sci/lux.
- Difficulty corruption %: Chieftain 100, Warlord 95, Regent 90, Monarch 85, Emperor 80, Demigod 70, Deity 60, Sid 50.
- Building costs in BIQ are in **tens of shields**; unit costs are plain shields.
- Growth: box = 2 × factor × (sizeClass+1); factor 10 for humans (AI: difficulty), halved with accelerated production;
  sizeClass: >maxCity → 2, >maxTown → 1, else 0 (from the game exe's city screen code).
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
- The model assumes every city is connected to the capital (mismatches show "~").
