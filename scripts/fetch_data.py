#!/usr/bin/env python3
"""Download the Department for Communities historic environment datasets and
write them into the site as small GeoJSON tiles.

Usage:  python3 scripts/fetch_data.py

Source: DfC Historic Environment Division GIS Data (ArcGIS feature service),
the same data published on OpenDataNI, refreshed monthly by DfC.
See docs/adr/0001-heritage-data-from-dfc-feature-service.md and
docs/adr/0002-heritage-data-as-geojson-tiles.md.

Only the Python standard library is used.
"""

import datetime
import json
import math
import pathlib
import re
import shutil
import sys
import urllib.parse
import urllib.request

SERVICE = (
    "https://services2.arcgis.com/BdBkthNLO9mzGAMO/arcgis/rest/services/"
    "Historic_Environment_Division_GIS_Data/FeatureServer"
)

# Record Type -> feature service layer id.
LAYERS = {
    "monument": 0,  # Sites and Monuments Record
    "building": 1,  # Historic Buildings Record
    "industrial": 2,  # Industrial Heritage Record
    "park": 9,  # Historic Parks, Gardens and Demesnes
}

# Tile grid in degrees. Roughly 5.5 km (north-south) by 5.2 km (east-west)
# in Northern Ireland. Must match site/js/tiles.js (read from the manifest).
CELL_LAT = 0.05
CELL_LON = 0.08

PAGE_SIZE = 2000
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "site" / "data"
TILE_DIR = OUT_DIR / "tiles"


# ---------------------------------------------------------------- download


def fetch_layer(layer_id):
    features = []
    offset = 0
    while True:
        query = urllib.parse.urlencode(
            {
                "where": "1=1",
                "outFields": "*",
                "outSR": "4326",
                "orderByFields": "OBJECTID",
                "resultOffset": offset,
                "resultRecordCount": PAGE_SIZE,
                "f": "geojson",
            }
        )
        url = f"{SERVICE}/{layer_id}/query?{query}"
        with urllib.request.urlopen(url, timeout=120) as response:
            page = json.load(response)
        if "error" in page:
            raise RuntimeError(f"Layer {layer_id}: {page['error']}")
        batch = page.get("features", [])
        features.extend(batch)
        if len(batch) < PAGE_SIZE:
            return features
        offset += PAGE_SIZE


# ---------------------------------------------------------------- text helpers


def clean(value):
    """Return a stripped string, or '' for empty/'None' values."""
    if value is None:
        return ""
    text = re.sub(r"\s+", " ", str(value)).strip()
    return "" if text.lower() in ("none", "null", "n/a") else text


def is_shouting(text):
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and all(c.isupper() for c in letters)


SMALL_WORDS = {"of", "the", "and", "at", "on", "in", "to", "for", "by", "with", "a", "an"}


def _title_words(text):
    def word(match):
        w = match.group(0)
        if match.start() > 0 and w.lower() in SMALL_WORDS:
            return w.lower()
        if re.fullmatch(r"(?i)mc[a-z]+", w):
            return "Mc" + w[2:].capitalize()
        return w.capitalize()

    titled = re.sub(r"[A-Za-z]+", word, text.lower())
    return re.sub(r"'S\b", "'s", titled)  # "Queen'S" -> "Queen's"


def title_case(text):
    """'LEMNAGH BEG' -> 'Lemnagh Beg'; 'MAIN FRONT BLOCK Lanyon' -> 'Main Front Block Lanyon'.

    Mixed-case text is left alone, except runs of two or more capitalised words.
    Single capitalised words in mixed text (such as 'GNR') are kept as acronyms.
    """
    text = clean(text)
    if is_shouting(text):
        return _title_words(text)
    titled = re.sub(r"\b[A-Z][A-Z'.&-]+(?:\s+[A-Z][A-Z'.&-]+)+\b", lambda m: _title_words(m.group(0)), text)
    return re.sub(r"(?<=\s)(Of|The|And|At|On|In|To|For)(?=\s)", lambda m: m.group(0).lower(), titled)


def sentence_case(text):
    """'PASSAGE TOMB: CLOGHABOGHIL' -> 'Passage tomb: Cloghaboghil'."""
    text = clean(text)
    if not is_shouting(text):
        return text
    head, sep, tail = text.partition(":")
    head = head.strip().lower().capitalize()
    if sep:
        return f"{head}: {title_case(tail.strip())}"
    return head


