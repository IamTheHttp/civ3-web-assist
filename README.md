# Civ3 Empire Viewer

An offline web page for **Civilization III: Complete**. It reads a save (`.SAV`) and your rules file (`conquests.biq`)
and shows all your cities in sortable, customizable views:

- Corruption and waste per city, with Courthouse and Police Station what-ifs.
- Library, Marketplace, University, Bank, Factory, power plant and Manufacturing Plant what-ifs, with their effect on gold,
  science, shields and upkeep.
- A "Try slider" what-if: judge Library, Marketplace and the other buildings at another science/gold/luxury split.
- History of your empire per turn, with an optional comparison line: AI average, the strongest AI, or one civilization
  (adjusted for difficulty).
- A "Try government" what-if and a Governments panel: your empire's tiles, corruption, waste, upkeep, unit support and net gold under each government.
- Growth, happiness, production, and saved custom views.

Everything runs in your browser. The page uploads nothing.

## Use it
Open `index.html` (or the GitHub Pages site), then load `conquests.biq` and a save file.
`conquests.biq` is in your Civ3 `Conquests` folder; saves are in `Conquests/Saves`.
Folder watching (auto-reload of the latest autosave) works only in Edge and Chrome.

## Develop
- Build: `python3 build.py` inlines `src/blast.js` and `src/civ3parse.js` into `src/template.html` and writes `index.html`.
- Parser smoke test: `node tests/synth.js`.
- Mock data: `node tests/mock.js` writes `local-data/mock.biq` and `local-data/mock.SAV` (42 invented cities) to try the page without game files.
  `--turns 30` also writes one save per turn of the same game to `local-data/mock-history/`, to try the history chart.
- UI suite (Playwright + Chromium): put `maya.SAV` and `conquests.biq` in `local-data/`, then `python3 tests/uisuite.py`.
- Decompressor fuzz: `cc -O2 -o tests/cblast tests/harness.c tests/blast.c`, then `node tests/fuzz.js` and `node tests/fuzz2.js 300` (number of streams).

Save and rules layouts and the formulas the viewer uses are in `docs/REVERSE_ENGINEERING.md`.

## Credits
- `src/blast.js` is a JavaScript port of `blast.c` by Mark Adler (zlib contrib/blast, zlib license);
  `tests/blast.c` and `tests/blast.h` are the original.
- Save and rules layouts build on OpenCiv3's QueryCiv3 (MIT) and c3sat by Jim Nelson (MIT).
- Corruption and culture-flip formulas come from community research at CivFanatics and Apolyton.
- No game files are included. You load your own `conquests.biq` and saves.
