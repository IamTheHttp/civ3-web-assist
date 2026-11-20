# AI cost factor (difficulty)

- One factor scales AI food boxes (`Leader_get_food_cost_factor` 0x5660E0), unit costs (`Leader_get_unit_cost`
  0x56A210: base × factor / 10, min 1) and building costs (0x569FE0: base × factor, then trait/wonder adjustments).
- Human: 10. AI: the **game** difficulty's DIFF cost factor (GAME +24), not the AI leader's own difficulty field (LEAD
  +28 reads Regent for every AI in a Monarch game). Accelerated production halves it for everyone.
- Default rules: Chieftain 20, Warlord 12, Regent 10, Monarch 9, Emperor 8, Demigod 7, Deity 6, Sid 4. So AI food and
  shields are worth 10 / factor of a human's (Monarch ×1.11, Deity ×1.67).
- Not checked: whether AI research costs scale (no cost function for techs was read). Commerce isn't scaled by these.
- The AI optimal-city number also gets +OCN/8 (above Regent), /4 (above Monarch), /2 (above Emperor).
