/**
 * Distance and bearing between two coordinates.
 *
 * This is what makes the offline map real rather than decorative. VOX cannot
 * use Google Maps — the tiles come over the network, and the entire premise is
 * that there is no network (docs/DECISIONS.md D2). So the map draws hazards at
 * their true bearing and distance from the user, computed here from actual GPS
 * fixes.
 *
 * You get "tear gas, 340m, north-east" rather than a street name. For the
 * one-pin target CONTEXT.md sets that is enough, and unlike a street map it
 * works at zero bandwidth — which is the only condition that matters.
 */

/** Mean Earth radius, metres. */
const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export interface Coordinate {
  lat: number;
  lng: number;
}

/**
 * Great-circle distance in metres, by the haversine formula.
 *
 * Haversine rather than the faster equirectangular approximation because the
 * error matters at the scale this app works at: telling someone a hazard is
 * 200m away when it is 260m away is the difference between two street corners.
 */
export function distanceMeters(from: Coordinate, to: Coordinate): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Initial bearing in degrees clockwise from true north, 0-360.
 *
 * "Initial" because a great-circle path curves; over the few hundred metres
 * this app deals with the difference is not measurable.
 */
export function bearingDegrees(from: Coordinate, to: Coordinate): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLng = toRadians(to.lng - from.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
] as const;

export function compassPoint(bearing: number): string {
  const normalised = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalised / 22.5) % 16;
  return COMPASS_POINTS[index]!;
}

/**
 * Distance as a person would say it.
 *
 * Rounded coarsely on purpose. A phone GPS is accurate to somewhere between 5
 * and 50 metres, so "437m" claims a precision the fix does not have; "440m"
 * does not pretend.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 20) return 'here';
  if (meters < 100) return `${Math.round(meters / 10) * 10}m`;
  if (meters < 1000) return `${Math.round(meters / 20) * 20}m`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)}km`;
  return `${Math.round(meters / 1000)}km`;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** True when the point was outside the map range and pinned to the edge. */
  clamped: boolean;
}

/**
 * Projects a coordinate onto the radar view.
 *
 * The user sits at the centre. `rangeMeters` is the radius the outermost ring
 * represents. Anything beyond it is clamped to the edge rather than dropped —
 * a hazard 2km away still matters, and knowing which direction it lies in is
 * most of the value.
 */
export function projectToRadar(
  origin: Coordinate,
  target: Coordinate,
  options: {size: number; rangeMeters: number},
): ScreenPoint {
  const {size, rangeMeters} = options;
  const centre = size / 2;
  const distance = distanceMeters(origin, target);
  const bearing = bearingDegrees(origin, target);

  const clamped = distance > rangeMeters;
  const radius = (Math.min(distance, rangeMeters) / rangeMeters) * centre;

  // Bearing is clockwise from north; screen y grows downward, so north is -y.
  const radians = toRadians(bearing);
  return {
    x: centre + radius * Math.sin(radians),
    y: centre - radius * Math.cos(radians),
    clamped,
  };
}

/**
 * A range that keeps every pin visible, snapped to a round number so the ring
 * labels read sensibly.
 */
export function autoRange(
  origin: Coordinate,
  targets: readonly Coordinate[],
  options: {min?: number; max?: number} = {},
): number {
  const min = options.min ?? 200;
  const max = options.max ?? 5000;
  if (targets.length === 0) return min;

  const furthest = Math.max(
    ...targets.map(target => distanceMeters(origin, target)),
  );
  // Headroom so the outermost pin is not sitting on the edge ring.
  const needed = furthest * 1.2;

  const steps = [200, 500, 1000, 2000, 5000];
  const chosen = steps.find(step => step >= needed) ?? max;
  return Math.min(Math.max(chosen, min), max);
}
