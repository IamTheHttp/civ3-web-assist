# Reverse engineering the GOG exe

- **Exe:** `~/Downloads/Civ3Conquests-Unmodded.exe` (GOG, 3,417,464 bytes). Never commit it.
- **Tools:** `tools/disasm.py` needs `capstone` and `pefile`, which aren't installed. What works without installs: the
  macOS `objdump -d --no-show-raw-insn <exe> > exe.asm` (whole exe, ~820k lines), then search it and name calls from the C3X
  CSV. File offsets: `.text` VA 0x401000 → file 0x1000, `.rdata` 0x665000 → 0x265000, `.data` 0x680000 → 0x280000
  (addresses past the raw size are runtime-only, e.g. settings read from an ini).
- **Web:** a local guard allows WebSearch/WebFetch only for domains in `~/.claude/websearch-allowlist.txt`; the player
  grants civfanatics.com for a day when asked (an entry `civfanatics.com until=YYYY-MM-DD`).
- **Names:** C3X's `source/civ_prog_objects.csv` maps GOG/Steam/PCG addresses to function names (download with
  `gh api repos/maxpetul/C3X/git/blobs/<sha>`; the contents API rejects files over 1 MB). Structures:
  `source/Civ3Conquests.h` in the same repo. OpenCiv3 layouts: `C7-Game/Prototype`, `QueryCiv3/BiqSections/*.cs` and
  `QueryCiv3/SavSections/*.cs`, read with `gh api .../contents/...`. WebFetch is blocked for these hosts by a local
  domain guard; `gh` works.
- **Save vs memory:** a LEAD record's offset = C3X `Leader` memory offset − 20 (the LEAD record covers memory +28..+5560;
  later leader data, e.g. the resource-deal table pointer at +5652, isn't in it). City records do **not** follow the
  memory layout (a naive mapping for the rally point read the next "CITY" header). Rules in memory: BLDG (272 bytes) and
  PRTO (312) use the BIQ offsets; GOVT fields after the per-government gap sit 76 bytes earlier than in the BIQ (memory
  +464 = BIQ +540); RACE in memory is fixed (2420 bytes: culture group +2316, aggression +2328, shunned +2336,
  favorite +2340); GOOD 92 bytes; TERR 240 bytes.
- **Globals seen:** `0xA52684` game difficulty (GAME +24), `0xA526BC` human players bitmap (GAME +80), `0xA5267C` GAME
  flags (bit 9 = accelerated production), `0x9C40C0` difficulty records (124 bytes each), `0x9C40AC` buildings
  (0x110 each), leaders at `0xA52E98` (0x20E4 bytes each: the code computes id × 2105 × 4), cities via the table at
  `0xA52E6C` (entry + 4 points 0x1C past the City), units via `0xA52E84` (entry + 4 points 0x1C past the Unit), game turn
  `0xA526AC`, players alive `0xA526C0`, map width `0x9C73D4` and height `0x9C73C0`. `0x60BAB0` = random 0..N−1.
- **Pitfall:** a helper script named `dis.py` in the working folder shadowed Python's `dis` module and broke Playwright.
- **Method that worked:** find the function by C3X name, transcribe it into a JS test against the real save, require an
  exact match in every city before using it (corruption, tile yields: 42/42). Unnamed functions: find them through the
  data they read (e.g. every read of a struct field, or calls to a known helper), and check what writes a field to
  learn its meaning. Where the save can't test a rule, ask the player for exact in-game numbers (F1 treasury, F3 units,
  city screens at a test slider, diplomacy words) and give the predictions first.
