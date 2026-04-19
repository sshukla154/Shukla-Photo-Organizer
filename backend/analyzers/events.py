"""Cluster photos into time-based events."""
from __future__ import annotations

import math

TIME_GAP_HOURS = 4.0       # new event if gap between consecutive photos exceeds this
GPS_GAP_KM = 0.5           # new event if GPS jump exceeds this (when both have GPS)
EARTH_RADIUS_KM = 6371.0


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two GPS points."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _sort_key(photo: dict) -> float:
    """Use EXIF datetime if available, fall back to mtime."""
    return photo.get("exif_datetime") or photo.get("mtime") or 0.0


def cluster_events(
    photos: list[dict],
    time_gap_hours: float = TIME_GAP_HOURS,
    gps_gap_km: float = GPS_GAP_KM,
) -> list[list[dict]]:
    """Return a list of event clusters (each cluster is a list of photos).

    A new event starts when the time gap between consecutive photos exceeds
    time_gap_hours, or when both photos have GPS and the distance exceeds
    gps_gap_km.  Clusters with fewer than 2 photos are dropped.
    """
    if not photos:
        return []

    sorted_photos = sorted(photos, key=_sort_key)
    time_gap_sec = time_gap_hours * 3600

    clusters: list[list[dict]] = [[sorted_photos[0]]]

    for photo in sorted_photos[1:]:
        prev = clusters[-1][-1]
        prev_t = _sort_key(prev)
        curr_t = _sort_key(photo)

        time_split = (curr_t - prev_t) > time_gap_sec

        gps_split = False
        if (
            not time_split
            and prev.get("gps_lat") is not None
            and prev.get("gps_lon") is not None
            and photo.get("gps_lat") is not None
            and photo.get("gps_lon") is not None
        ):
            dist = _haversine(
                prev["gps_lat"], prev["gps_lon"],
                photo["gps_lat"], photo["gps_lon"],
            )
            gps_split = dist > gps_gap_km

        if time_split or gps_split:
            clusters.append([photo])
        else:
            clusters[-1].append(photo)

    return [c for c in clusters if len(c) >= 2]
