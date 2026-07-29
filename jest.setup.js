/* eslint-env jest */
/**
 * Mocks for the `native` jest project only. The `logic` project runs with no
 * setup file at all — see the comment at the top of jest.config.js for why
 * that separation matters.
 */

jest.mock('react-native-config', () => ({__esModule: true, default: {}}));

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    constructor() {
      this.store = new Map();
    }
    getString(k) {
      return this.store.has(k) ? this.store.get(k) : undefined;
    }
    set(k, v) {
      this.store.set(k, v);
    }
    delete(k) {
      this.store.delete(k);
    }
    clearAll() {
      this.store.clear();
    }
    getAllKeys() {
      return [...this.store.keys()];
    }
    contains(k) {
      return this.store.has(k);
    }
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const inset = {top: 0, right: 0, bottom: 0, left: 0};
  return {
    SafeAreaProvider: ({children}) => children,
    SafeAreaView: ({children}) => children,
    useSafeAreaInsets: () => inset,
  };
});
