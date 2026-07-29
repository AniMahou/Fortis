import {
  autoRange,
  bearingDegrees,
  compassPoint,
  distanceMeters,
  formatDistance,
  projectToRadar,
} from '../bearing';

// Real places in Dhaka, all within a few km of each other. Using genuine
// coordinates rather than round numbers keeps the assertions meaningful.
const SHAHBAGH = {lat: 23.7381, lng: 90.3956};
const TSC = {lat: 23.7333, lng: 90.3936};
const CURZON_HALL = {lat: 23.7276, lng: 90.4028};

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters(SHAHBAGH, SHAHBAGH)).toBe(0);
  });

  it('matches a known short distance', () => {
    // Shahbagh to TSC is a little under 600m on the ground.
    const distance = distanceMeters(SHAHBAGH, TSC);
    expect(distance).toBeGreaterThan(500);
    expect(distance).toBeLessThan(650);
  });

  it('is symmetric', () => {
    expect(distanceMeters(SHAHBAGH, CURZON_HALL)).toBeCloseTo(
      distanceMeters(CURZON_HALL, SHAHBAGH),
      6,
    );
  });

  it('gets a long distance right', () => {
    // Dhaka to Chittagong: ~214km great-circle. (The familiar 244km figure is
    // the road distance — not what a haversine should return.)
    const distance = distanceMeters(
      {lat: 23.8103, lng: 90.4125},
      {lat: 22.3569, lng: 91.7832},
    );
    expect(distance / 1000).toBeGreaterThan(210);
    expect(distance / 1000).toBeLessThan(220);
  });

  it('handles the antimeridian without blowing up', () => {
    const distance = distanceMeters(
      {lat: 0, lng: 179.9},
      {lat: 0, lng: -179.9},
    );
    // Two tenths of a degree apart at the equator, ~22km — not most of the way
    // round the planet.
    expect(distance).toBeLessThan(25_000);
  });
});

describe('bearingDegrees', () => {
  it.each([
    ['due north', {lat: 1, lng: 0}, 0],
    ['due east', {lat: 0, lng: 1}, 90],
    ['due south', {lat: -1, lng: 0}, 180],
    ['due west', {lat: 0, lng: -1}, 270],
  ])('reports %s', (_label, target, expected) => {
    expect(bearingDegrees({lat: 0, lng: 0}, target)).toBeCloseTo(expected, 1);
  });

  it('always returns 0..360', () => {
    for (const target of [TSC, CURZON_HALL, {lat: -33, lng: -70}]) {
      const bearing = bearingDegrees(SHAHBAGH, target);
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    }
  });

  it('reverses by roughly 180 degrees', () => {
    const there = bearingDegrees(SHAHBAGH, CURZON_HALL);
    const back = bearingDegrees(CURZON_HALL, SHAHBAGH);
    // Only approximate in general — meridians converge, so the reverse
    // bearing of a long great-circle path is not exactly there+180. Over the
    // ~1.5km this app deals with, it is within a fraction of a degree.
    const separation = (back - there + 360) % 360;
    expect(Math.abs(separation - 180)).toBeLessThan(1);
  });
});

describe('compassPoint', () => {
  it.each([
    [0, 'N'],
    [45, 'NE'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W'],
    [359, 'N'],
  ])('maps %i degrees to %s', (bearing, expected) => {
    expect(compassPoint(bearing)).toBe(expected);
  });

  it('normalises out-of-range input', () => {
    expect(compassPoint(-90)).toBe('W');
    expect(compassPoint(450)).toBe('E');
  });
});

describe('formatDistance', () => {
  it.each([
    [0, 'here'],
    [15, 'here'],
    [47, '50m'],
    [437, '440m'],
    [1500, '1.5km'],
    [24_000, '24km'],
  ])('formats %i as %s', (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });

  it('rounds coarsely, because a phone GPS is not precise to the metre', () => {
    // "437m" would claim precision the fix does not have.
    expect(formatDistance(437)).not.toBe('437m');
  });

  it('handles nonsense input without rendering NaN on screen', () => {
    expect(formatDistance(NaN)).toBe('—');
    expect(formatDistance(Infinity)).toBe('—');
  });
});

describe('projectToRadar', () => {
  const options = {size: 300, rangeMeters: 1000};

  it('puts the user at the centre', () => {
    const point = projectToRadar(SHAHBAGH, SHAHBAGH, options);
    expect(point.x).toBeCloseTo(150, 5);
    expect(point.y).toBeCloseTo(150, 5);
    expect(point.clamped).toBe(false);
  });

  it('places north above the centre, not below', () => {
    // Screen y grows downward while bearing is measured clockwise from north,
    // so getting this backwards would silently mirror the whole map.
    const north = projectToRadar(
      {lat: 0, lng: 0},
      {lat: 0.005, lng: 0},
      options,
    );
    expect(north.y).toBeLessThan(150);
    expect(north.x).toBeCloseTo(150, 1);
  });

  it('places east to the right', () => {
    const east = projectToRadar({lat: 0, lng: 0}, {lat: 0, lng: 0.005}, options);
    expect(east.x).toBeGreaterThan(150);
    expect(east.y).toBeCloseTo(150, 1);
  });

  it('scales distance linearly out to the range', () => {
    // A point at half the range should sit at half the radius.
    const halfRange = projectToRadar(
      {lat: 0, lng: 0},
      {lat: 0.0045, lng: 0}, // ~500m north
      options,
    );
    const radius = 150 - halfRange.y;
    expect(radius).toBeGreaterThan(60);
    expect(radius).toBeLessThan(90);
  });

  it('pins a distant hazard to the edge rather than dropping it', () => {
    // A hazard 5km away still matters, and its direction is most of the value.
    const far = projectToRadar({lat: 0, lng: 0}, {lat: 0.05, lng: 0}, options);
    expect(far.clamped).toBe(true);
    expect(far.y).toBeCloseTo(0, 1);
  });
});

describe('autoRange', () => {
  it('uses the minimum when there is nothing to show', () => {
    expect(autoRange(SHAHBAGH, [])).toBe(200);
  });

  it('picks a round range that keeps the furthest pin inside', () => {
    const range = autoRange(SHAHBAGH, [TSC]);
    expect([200, 500, 1000, 2000, 5000]).toContain(range);
    expect(range).toBeGreaterThan(distanceMeters(SHAHBAGH, TSC));
  });

  it('leaves headroom so the furthest pin is not on the edge ring', () => {
    const range = autoRange(SHAHBAGH, [TSC, CURZON_HALL]);
    const furthest = Math.max(
      distanceMeters(SHAHBAGH, TSC),
      distanceMeters(SHAHBAGH, CURZON_HALL),
    );
    expect(range).toBeGreaterThan(furthest * 1.1);
  });

  it('caps rather than zooming out forever', () => {
    expect(autoRange(SHAHBAGH, [{lat: 0, lng: 0}])).toBe(5000);
  });
});
