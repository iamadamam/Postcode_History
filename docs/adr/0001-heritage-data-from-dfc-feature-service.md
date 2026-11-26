# Heritage data comes from DfC's feature service, not OpenDataNI downloads

The Heritage Records are downloaded from the Department for Communities' own ArcGIS feature service, *Historic Environment Division GIS Data* (`services2.arcgis.com/BdBkthNLO9mzGAMO/.../Historic_Environment_Division_GIS_Data/FeatureServer`). We don't use the GeoJSON files on OpenDataNI. It is the same publisher and the same records. DfC refreshes the service monthly, while the OpenDataNI files lag behind. The OpenDataNI server also refused automated downloads from the cloud environment this project was built in, and the feature service can export GeoJSON directly (`f=geojson`) in WGS84.

## Consequences

- `scripts/fetch_data.py` depends on DfC keeping that service name and its layer numbers: 0 Sites and Monuments Record, 1 Historic Buildings Record, 2 Industrial Heritage Records, 9 Historic Parks, Gardens and Demesnes. If DfC republishes the service under a new name, update `SERVICE` and `LAYERS` in the script.
- The licence is still the Open Government Licence, as stated on OpenDataNI for these datasets.
