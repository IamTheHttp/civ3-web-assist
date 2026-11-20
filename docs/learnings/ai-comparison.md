# AI comparison in History

- Every civ's cities are CITY records in the save (110 in the Maya save, 42 the player's). The AI records pass the same
  self-checks (commerce split, shields − waste, food): 68/68. Each stored turn keeps every civilization's totals.
- History → "Compare": none (default), AI average, best AI (the civ with the most net commerce + net shields that turn,
  the same civ in every chart), or any civilization, met or not. Totals, dashed, on the same scale as yours; whole
  empire only.
- Player's choices: the line is the player's pick; totals; all civilizations; adjusted for difficulty with a tooltip.
- Adjustment: AI food, shields and science × 10 / cost factor (Monarch ×1.11). The cost factor scales AI food boxes,
  units, buildings and techs (exe addresses in `CLAUDE.md`). Commerce, gold, luxury, culture and counts aren't scaled.
- Turns stored before AI totals existed have none; Add saves… reads older saves again.
- Maya turn 194, per citizen: player shields 1.49 / net 0.85, commerce 2.82 / net 1.43, corruption 49%; Celts 2.65 /
  1.85 and 3.82 / 2.62 (31%); French 2.54 / 2.09 and 4.06 / 3.35 (18%).
