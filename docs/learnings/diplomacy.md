# Diplomacy data

- Read and shown: government, cities, total culture and ratio to yours, at war, war declarations on you, embassy,
  right of passage, your allies against them, alliances against you (offsets in `CLAUDE.md`). Only civilizations with contact are listed; unmet allies aren't named.
- **Attitude** (Gracious … Furious, enum `AIDiploMood`) isn't stored: the game computes it (`get_attitude_toward`,
  `get_diplomatic_mood_toward` in the Leader vtable) from reputation, war damage, treaties etc. Showing it would mean
  transcribing that code.
- **Attitude matters** (exe): the AI's trade evaluation (`Leader_consider_trade` 0x440EE0) calls the mood function
  (0x440AD0, vtable slot 34), which uses the attitude (0x440100, slot 33); `Leader_would_yield_to_demand` decides on mood
  alone; 9 more AI call sites use mood (not identified). How much, and whether gifts raise attitude, is open: two saves of
  one turn, before and after a gift, plus the attitude the diplomacy screen shows, would locate the field.
- Treaty bits (LEAD +3868): bit1 = right of passage (Japan and France have it both ways, the others 0). Peace is the
  at-war byte, not a treaty bit. Resource trades (the player gives France Gems and Silks) aren't decoded.
- AI governments (LEAD +140) all read Republic in the Maya save; the player confirmed it in-game.
