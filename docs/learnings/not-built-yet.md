# Checked but not built

- **Worked tiles without improvements:** feasible. Worked tiles (TILE +104) and their yields are verified (42/42); the
  improvement flags are at TILE +52.
- **Unit targets for milestones (workers, military units):** feasible; the viewer reads UNIT records (counts match LEAD
  +376 / +380).
- **War planning:** the AI's choice of war target (community: attitude adds furious +8 … gracious 0) isn't decoded.
- **C3X patches** (in `../unpublished/`, not in this repo) are on hold; e.g. keeping rally points when a city switches
  to a building.
- **Rules with other buildings (scenarios):** several parts use building names from the default rules, which a
  scenario may rename or leave out: the CH / PS columns pick the corruption reducers by name (`/courthouse/`,
  `/police/` among the buildings with the reduce-corruption flag), the default views name Library, Marketplace,
  Factory etc. (`bt:` / `be:` columns), the default tiers and milestones name buildings, and the short column labels
  are a name table. War weariness, production and commerce bonuses already use flags. Rules embedded in a save win over
  a loaded BIQ. The WWI hot-seat save (custom rules) also reads wrong: tile yields 0/27, government war weariness
  level, the year.
