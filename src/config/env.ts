/**
 * The single place react-native-config is imported.
 *
 * Everything else in the app imports `config` from here, which keeps the rest
 * of the codebase testable in plain Node — the same reason `mesh/` and
 * `crypto/` have no React Native imports either.
 */

import Config from 'react-native-config';
import {parseConfig, type VoxConfig} from './schema';

const result = parseConfig(Config as Record<string, string | undefined>);

// Warnings are always surfaced, even when debugLogs is off: a typo in .env
// silently changing how the mesh behaves is exactly the kind of thing that
// wastes an afternoon of debugging on demo day.
if (result.warnings.length > 0) {
  console.warn(
    `[vox] .env problems (using defaults for these):\n  ` +
      result.warnings.join('\n  '),
  );
}

export const config: VoxConfig = result.config;

export type {VoxConfig, TransportKind} from './schema';
