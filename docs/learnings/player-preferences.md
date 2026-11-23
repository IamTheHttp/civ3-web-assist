# Player preferences (learned)

- **Demo before push.** Build it, show it locally, push only when told.
- **Verified facts only.** State what was checked against the save or the exe and what is assumed; give references
  (exe addresses, OpenCiv3 / C3X files). Correct earlier wrong claims openly (e.g. Courthouse cost is 80, not 60).
- **No cheating information** in normal views: Diplomacy lists only civilizations met, and other civs' culture per turn
  was removed. City counts are fine (the trade screen shows them). AI comparisons are acceptable only when labelled (History's Compare line, which may show any civilization).
- **Minimal UI.** Panels live in the side menu and open in a drawer; the table stays at the top. The drawer is resizable
  (drag its left edge) and has ⤢ Expand to fill the window; width and expanded state are kept per panel. Prefer one column
  over a big panel (the tier warnings are one Attention column, not a to-do list).
- **Spreadsheet habits:** ▾ column menus with conditions and value lists; filters and sorting use **real** values, so
  what-if ticks never hide or move rows.
- **Building value apart from the slider:** a Library or Marketplace multiplies only its share of the slider, so the Effect
  columns can use a tried slider ("Try slider", default 50% science / 50% gold) instead of the save's. It is a what-if.
- **What-ifs reach the Summary:** ticks, Try slider and Try government show now → then in the Summary cards too.
- **All what-if tick columns side by side**, then all Effect columns.
- **Score parts go in the tooltip,** not in their own column (the war-declarations column was removed; it showed the
  wrong direction anyway). No extra views unless asked (an "after peace" attitude view was declined).
- **Checks in-game readily** when given exact predictions and the screen to read; reports back line by line.
- **Signals over raw numbers:** payback turns for buildings; green / amber / grey.
- **Yields have a worth in gold** (Tiers → Building payback): shield and food 4, gold, science and luxury 1 by default.
  Payback = cost in shields × shield worth ÷ the gain's worth per turn (10 shields for +1 gold a turn = 40 turns).
  Why 4: gold is scarce for most of the game and buys shields; the player rushes only builds with some progress, at
  BIQ RULE `ShieldCostPerGold` = 4 gold a shield. With no progress the price doubles (8; the player's rule, not read from
  the exe), which no one pays.
- Likes sane defaults that are editable (tiers, milestones, payback limits).
