// Geofencing for attendance check-in / check-out.
// Login is allowed anywhere - only attendance actions are restricted.

import { toast } from 'sonner';

export type GeoSite = { name: string; lat: number; lng: number };

export const ALLOWED_SITES: GeoSite[] = [
  { name: 'Site 1', lat: -0.677334, lng: 34.779603 },
  { name: 'Site 2', lat: 32.894982, lng: -111.752173 },
];

export const ALLOWED_RADIUS_METERS = 1000; // 1 km

// Haversine distance in meters
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function nearestSite(lat: number, lng: number) {
  let best = { site: ALLOWED_SITES[0], distance: Infinity };
  for (const s of ALLOWED_SITES) {
    const d = distanceMeters(lat, lng, s.lat, s.lng);
    if (d < best.distance) best = { site: s, distance: d };
  }
  return best;
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    });
  });
}

/**
 * Verifies the user is within an allowed site for attendance actions.
 * Returns true if allowed, false otherwise (and shows a toast).
 */
export async function verifyAttendanceLocation(): Promise<boolean> {
  try {
    const pos = await getCurrentPosition();
    const { latitude, longitude } = pos.coords;
    const { site, distance } = nearestSite(latitude, longitude);
    if (distance <= ALLOWED_RADIUS_METERS) {
      return true;
    }
    const km = (distance / 1000).toFixed(2);
    toast.error(`Out of range: you are ${km} km from ${site.name}. Attendance is only allowed within 1 km of an authorized site.`);
    return false;
  } catch (err: any) {
    const code = err?.code;
    if (code === 1) {
      toast.error('Location permission denied. Enable location to check in/out.');
    } else if (code === 2) {
      toast.error('Unable to determine your location. Check GPS / network and try again.');
    } else if (code === 3) {
      toast.error('Location request timed out. Please try again.');
    } else {
      toast.error(err?.message || 'Could not verify your location.');
    }
    return false;
  }
}
