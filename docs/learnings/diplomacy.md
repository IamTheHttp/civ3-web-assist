# Diplomacy data

- Read and shown: government, cities, total culture and ratio to yours, at war, war declarations on you, embassy,
  alliances against you (offsets in `CLAUDE.md`). Only civilizations with contact are listed; unmet allies aren't named.
- **Attitude** (Gracious … Furious, enum `AIDiploMood`) isn't stored: the game computes it (`get_attitude_toward`,
  `get_diplomatic_mood_toward` in the Leader vtable) from reputation, war damage, treaties etc. Showing it would mean
  transcribing that code.
- Treaty bits (LEAD +3868) are set both ways with Japan and France (value 2) but their meaning is unknown; not shown
  until the player confirms the in-game treaties.
- AI governments (LEAD +140) all read Republic in the Maya save; the player confirmed it in-game.
