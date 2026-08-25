# District Map Coverage Review — 2026-08-25

## Result

The current DLD district list contains **204 unique district names**. After the update, every one of these names resolves to a valid representative map coordinate within the configured Dubai/UAE bounds.

| Measure | Result |
|---|---:|
| Current DLD districts | 204 |
| Coordinate entries in `data/district-coordinates.json` | 202 |
| DLD districts resolved by exact or conservative name matching | 204 |
| Unresolved DLD districts | 0 |
| Browser map failures across all 204 districts | 0 |
| Facility circle radius | 1,000 m from current GIS calibration |

The difference between 204 district names and 202 coordinate entries is expected because some coordinate entries cover name variants or aliases that are matched conservatively by normalized name comparison.

## Implementation

Selecting any district from the DLD list now centers the map on its representative coordinate, moves the draggable marker, moves the facility circle, and triggers the existing nearby-facilities lookup. The coordinates are read with a cache-busted request so a browser cannot silently retain the older 80-entry artifact.

The reverse interaction remains active. Clicking the map or dragging the marker updates the district field only when the point is within the conservative matching radius of a district representative coordinate and the resulting name exists in the current DLD list. Points without a reliable match clear the district selection and show `No matching DLD district` rather than assigning a distant or fabricated district.

The coordinates represent **map centroids or representative points**, not official legal district boundaries. The marker can still be adjusted manually for a property-specific location. Nearby facilities are searched around the marker using the existing GIS radius and do not change the valuation methodology.

## Verification

The shared district-map helper tests pass, the project test suite passes **46/46**, inline JavaScript syntax validation passes, and `git diff --check` reports no whitespace errors. A browser loop loaded all 204 DLD names and verified that each one moved both the marker and the facility circle to a finite coordinate inside the configured bounds.

The coordinate candidates were gathered from OpenStreetMap Nominatim search and retained only after checking the returned place names, Dubai context, coordinate bounds, and candidate type. No unverified ArcGIS layer was imported. Nominatim remains only a runtime fallback for future district names that may be added to DLD; the current 204 names are covered locally.

## References

[1]: https://nominatim.openstreetmap.org/ "Nominatim OpenStreetMap Search"

[2]: https://hub.arcgis.com/search?collection=dataset&tags=dubai "ArcGIS Hub Dubai dataset search"
