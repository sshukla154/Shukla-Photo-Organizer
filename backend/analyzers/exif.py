"""Extract EXIF datetime and GPS from photos."""
from __future__ import annotations

from datetime import datetime

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS


def extract_exif(img: Image.Image) -> dict:
    """Return exif_datetime (Unix timestamp) and gps_lat/gps_lon (floats or None)."""
    result: dict = {"exif_datetime": None, "gps_lat": None, "gps_lon": None}
    try:
        raw = img._getexif()  # type: ignore[attr-defined]
    except Exception:
        return result
    if not raw:
        return result

    exif = {TAGS.get(k, k): v for k, v in raw.items()}

    dt_str = exif.get("DateTimeOriginal") or exif.get("DateTime")
    if dt_str:
        try:
            dt = datetime.strptime(dt_str, "%Y:%m:%d %H:%M:%S")
            result["exif_datetime"] = dt.timestamp()
        except ValueError:
            pass

    gps_info = exif.get("GPSInfo")
    if gps_info and isinstance(gps_info, dict):
        gps = {GPSTAGS.get(k, k): v for k, v in gps_info.items()}
        lat = _dms_to_decimal(gps.get("GPSLatitude"), gps.get("GPSLatitudeRef"))
        lon = _dms_to_decimal(gps.get("GPSLongitude"), gps.get("GPSLongitudeRef"))
        result["gps_lat"] = lat
        result["gps_lon"] = lon

    return result


def _dms_to_decimal(dms, ref) -> float | None:
    if not dms or len(dms) != 3:
        return None
    try:
        d = float(dms[0])
        m = float(dms[1])
        s = float(dms[2])
        decimal = d + m / 60 + s / 3600
        if ref in ("S", "W"):
            decimal = -decimal
        return decimal
    except (TypeError, ZeroDivisionError):
        return None
