# Diplomacy data

- Read and shown: attitude (with its reasons, such as your war declarations on them), government, cities, total culture and
  ratio to yours, at war, embassy,
  right of passage, your allies against them, alliances against you (offsets in `CLAUDE.md`). Only civilizations with contact are listed; unmet allies aren't named.
- **Attitude** (GOG `Leader_get_attitude_toward` 0x440100), AI A toward player T, lower is better. Matches the diplomacy
  screen for Japan, France (Gracious), America, Ottomans (Furious). Sum of:
  - A's effective aggression (Race vtable slot 8, 0x53A0B0): RACE aggression + difficulty/2 − levels/6, then the game's AI
    aggression setting (0 → −2, 1 → −1, 2 → 0, 3 → +1, 4 → +2), clamped to −2..2.
  - A's memory of T, 19 ints at LEAD +412 + 76T (`m0`..`m18`): 4·m0 + min(4·m1, 8) + min(8·m2, 16) + min(2·m3, 4) + 4·m4
    + min(m5, 10) + 2·m6 − m7 + m8 − min(m9/10, 10) − min(m10, 1) + 16·(2·m11 + m12) + min(m13, 10) + min(m14, 10)
    − min(m15, 10) + 16·m16 + m17 + m18.
  - +1 per unit A owns of T's nationality; +10 if T has allies against A (T's LEAD +3996 + 4A); T's embargo on A (T's
    +4124 + 4A) +10 (+2 at war); at war +5, else contact flags (A's +3740) 0x10 +5 / 0x08 +1; different government +1
    (A's shunned one +5), same government that is A's favorite −5; culture: T under half of A's +1, over double −1; A's
    embassy with T −2 (+1 at war); same culture group −1; a resource deal (0x55E8E0, not decoded) −5; treaty bits
    (A's +3868): bit0 or bit2 −10, bit1 (right of passage) −5; −2 per enemy A and T are allied against together;
    per common enemy j −3 − min(j's m4, 2) − min(m5, 4) − min(m13, 5) − min(m14, 1) (if T only embargoes j: −2);
    plus, for every civ j A knows (and isn't at war with), min(m0,2) + min(m1,2) + min(m2,3) + min(m3,1) + min(m16,8)
    + min(m17,1) of j's memory of T.
  - Then: at war, a negative score becomes 0; T stronger (LEAD +16) halves a negative score; clamped to ±(W+H)/2.
    The FlavorRelationType setting (default 4) leaves the score unchanged.
- **Words** (mood, 0x440AD0), t = (map W+H)/20 (10 on 100×100): below −t Gracious, −t..−1 Polite, 0 Cautious, 1..t Annoyed,
  above t Furious. Trades (`Leader_consider_trade`) and demands (`Leader_would_yield_to_demand`) use the mood.
- **Memory fields** (meanings from the code that writes them; inferred): m0 war declarations (`Leader_declare_war`), m1
  deals cancelled early (0x5008B9, `Leader_apply_trade`), m2 separate peace while allied (`Leader_make_peace`), m3 war
  declared with a treaty in force, m5 units killed (`Unit_attack_tile`), m9 gifts, m11/m12 pillage, m13/m14 war damage
  (0x5631B0: bombard, combat, nukes, pillage; a captured city +16; m14 is this turn's), m16 cities razed (+1 per razed
  city, 0x563370), m6–m10/m18 diplomacy screen, m15 capture popup (subtracted; unknown).
- **Decay** (AI begin_turn 0x446C68): each turn, a field above 0 loses 1 with chance 1/N: m0 128, m1 256, m2 512, m3 512,
  m4 32, m5 4, m6 64, m7 32, m8 32, m10 16, m11 1024, m12 256, m13 2, m15 1024, m16 1024, m17 128, m18 32; m9 −10 a turn
  while above 10; m14 reset to 0. At peace m13 and m14 are halved. On a 540-turn game, N ≥ 128 is permanent in practice.
- **Trust**: before a deal the AI takes, over every civ it knows, the highest memory of T's m1 (a yes/no switch for deal
  types), m2 (its own counts ×4) and m3; m2 and m3 multiply its price by 4·value + 1 (helpers 0x5010E0 / 0x5011A0 /
  0x501260). Broken deals spread to every civ in contact with the victim.
- **Razing** a captured city: the victim's m16 +1 (+16 attitude, ~permanent), others +1 each (up to +8), and you get
  size/2 workers of their nationality (+1 each while you keep them). Capturing without razing: m13 +16 (temporary).
- Community tests (CivFanatics "AI Attitude Study", Play the World 1.01, not verified for Conquests): score 0 = Cautious;
  lower is better (≤ −11 Gracious, 1–10 Annoyed, ≥ 11 Furious). Gold/tech gifts −1 per 10 gold, at most −10, decaying about
  10 gold a turn; a resource trade or gift −5 (more resources don't add); right of passage −5; MPP −10; common enemy −3;
  alliance −2; embassy −2; same government −1. Breaking deals, demands and razing add permanent penalties. Attitude
  weighs the AI's choice of war target (furious +8 … gracious 0, "All About AI Aggression Levels" thread) and the UN
  vote (polite or better); the aggression level drives demands and war declarations after refused demands.
- Treaty bits (LEAD +3868): bit1 = right of passage (Japan and France have it both ways, the others 0). Peace is the
  at-war byte, not a treaty bit. Resource trades (the player gives France Gems and Silks) aren't decoded.
- AI governments (LEAD +140) all read Republic in the Maya save; the player confirmed it in-game.