PERIODS = {
    "E.CHRIST.": "Early Christian",
    "E.C.": "Early Christian",
    "POST-MED": "Post-medieval",
    "POST_MED": "Post-medieval",
    "MED": "Medieval",
    "L.MED": "Late medieval",
    "LATE-MED": "Late medieval",
    "NEO": "Neolithic",
    "NEOL": "Neolithic",
    "MESO": "Mesolithic",
    "B.A.": "Bronze Age",
    "E.B.A.": "Early Bronze Age",
    "M.B.A.": "Middle Bronze Age",
    "L.B.A.": "Late Bronze Age",
    "I.A.": "Iron Age",
    "LATE NEO": "Late Neolithic",
    "EARLY NEO": "Early Neolithic",
}


def period_label(raw):
    """'MED/L.MED; C17TH' -> 'Medieval / Late medieval, 17th century'."""
    labels = []
    for chunk in re.split(r"[;,]", clean(raw)):
        chunk = chunk.strip()
        if not chunk or chunk.upper() == "UNCERTAIN":
            continue
        parts = []
        for part in chunk.split("/"):
            part = part.strip()
            key = part.upper()
            century = re.fullmatch(r"C(\d{1,2})TH", key)
            if key in PERIODS:
                parts.append(PERIODS[key])
            elif century:
                parts.append(f"{century.group(1)}th century")
            else:
                parts.append(sentence_case(part) if is_shouting(part) else part)
        label = " / ".join(parts)
        if label not in labels:
            labels.append(label)
    return ", ".join(labels)


def address_parts(raw):
    parts = [clean(p) for p in re.split(r"[\n,]", str(raw or ""))]
    keep = []
    for part in parts:
        if not part:
            continue
        if re.fullmatch(r"(?i)co\.?\s*\w+", part):  # "Co Londonderry"
            continue
        if re.fullmatch(r"(?i)BT\s*\d{1,2}\s*\S{3}", part):  # postcode
            continue
        keep.append(title_case(part))
    return keep


# ---------------------------------------------------------------- records


def monument(props):
    facts = []
    period = period_label(props.get("General_Period"))
    if period:
        facts.append(period)
    protection = clean(props.get("Protection"))
    if protection:
        facts.append(protection[0].upper() + protection[1:].lower().replace("state care", "State Care"))
    townland = title_case(props.get("Townland_s_"))
    if townland:
        facts.append(f"{townland} townland")
    approx = clean(props.get("Located")) != "Located"
    if approx:
        facts.append("Location approximate")
    title = sentence_case(props.get("Edited_Type")) or sentence_case(props.get("General_Type")) or "Monument"
    return {
        "ref": clean(props.get("SMRNo")),
        "title": title,
        "facts": facts,
    }


def building(props):
    parts = address_parts(props.get("Address"))
    title = parts[0] if parts else "Historic building"
    # A bare house number reads badly on its own: "12" -> "12 Main Street".
    if len(parts) > 1 and re.fullmatch(r"[\d\-–a-zA-Z]{1,6}", title) and any(c.isdigit() for c in title):
        title = f"{title} {parts[1]}"
        parts = parts[1:]
    facts = []
    if len(parts) > 1:
        facts.append(", ".join(parts[1:3]))
    grade = clean(props.get("CurrentGra"))
    if "record only" in grade.lower():
        facts.append("Not listed (record only)")
    elif grade.lower() == "delisted":
        facts.append("Delisted")
    elif grade:
        facts.append(f"Listed, grade {grade}")
    built = clean(props.get("Date_Const"))
    if built:
        facts.append(f"Built {built.replace(' - ', '–')}")
    use = sentence_case(props.get("CurrentUse"))
    if use:
        facts.append(use)
    derelict = clean(props.get("Derelict")).lower()
    if derelict == "yes":
        facts.append("Derelict")
    elif derelict.startswith("pa"):
        facts.append("Partially derelict")
    elif derelict == "demolished":
        facts.append("Demolished")
    if clean(props.get("Thatched")).lower() == "yes":
        facts.append("Thatched")
    townland = title_case(props.get("Townland"))
    if townland:
        facts.append(f"{townland} townland")
    return {"ref": clean(props.get("HB_ref")), "title": title, "facts": facts}


