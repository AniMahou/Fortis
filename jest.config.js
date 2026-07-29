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
  /**
   * Coverage is measured over the hardware-independent core only.
   *
   * Everything excluded below either imports React Native or talks to a radio,
   * a sensor or MMKV — none of which exist in a test runner. Including them
   * would produce a lower headline number that says nothing useful, and
   * "covering" them would mean asserting against mocks, which measures the
   * mock rather than the code.
   *
   * Those files are deliberately thin for exactly this reason: every decision
   * they might have made lives in a module listed here. What is left of them
   * is verified by the manual checklists in each module's TESTING.md.
   */
  collectCoverageFrom: [
    'src/mesh/**/*.ts',
    'src/crypto/**/*.ts',
    'src/storage/**/*.ts',
    'src/state/meshModel.ts',
    'src/state/pin.ts',
    'src/config/schema.ts',
    'src/geo/**/*.ts',
    'src/screens/real/onboarding/nickname.ts',
    '!src/**/__tests__/**',
    '!src/**/*.d.ts',
    // Native radio bindings and the RN-only wiring.
    '!src/mesh/bleTransport.ts',
    '!src/mesh/wifiTransport.ts',
    '!src/mesh/createTransport.ts',
    '!src/storage/mmkvBackend.ts',
    '!src/storage/index.ts',
  ],
};
