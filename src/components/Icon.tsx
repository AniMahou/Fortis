/**
 * The icon set.
 *
 * The Stitch export uses Material Symbols, which arrives as a webfont and is
 * not available in React Native. Rather than bundle an icon font for the two
 * dozen glyphs this app uses, these are drawn as SVG paths on a 24×24 grid
 * with a consistent 2px round-capped stroke.
 *
 * Consistency is the point. A stroke set at one weight reads as one system,
 * which matters more here than matching Material exactly — the design's own
 * brief is "modern minimalist, high-utility, calm authority".
 */

import React from 'react';
import Svg, {Circle, Line, Path, Polyline} from 'react-native-svg';
import {colors} from '../theme/tokens';

export type IconName =
  | 'chat'
  | 'feed'
  | 'map'
  | 'shield'
  | 'sos'
  | 'person'
  | 'person-off'
  | 'lock'
  | 'bluetooth'
  | 'location'
  | 'storage'
  | 'camera'
  | 'check'
  | 'warning'
  | 'arrow-left'
  | 'arrow-right'
  | 'refresh'
  | 'send'
  | 'edit'
  | 'wifi-off'
  | 'key'
  | 'trash'
  | 'clock'
  | 'info'
  | 'plus'
  | 'settings'
  | 'signal';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Fills the shape instead of stroking it. Used for active nav states. */
  filled?: boolean;
}

export function Icon({
  name,
  size = 24,
  color = colors.onSurface,
  filled = false,
}: IconProps): React.JSX.Element {
  const stroke = filled ? 'none' : color;
  const fill = filled ? color : 'none';
  const common = {
    stroke,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderPaths(name, common, color)}
    </Svg>
  );
}

type Common = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: string;
};