def industrial(props):
    facts = []
    location = title_case(props.get("LOCATION"))
    if location:
        facts.append(location)
    townland = title_case(props.get("TD"))
    if townland:
        facts.append(f"{townland} townland")
    county = clean(props.get("CO"))
    if county:
        facts.append(f"Co. {county}")
    return {
        "ref": clean(props.get("IHR")),
        "title": sentence_case(props.get("X_TYPE")) or "Industrial heritage",
        "facts": facts,
    }


def park(props):
    facts = []
    status = clean(props.get("STATUS")).upper()
    if status == "REGISTER":
        facts.append("On the Register of Parks, Gardens and Demesnes")
    elif status == "SUPPLEMENTARY":
        facts.append("On the supplementary list")
    grade = clean(props.get("Grade"))
    if grade:
        facts.append(f"Grade {grade}")
    council = title_case(props.get("COUNCIL"))
    if council:
        facts.append(council)
    return {
        "ref": clean(props.get("REF_NO")),
        "title": title_case(props.get("SITE")) or "Historic park or garden",
        "facts": facts,
    }


BUILDERS = {"monument": monument, "building": building, "industrial": industrial, "park": park}


# ---------------------------------------------------------------- geometry


def round_coords(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 5), round(coords[1], 5)]
    return [round_coords(c) for c in coords]


def drop_repeats(ring):
    out = []
    for point in ring:
        if not out or point != out[-1]:
            out.append(point)
    return out


def tidy_geometry(geometry):
    geometry = {"type": geometry["type"], "coordinates": round_coords(geometry["coordinates"])}
    if geometry["type"] == "Polygon":
        geometry["coordinates"] = [drop_repeats(r) for r in geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        geometry["coordinates"] = [[drop_repeats(r) for r in poly] for poly in geometry["coordinates"]]
    return geometry


def all_points(coords):
    if isinstance(coords[0], (int, float)):
        yield coords
    else:
        for c in coords:
            yield from all_points(c)


def cell_of(lon, lat):
    return math.floor(lon / CELL_LON), math.floor(lat / CELL_LAT)


def cells_for(geometry):
    lons, lats = zip(*all_points(geometry["coordinates"]))
    x0, y0 = cell_of(min(lons), min(lats))
    x1, y1 = cell_of(max(lons), max(lats))
    return [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]


# ---------------------------------------------------------------- main


def main():
    tiles = {}
    counts = {}
    for record_type, layer_id in LAYERS.items():
        print(f"Downloading {record_type} (layer {layer_id})...", flush=True)
        raw = fetch_layer(layer_id)
        kept = 0
        for feature in raw:
            geometry = feature.get("geometry")
            if not geometry or not geometry.get("coordinates"):
                continue
            props = feature.get("properties") or {}
            record = BUILDERS[record_type](props)
            out = {
                "type": "Feature",
                "id": f"{record_type}:{props.get('OBJECTID')}",
                "geometry": tidy_geometry(geometry),
                "properties": {"type": record_type, **record},
            }
            for cell in cells_for(out["geometry"]):
                tiles.setdefault(cell, []).append(out)
            kept += 1
        counts[record_type] = kept
        print(f"  {kept} records (of {len(raw)})", flush=True)

    if TILE_DIR.exists():
        shutil.rmtree(TILE_DIR)
    TILE_DIR.mkdir(parents=True)
    for (x, y), features in sorted(tiles.items()):
        path = TILE_DIR / f"{x}_{y}.geojson"
        with path.open("w", encoding="utf-8") as fh:
            json.dump({"type": "FeatureCollection", "features": features}, fh, ensure_ascii=False, separators=(",", ":"))

    manifest = {
        "generated": datetime.date.today().isoformat(),
        "source": SERVICE,
        "cellSize": {"lat": CELL_LAT, "lon": CELL_LON},
        "counts": counts,
        "cells": sorted(f"{x}_{y}" for x, y in tiles),
    }
    with (OUT_DIR / "manifest.json").open("w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
        fh.write("\n")

    size = sum(p.stat().st_size for p in TILE_DIR.iterdir())
    print(f"Wrote {len(tiles)} tiles ({size / 1e6:.1f} MB) to {TILE_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # Friendly message for a command-line tool.
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
