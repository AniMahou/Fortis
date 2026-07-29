/**
 * Two test projects, deliberately separated.
 *
 * `logic` runs in a plain Node environment with no React Native shims at all.
 * That is the point: mesh/crypto/storage/state are written to be free of RN
 * imports so they can be proven correct on a laptop, long before a phone is
 * involved. If a logic test ever needs an RN mock, something has leaked into
 * a layer that should not have it.
 *
 * `native` runs anything that does touch React Native (the thin transport
 * bindings and screens) under the react-native preset.
 *
 * Note there is no ts-jest here — CONTEXT.md risk #8 was a ts-jest/TypeScript
 * version mismatch. Both projects transform TypeScript with Babel instead,
 * which removes that failure mode entirely. Type checking is a separate step:
 * `npm run typecheck`.
 */

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'logic',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/src/mesh/__tests__/**/*.test.ts',
        '<rootDir>/src/crypto/__tests__/**/*.test.ts',
        '<rootDir>/src/storage/__tests__/**/*.test.ts',
        '<rootDir>/src/state/__tests__/**/*.test.ts',
        '<rootDir>/src/config/__tests__/**/*.test.ts',
        '<rootDir>/server/__tests__/**/*.test.js',
      ],
      transform: {
        '^.+\\.(js|ts|tsx)$': ['babel-jest', {configFile: './babel.config.js'}],
      },
    },
    {
      displayName: 'native',
      preset: 'react-native',
      testMatch: ['<rootDir>/src/**/__nativetests__/**/*.test.tsx'],
      setupFiles: ['<rootDir>/jest.setup.js'],
      transformIgnorePatterns: [
        'node_modules/(?!(@react-native|react-native|react-native-.*|@react-navigation)/)',
      ],
    },
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
    // Thin native bindings are excluded from coverage on purpose: there is no
    // radio, no GPS and no MMKV inside a test runner, so any "coverage" here
    // would only be measuring how much of a mock we executed. These are
    // covered by the manual checklists in each module's TESTING.md instead.
    '!src/mesh/bleTransport.ts',
    '!src/mesh/nativeMesh.ts',
    '!src/storage/mmkvBackend.ts',
  ],
};
