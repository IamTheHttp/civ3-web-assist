# Checked but not built

- **Worked tiles without improvements:** feasible. Worked tiles (TILE +104) and their yields are verified (42/42); the
  improvement flags are at TILE +52.
- **Culture-flip chance:** needs tile ownership, each civ's culture, units in the city and foreign capitals; the
  community formula itself is unverified.
- **Unit targets for milestones (workers, military units):** need UNIT records or the LEAD unit counts
  (C3X `Leader`: Unit_Count, Military_Units_Count), checked against a save first.
- **C3X patches** (in `../unpublished/`, not in this repo) are on hold; e.g. keeping rally points when a city switches
  to a building.
