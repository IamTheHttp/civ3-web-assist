# Rally points (why "continental" ones disappear)

- There is no stored continental rally point. "Set continental rally point" (menu item 15, function 0x4BDF10) copies the
  tile into the own rally point (City +0x1D8 / +0x1DC in memory) of every city of yours on that continent.
- `City_set_production` (0x4AFAB0) sets the city's rally point to (−1, −1) whenever the new build is an improvement or
  wonder (order type 1), at 0x4AFF74–0x4AFF82. Units keep it. So cities drop out one by one as they start buildings.
- New cities start with none (constructor, 0x4AE2C4); "clear continental" clears all cities on the continent.
- Where the rally point sits in the save is unknown (city records don't mirror memory). Two saves of the same turn,
  before and after setting one city's rally point, would locate it. The player closed this topic.
