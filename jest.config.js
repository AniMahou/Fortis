/**
 * One test project, running in plain Node with no React Native shims at all.
 *
 * That is the point rather than a limitation: mesh, crypto, storage, state and
 * geo are written free of RN imports so they can be proven correct on a laptop,
 * long before a phone is involved. If a test here ever needs an RN mock,
 * something has leaked into a layer that should not have it.
 *
 * There are deliberately no component tests — see src/mesh/TESTING.md
 * "Component tests" for why, and for what replaced them.
 *
 * No ts-jest either: CONTEXT.md risk #8 was a ts-jest/TypeScript version
 * mismatch, and transforming with Babel removes that failure mode rather than
 * working around it. Type checking is a separate step: `npm run typecheck`.
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
        '<rootDir>/src/geo/__tests__/**/*.test.ts',
        '<rootDir>/server/__tests__/**/*.test.js',
      ],
      transform: {
        '^.+\\.(js|ts|tsx)$': ['babel-jest', {configFile: './babel.config.js'}],
      },
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
