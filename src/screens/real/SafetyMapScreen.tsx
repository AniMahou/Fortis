/**
 * The safety map — offline, and genuinely so.
 *
 * No tiles, because tiles come over a network and this app exists for when
 * there is none (docs/DECISIONS.md D2). Instead the user sits at the centre and
 * every hazard is drawn at its true bearing and distance, computed by
 * `geo/bearing.ts` from real GPS coordinates. Range rings are labelled in
 * metres.
 *
 * You get "tear gas, 340m, north-east" rather than a street name. On stage,
 * with the phones in airplane mode, it works — which a street map would not.
 */

import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Circle, Line, Text as SvgText} from 'react-native-svg';
import {AppStatusBar, Screen} from '../../components/Screen';
import {Icon} from '../../components/Icon';
import {
  Body,
  Button,
  Card,
  EmptyState,
  HopBadge,
  Label,
  SectionTitle,
  StatusChip,
} from '../../components/primitives';
import {
  autoRange,
  bearingDegrees,
  compassPoint,
  distanceMeters,
  formatDistance,
  projectToRadar,
} from '../../geo/bearing';
import {
  getCurrentPosition,
  getLastKnownPosition,
  type VoxPosition,
} from '../../native/VoxLocation';
import type {DangerKind} from '../../mesh/payloads';
import {activeDangerPins, type DangerPin} from '../../state/meshModel';
import {useMeshStore} from '../../state/meshStore';
import type {RootStackParamList} from '../../navigation/types';
import {relativeTime} from './DashboardScreen';
import {colors, radius, spacing, type} from '../../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const MAP_SIZE = 300;

export const DANGER_LABELS: Record<DangerKind, string> = {
  tear_gas: 'Tear gas',
  police: 'Police presence',
  gunfire: 'Gunfire',
  medical: 'Medical need',
  blocked: 'Route blocked',
  fire: 'Fire',
};

