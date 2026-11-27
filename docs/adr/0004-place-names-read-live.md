# Place names are read live from QUB, not copied into the repo

Townland meanings and the other **Place Names** come from the Northern Ireland Place-Name Project at Queen's University Belfast. Its public website (placenamesni.org) now runs on public ArcGIS layers (`services3.arcgis.com/HRuPlEcokYlz4mdz/.../PlaceNames_Gazetteer_(Read-Only)` and `PlaceNamesNI_Townlands`). Those layers don't state a licence, so we query them live from the visitor's browser and credit the project on every entry, rather than downloading the data into this repository the way we do with the OGL heritage data. If QUB objects or the layers move, remove the call in `site/js/app.js` (`renderPlaceNames`). Nothing else depends on it.

## Consequences

- The Area Summary depends on QUB's layers being up. If they aren't, the page says it couldn't load place names and carries on.
- The Place-Name Project stores its text as HTML. `htmlToText` in `site/js/placenames.js` turns it into plain text before display, so markup from the source is never put into the page.
