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
- Community tests (CivFanatics "AI Attitude Study", Play the World 1.01, not verified for Conquests): score 0 = Cautious;
  lower is better (≤ −11 Gracious, 1–10 Annoyed, ≥ 11 Furious). Gold/tech gifts −1 per 10 gold, at most −10, decaying about
  10 gold a turn; a resource trade or gift −5 (more resources don't add); right of passage −5; MPP −10; common enemy −3;
  alliance −2; embassy −2; same government −1. Breaking deals, demands and razing add permanent penalties. Attitude
  weighs the AI's choice of war target (furious +8 … gracious 0, "All About AI Aggression Levels" thread) and the UN
  vote (polite or better); the aggression level drives demands and war declarations after refused demands.
- Treaty bits (LEAD +3868): bit1 = right of passage (Japan and France have it both ways, the others 0). Peace is the
  at-war byte, not a treaty bit. Resource trades (the player gives France Gems and Silks) aren't decoded.
- AI governments (LEAD +140) all read Republic in the Maya save; the player confirmed it in-game.
