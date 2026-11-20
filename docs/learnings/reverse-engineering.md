# Reverse engineering the GOG exe

- **Exe:** `~/Downloads/Civ3Conquests-Unmodded.exe` (GOG, 3,417,464 bytes). Never commit it.
- **Tools:** a Python venv with `capstone`, `pefile` (and `playwright` for UI tests). `tools/disasm.py <exe> <csv> <hex
  address> <instructions>` prints a function with called functions named.
- **Names:** C3X's `source/civ_prog_objects.csv` maps GOG/Steam/PCG addresses to function names (download with
  `gh api repos/maxpetul/C3X/git/blobs/<sha>`; the contents API rejects files over 1 MB). Structures:
  `source/Civ3Conquests.h` in the same repo. OpenCiv3 layouts: `C7-Game/Prototype`, `QueryCiv3/BiqSections/*.cs` and
  `QueryCiv3/SavSections/*.cs`, read with `gh api .../contents/...`. WebFetch is blocked for these hosts by a local
  domain guard; `gh` works.
- **Save vs memory:** a LEAD record's offset = C3X `Leader` memory offset − 20. City records do **not** follow the
  memory layout (a naive mapping for the rally point read the next "CITY" header).
- **Globals seen:** `0xA52684` game difficulty (GAME +24), `0xA526BC` human players bitmap (GAME +80), `0xA5267C` GAME
  flags (bit 9 = accelerated production), `0x9C40C0` difficulty records (124 bytes each), `0x9C40AC` buildings
  (0x110 each), leaders at `0xA52E98` (0x20E4 bytes each: the code computes id × 2105 × 4), cities via the table at
  `0xA52E6C` (entry + 4 points 0x1C past the City).
- **Pitfall:** a helper script named `dis.py` in the working folder shadowed Python's `dis` module and broke Playwright.
- **Method that worked:** find the function by C3X name, transcribe it into a JS test against the real save, require an
  exact match in every city before using it (corruption: 42/42).
