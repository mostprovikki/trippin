#!/usr/bin/env python3
"""Fetch felt-temperature forecast + climatology for trip packing pages.

Open-Meteo, no API key. Stdlib only.

  # forecast for two places over the trip dates
  python3 weather.py "Hanoi:21.03,105.85" "Sapa:22.34,103.84" \
      --start 2026-08-07 --end 2026-08-16

  # a summit / pass, which is far colder than the town below it
  python3 weather.py "Fansipan:22.303,103.775" --elevation 3143 \
      --start 2026-08-11 --end 2026-08-11

  # past-August averages for dates beyond forecast range
  python3 weather.py "Hanoi:21.03,105.85" --start 2026-08-14 --end 2026-08-16 --climatology

Why apparent temperature: at 90% humidity a 33 C day feels like 41 C. The felt
number is what decides clothing, so the page should quote it and say so.

Why --elevation: a grid forecast reports the valley. Forcing the model to a
summit height reveals the cold stop that justifies a fleece on an otherwise hot
trip. Treat the result as a good estimate, not a station reading, and expect the
real summit to be windier.
"""

import argparse
import datetime as dt
import json
import statistics
import sys
import urllib.parse
import urllib.request

FORECAST = "https://api.open-meteo.com/v1/forecast"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

DAILY = [
    "temperature_2m_max", "temperature_2m_min",
    "apparent_temperature_max", "apparent_temperature_min",
    "precipitation_sum", "precipitation_probability_max",
    "wind_speed_10m_max", "uv_index_max", "relative_humidity_2m_mean",
]


def get(url, params):
    qs = urllib.parse.urlencode(params, doseq=True)
    with urllib.request.urlopen(f"{url}?{qs}", timeout=60) as r:
        return json.load(r)


def parse_place(s):
    """'Name:lat,lon' -> (name, lat, lon)"""
    try:
        name, coords = s.split(":")
        lat, lon = coords.split(",")
        return name, float(lat), float(lon)
    except ValueError:
        sys.exit(f"bad place {s!r} — expected 'Name:lat,lon' e.g. 'Hanoi:21.03,105.85'")


def num(v, w=6, p=1):
    return " " * w if v is None else f"{v:{w}.{p}f}"


def forecast(name, lat, lon, start, end, elevation, tz):
    p = {"latitude": lat, "longitude": lon, "daily": ",".join(DAILY),
         "timezone": tz, "forecast_days": 16}
    if elevation is not None:
        p["elevation"] = elevation
    d = get(FORECAST, p).get("daily", {})

    label = f"{name} ({elevation} m forced)" if elevation is not None else name
    print(f"\n### {label}  —  FORECAST")
    print("date        air_max air_min FELT_mx FELT_mn  rain  pop%  wind    uv  RH%")
    rows = 0
    for i, day in enumerate(d.get("time", [])):
        if not (start <= day <= end):
            continue
        rows += 1
        print(day,
              num(d["temperature_2m_max"][i]), num(d["temperature_2m_min"][i]),
              num(d["apparent_temperature_max"][i]), num(d["apparent_temperature_min"][i]),
              num(d["precipitation_sum"][i]),
              ("     " if d["precipitation_probability_max"][i] is None
               else f"{d['precipitation_probability_max'][i]:5}"),
              num(d["wind_speed_10m_max"][i]), num(d["uv_index_max"][i]),
              ("    " if d["relative_humidity_2m_mean"][i] is None
               else f"{d['relative_humidity_2m_mean'][i]:4}"))
    if not rows:
        print("  (no forecast rows in range — dates are beyond ~16 days; use --climatology)")
    elif any(d["apparent_temperature_max"][i] is None
             for i, day in enumerate(d.get("time", [])) if start <= day <= end):
        print("  NOTE: blank cells are past forecast range. Use --climatology for those days")
        print("        and label them as averages on the page.")


def climatology(name, lat, lon, start, end, tz, years):
    s = dt.date.fromisoformat(start)
    e = dt.date.fromisoformat(end)
    felt, air, rain = [], [], []
    this_year = dt.date.today().year
    for y in range(this_year - years, this_year):
        d = get(ARCHIVE, {
            "latitude": lat, "longitude": lon,
            "start_date": s.replace(year=y).isoformat(),
            "end_date": e.replace(year=y).isoformat(),
            "daily": "temperature_2m_max,apparent_temperature_max,precipitation_sum",
            "timezone": tz,
        }).get("daily", {})
        air += [x for x in d.get("temperature_2m_max", []) if x is not None]
        felt += [x for x in d.get("apparent_temperature_max", []) if x is not None]
        rain += [x for x in d.get("precipitation_sum", []) if x is not None]

    if not felt:
        print(f"\n### {name} — CLIMATOLOGY: no archive data returned")
        return
    wet = 100 * sum(1 for x in rain if x >= 1) / len(rain)
    print(f"\n### {name}  —  {start} to {end}, {years}-year average")
    print(f"  air max      {statistics.mean(air):5.1f} C")
    print(f"  FELT max     {statistics.mean(felt):5.1f} C   <- quote this one")
    print(f"  rain/day     {statistics.mean(rain):5.1f} mm")
    print(f"  wet days     {wet:5.0f} %")
    print(f"  wettest day  {max(rain):5.1f} mm")
    print("  Label these days as averages on the page, not forecast.")


def main():
    ap = argparse.ArgumentParser(description="Felt-temperature data for trip packing pages.")
    ap.add_argument("places", nargs="+", metavar="Name:lat,lon")
    ap.add_argument("--start", required=True, help="YYYY-MM-DD")
    ap.add_argument("--end", required=True, help="YYYY-MM-DD")
    ap.add_argument("--elevation", type=float,
                    help="force this height in metres — use for a summit or pass")
    ap.add_argument("--climatology", action="store_true",
                    help="past-year averages instead of forecast (for dates >16 days out)")
    ap.add_argument("--years", type=int, default=7)
    ap.add_argument("--timezone", default="auto")
    a = ap.parse_args()

    for spec in a.places:
        name, lat, lon = parse_place(spec)
        try:
            if a.climatology:
                climatology(name, lat, lon, a.start, a.end, a.timezone, a.years)
            else:
                forecast(name, lat, lon, a.start, a.end, a.elevation, a.timezone)
        except Exception as exc:                                  # noqa: BLE001
            print(f"\n### {name}: FAILED — {exc}", file=sys.stderr)

    print("\nFELT_mx/FELT_mn = apparent temperature. Use it for clothing decisions.")


if __name__ == "__main__":
    main()