function renderPaths(
  name: IconName,
  c: Common,
  color: string,
): React.JSX.Element {
  switch (name) {
    case 'chat':
      return <Path {...c} d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z" />;

    case 'feed':
      // Concentric arcs — a broadcast, which is what the mesh feed is.
      return (
        <>
          <Circle {...c} cx="12" cy="12" r="2" />
          <Path {...c} d="M8.5 8.5a5 5 0 0 0 0 7" />
          <Path {...c} d="M15.5 15.5a5 5 0 0 0 0-7" />
          <Path {...c} d="M5.5 5.5a9 9 0 0 0 0 13" />
          <Path {...c} d="M18.5 18.5a9 9 0 0 0 0-13" />
        </>
      );

    case 'map':
      return (
        <>
          <Path {...c} d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z" />
          <Line {...c} x1="9" y1="4" x2="9" y2="17" />
          <Line {...c} x1="15" y1="7" x2="15" y2="20" />
        </>
      );

    case 'shield':
      return <Path {...c} d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6l-8-3Z" />;

    case 'sos':
      return (
        <>
          <Path {...c} d="M12 3v9" />
          <Path {...c} d="M6.5 6.5a8 8 0 1 0 11 0" />
        </>
      );

    case 'person':
      return (
        <>
          <Circle {...c} cx="12" cy="8" r="4" />
          <Path {...c} d="M5 21a7 7 0 0 1 14 0" />
        </>
      );

    case 'person-off':
      return (
        <>
          <Circle {...c} cx="12" cy="8" r="4" />
          <Path {...c} d="M5 21a7 7 0 0 1 14 0" />
          <Line {...c} x1="3" y1="3" x2="21" y2="21" />
        </>
      );

    case 'lock':
      return (
        <>
          <Path {...c} d="M5 11h14v9H5z" />
          <Path {...c} d="M8 11V7a4 4 0 0 1 8 0v4" />
        </>
      );

    case 'key':
      return (
        <>
          <Circle {...c} cx="8" cy="8" r="4" />
          <Path {...c} d="M11 11l9 9" />
          <Path {...c} d="M17 17l2-2" />
        </>
      );

    case 'bluetooth':
      return <Path {...c} d="m7 7 10 10-5 4V3l5 4L7 17" />;

    case 'location':
      return (
        <>
          <Path {...c} d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
          <Circle {...c} cx="12" cy="10" r="2.5" />
        </>
      );

    case 'storage':
      return (
        <>
          <Path {...c} d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z" />
          <Path {...c} d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
          <Path {...c} d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </>
      );

    case 'camera':
      return (
        <>
          <Path {...c} d="M3 7h4l2-2h6l2 2h4v12H3z" />
          <Circle {...c} cx="12" cy="13" r="3.5" />
        </>
      );

    case 'check':
      return (
        <>
          <Circle {...c} cx="12" cy="12" r="9" />
          <Polyline {...c} points="8,12.5 11,15.5 16,9" fill="none" stroke={color} />
        </>
      );

    case 'warning':
      return (
        <>
          <Path {...c} d="M12 4 2.5 20h19L12 4Z" />
          <Line {...c} x1="12" y1="10" x2="12" y2="14" stroke={color} />
          <Line {...c} x1="12" y1="17" x2="12" y2="17" stroke={color} />
        </>
      );

    case 'arrow-left':
      return (
        <>
          <Line {...c} x1="20" y1="12" x2="4" y2="12" />
          <Polyline {...c} points="10,6 4,12 10,18" fill="none" />
        </>
      );

    case 'arrow-right':
      return (
        <>
          <Line {...c} x1="4" y1="12" x2="20" y2="12" />
          <Polyline {...c} points="14,6 20,12 14,18" fill="none" />
        </>
      );

    case 'refresh':
      return (
        <>
          <Path {...c} d="M20 12a8 8 0 1 1-2.5-5.8" />
          <Polyline {...c} points="20,3 20,7 16,7" fill="none" />
        </>
      );

    case 'send':
      return <Path {...c} d="M4 12 20 4l-4 16-4-6-8-2Z" />;

    case 'edit':
      return (
        <>
          <Path {...c} d="M4 20h4L19 9l-4-4L4 16v4Z" />
          <Line {...c} x1="14" y1="6" x2="18" y2="10" />
        </>
      );

    case 'wifi-off':
      return (
        <>
          <Path {...c} d="M5 12a10 10 0 0 1 5-2.7" />
          <Path {...c} d="M14 9.3A10 10 0 0 1 19 12" />
          <Path {...c} d="M8.5 15.5a6 6 0 0 1 7 0" />
          <Line {...c} x1="12" y1="19" x2="12" y2="19" stroke={color} />
          <Line {...c} x1="3" y1="3" x2="21" y2="21" />
        </>
      );

    case 'trash':
      return (
        <>
          <Path {...c} d="M5 7h14" />
          <Path {...c} d="M9 7V4h6v3" />
          <Path {...c} d="M6 7v13h12V7" />
        </>
      );

    case 'clock':
      return (
        <>
          <Circle {...c} cx="12" cy="12" r="9" />
          <Polyline {...c} points="12,7 12,12 15.5,14" fill="none" />
        </>
      );

    case 'info':
      return (
        <>
          <Circle {...c} cx="12" cy="12" r="9" />
          <Line {...c} x1="12" y1="11" x2="12" y2="16" />
          <Line {...c} x1="12" y1="8" x2="12" y2="8" />
        </>
      );

    case 'plus':
      return (
        <>
          <Line {...c} x1="12" y1="5" x2="12" y2="19" />
          <Line {...c} x1="5" y1="12" x2="19" y2="12" />
        </>
      );

    case 'settings':
      return (
        <>
          <Circle {...c} cx="12" cy="12" r="3" />
          <Path
            {...c}
            d="M12 2.5 13.5 5a7.5 7.5 0 0 1 2 .8L18 5l1.7 1.7-.8 2.4a7.5 7.5 0 0 1 .8 2l2.3 1.4v2.4l-2.3.9a7.5 7.5 0 0 1-.8 2l.8 2.4L18 22l-2.5-.8a7.5 7.5 0 0 1-2 .8L12 21.5l-1.5-2.5a7.5 7.5 0 0 1-2-.8L6 19l-1.7-1.7.8-2.4a7.5 7.5 0 0 1-.8-2L2 11.5V9.1l2.3-.9a7.5 7.5 0 0 1 .8-2L4.3 3.8 6 2.1l2.5.8a7.5 7.5 0 0 1 2-.8L12 2.5Z"
          />
        </>
      );

    case 'signal':
      return (
        <>
          <Line {...c} x1="5" y1="19" x2="5" y2="15" />
          <Line {...c} x1="10" y1="19" x2="10" y2="11" />
          <Line {...c} x1="15" y1="19" x2="15" y2="7" />
          <Line {...c} x1="20" y1="19" x2="20" y2="4" />
        </>
      );
  }
}