export function SafetyMapScreen(): React.JSX.Element {
  const navigation = useNavigation<Nav>();
  const [position, setPosition] = useState<VoxPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const dangerPins = useMeshStore(state => state.dangerPins);
  const sosEvents = useMeshStore(state => state.sosEvents);

  const pins = useMemo(
    () => activeDangerPins(dangerPins, Date.now()),
    [dangerPins],
  );

  const locate = useCallback(async (fresh: boolean) => {
    setLocating(true);
    setLocationError(null);
    try {
      setPosition(fresh ? await getCurrentPosition(8000) : await getCurrentPosition(4000));
    } catch (err) {
      // Fall back to a last-known fix so the map is not simply blank. It is
      // labelled stale, which is the honest version of showing something.
      const last = await getLastKnownPosition();
      if (last) {
        setPosition(last);
      } else {
        setLocationError(
          err instanceof Error
            ? err.message
            : 'No position available. Check that Location is switched on.',
        );
      }
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void locate(false);
  }, [locate]);

  // Memoised because a fresh object literal here would be a new reference on
  // every render, which would defeat both useMemos below it — the haversine
  // sort would re-run on every frame while the radar animates.
  const origin = useMemo(
    () =>
      position ? {lat: position.latitude, lng: position.longitude} : null,
    [position],
  );

  const range = useMemo(
    () => (origin ? autoRange(origin, pins) : 500),
    [origin, pins],
  );

  const sorted = useMemo(() => {
    if (!origin) return pins;
    return [...pins].sort(
      (a, b) =>
        distanceMeters(origin, {lat: a.lat, lng: a.lng}) -
        distanceMeters(origin, {lat: b.lat, lng: b.lng}),
    );
  }, [pins, origin]);

  return (
    <Screen contentStyle={styles.content}>
      <AppStatusBar />

      <SectionTitle
        action={
          <Pressable
            onPress={() => void locate(true)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Refresh position">
            <Icon name="refresh" size={20} color={colors.onSurface} />
          </Pressable>
        }>
        Safety map
      </SectionTitle>

      <View style={styles.statusRow}>
        {position ? (
          <StatusChip
            label={
              position.stale
                ? 'Last known position'
                : `Fix ±${Math.round(position.accuracy)}m`
            }
            tone={position.stale ? 'caution' : 'ok'}
          />
        ) : (
          <StatusChip
            label={locating ? 'Finding you…' : 'No position'}
            tone="caution"
          />
        )}
        <StatusChip
          label={`${pins.length} ${pins.length === 1 ? 'hazard' : 'hazards'}`}
          tone={pins.length > 0 ? 'emergency' : 'neutral'}
        />
      </View>

      <Card style={styles.mapCard}>
        <Radar origin={origin} pins={sorted} sosCount={sosEvents.length} range={range} />
        <View style={styles.legend}>
          <Label>Range {formatDistance(range)}</Label>
          <Label>North is up</Label>
        </View>
      </Card>

      {locationError && (
        <Card style={styles.errorCard}>
          <Body style={styles.errorText}>{locationError}</Body>
        </Card>
      )}

      <Button
        label="Report a hazard"
        icon="warning"
        variant="emergency"
        onPress={() => navigation.navigate('ReportDanger')}
        hint="Broadcasts the hazard type and your location to nearby phones"
      />

      <SectionTitle>Reports heard</SectionTitle>

      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon="map"
            title="No hazards reported"
            body="Danger reports from nearby phones appear here, positioned by their real distance and direction."
          />
        </Card>
      ) : (
        <View style={styles.pinList}>
          {sorted.map(pin => (
            <PinRow key={pin.id} pin={pin} origin={origin} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function Radar({
  origin,
  pins,
  sosCount,
  range,
}: {
  origin: {lat: number; lng: number} | null;
  pins: DangerPin[];
  sosCount: number;
  range: number;
}): React.JSX.Element {
  const centre = MAP_SIZE / 2;
  const rings = [0.33, 0.66, 1];

  return (
    <View style={styles.radarWrap}>
      <Svg width={MAP_SIZE} height={MAP_SIZE}>
        {rings.map(fraction => (
          <Circle
            key={fraction}
            cx={centre}
            cy={centre}
            r={centre * fraction}
            stroke={colors.outlineVariant}
            strokeWidth={1}
            fill="none"
          />
        ))}
        <Line
          x1={centre}
          y1={0}
          x2={centre}
          y2={MAP_SIZE}
          stroke={colors.outlineVariant}
          strokeWidth={0.5}
        />
        <Line
          x1={0}
          y1={centre}
          x2={MAP_SIZE}
          y2={centre}
          stroke={colors.outlineVariant}
          strokeWidth={0.5}
        />

        {rings.map(fraction => (
          <SvgText
            key={`label-${fraction}`}
            x={centre + 4}
            y={centre - centre * fraction + 12}
            fontSize={9}
            fill={colors.onSurfaceVariant}>
            {formatDistance(range * fraction)}
          </SvgText>
        ))}

        {origin &&
          pins.map(pin => {
            const point = projectToRadar(
              origin,
              {lat: pin.lat, lng: pin.lng},
              {size: MAP_SIZE, rangeMeters: range},
            );
            return (
              <React.Fragment key={pin.id}>
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={point.clamped ? 5 : 7}
                  fill={colors.emergency}
                  opacity={point.clamped ? 0.55 : 1}
                />
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={12}
                  stroke={colors.emergency}
                  strokeWidth={1}
                  opacity={0.3}
                  fill="none"
                />
              </React.Fragment>
            );
          })}

        {/* The user, always dead centre. */}
        <Circle cx={centre} cy={centre} r={6} fill={colors.primary} />
        <Circle
          cx={centre}
          cy={centre}
          r={11}
          stroke={colors.primary}
          strokeWidth={1.5}
          fill="none"
        />
      </Svg>

      {!origin && (
        <View style={styles.radarOverlay}>
          <Text style={styles.radarOverlayText}>
            Waiting for a position fix
          </Text>
        </View>
      )}
      {sosCount > 0 && (
        <View style={styles.sosBanner}>
          <Icon name="sos" size={14} color={colors.onEmergency} />
          <Text style={styles.sosBannerText}>
            {sosCount} active SOS nearby
          </Text>
        </View>
      )}
    </View>
  );
}

function PinRow({
  pin,
  origin,
}: {
  pin: DangerPin;
  origin: {lat: number; lng: number} | null;
}): React.JSX.Element {
  const target = {lat: pin.lat, lng: pin.lng};
  const bearing = origin ? bearingDegrees(origin, target) : null;
  const distance = origin ? distanceMeters(origin, target) : null;

  return (
    <Card style={styles.pinCard}>
      <View style={styles.pinHeader}>
        <View style={styles.pinIcon}>
          <Icon name="warning" size={18} color={colors.emergency} />
        </View>
        <View style={styles.pinMeta}>
          <Text style={styles.pinTitle}>{DANGER_LABELS[pin.kind]}</Text>
          <Label>
            {distance !== null && bearing !== null
              ? `${formatDistance(distance)} ${compassPoint(bearing)} · ${relativeTime(pin.reportedAt)}`
              : relativeTime(pin.reportedAt)}
          </Label>
        </View>
        <HopBadge hopCount={pin.hopCount} />
      </View>
      {pin.note && <Body style={styles.pinNote}>{pin.note}</Body>}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {gap: spacing.md},
  statusRow: {flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap'},

  mapCard: {alignItems: 'center', gap: spacing.sm},
  radarWrap: {width: MAP_SIZE, height: MAP_SIZE, justifyContent: 'center'},
  radarOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(249,249,249,0.85)',
  },
  radarOverlayText: {...type.bodySm, color: colors.onSurfaceVariant},
  sosBanner: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.emergency,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  sosBannerText: {...type.labelCaps, color: colors.onEmergency},
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },

  errorCard: {backgroundColor: colors.surfaceContainerHigh},
  errorText: {...type.bodySm, color: colors.onSurface},

  pinList: {gap: spacing.sm},
  pinCard: {gap: spacing.sm},
  pinHeader: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  pinIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinMeta: {flex: 1},
  pinTitle: {...type.button, color: colors.onSurface},
  pinNote: {...type.bodySm, color: colors.onSurfaceVariant},
});
