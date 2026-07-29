module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['node_modules/', 'android/', 'coverage/', 'docs/design/'],
  rules: {
    // VOX packs packets into ~20-byte BLE advertisement frames, so bitwise
    // operations are the subject matter, not a code smell. See mesh/wire.ts.
    'no-bitwise': 'off',
    // `void promise` is used deliberately for genuinely fire-and-forget work
    // (starting the mesh, refreshing a GPS fix). It reads as "this is not
    // awaited on purpose", which is more informative than a bare call.
    'no-void': 'off',
  },
  overrides: [
    {
      // React Navigation's documented API takes render callbacks for tab icons
      // and labels. The components they return are defined at module level;
      // the rule flags the callback itself, which is the required shape.
      files: ['src/navigation/**/*.tsx'],
      rules: {'react/no-unstable-nested-components': 'off'},
    },
    {
      // The Plan B hub is plain Node, not React Native.
      files: ['server/**/*.js'],
      env: {node: true, jest: true},
      rules: {'no-undef': 'off'},
    },
  ],
};
