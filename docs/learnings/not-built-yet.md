# Checked but not built

- **Worked tiles without improvements:** feasible. Worked tiles (TILE +104) and their yields are verified (42/42); the
  improvement flags are at TILE +52.
- **Culture-flip chance:** needs tile ownership, each civ's culture, units in the city and foreign capitals; the
  community formula itself is unverified.
- **Unit targets for milestones (workers, military units):** feasible; the viewer reads UNIT records (counts match LEAD
  +376 / +380).
- **War planning:** the AI's choice of war target (community: attitude adds furious +8 … gracious 0) isn't decoded.
- **C3X patches** (in `../unpublished/`, not in this repo) are on hold; e.g. keeping rally points when a city switches
  to a building.
