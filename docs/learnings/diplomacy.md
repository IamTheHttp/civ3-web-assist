# Diplomacy data

- Read and shown: government, cities, total culture and ratio to yours, at war, war declarations on you, embassy,
  right of passage, your allies against them, alliances against you (offsets in `CLAUDE.md`). Only civilizations with contact are listed; unmet allies aren't named.
- **Attitude** (Gracious … Furious, enum `AIDiploMood`) isn't stored: the game computes it (`get_attitude_toward`,
  `get_diplomatic_mood_toward` in the Leader vtable) from reputation, war damage, treaties etc. Showing it would mean
  transcribing that code.
- Treaty bits (LEAD +3868): bit1 = right of passage (Japan and France have it both ways, the others 0). Peace is the
  at-war byte, not a treaty bit. Resource trades (the player gives France Gems and Silks) aren't decoded.
- AI governments (LEAD +140) all read Republic in the Maya save; the player confirmed it in-game.
