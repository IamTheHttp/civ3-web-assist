# Checked but not built

- **Worked tiles without improvements:** feasible. Worked tiles (TILE +104) and their yields are verified (42/42); the
  improvement flags are at TILE +52.
- **Unit targets for milestones (workers, military units):** feasible; the viewer reads UNIT records (counts match LEAD
  +376 / +380).
- **War planning:** the AI's choice of war target (community: attitude adds furious +8 … gracious 0) isn't decoded.
- **C3X patches** (in `../unpublished/`, not in this repo) are on hold; e.g. keeping rally points when a city switches
  to a building.
- **Rules with other buildings (scenarios):** building columns, view groups (`@science` …), column titles and the
  help's "In these rules" come from rule flags. Default tiers and milestones still name default buildings; a name the
  rules lack shows "not in these rules". The WWI hot-seat save (custom rules) still reads wrong: tile yields 0/27,
  corruption 21/27, shields 26/27 (production multiplier), the year (`Year ?`). The EME mod save matches everywhere.
