/**
 * Jest setup file for global test configuration
 */


// Expo global flag
global.__DEV__ = true;

// Mock expo-constants (ESM module that Jest can't transform)
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      name: 'EduDashPro',
      slug: 'edudashpro',
      version: '1.0.0',
      extra: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-anon-key',
      },
    },
    appOwnership: 'standalone',
    executionEnvironment: 'storeClient',
    manifest: null,
    manifest2: null,
    easConfig: null,
  },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => {
  const mock = {
    setItem: jest.fn(() => Promise.resolve()),
    getItem: jest.fn(() => Promise.resolve(null)),
    removeItem: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    multiGet: jest.fn(() => Promise.resolve([])),
    multiSet: jest.fn(() => Promise.resolve()),
    multiRemove: jest.fn(() => Promise.resolve()),
  };
  return {
    __esModule: true,
    default: mock,
    ...mock,
  };
});

// Mock expo-audio (ESM module that Jest can't transform)
jest.mock('expo-audio', () => ({
  __esModule: true,
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
    setAudioModeAsync: jest.fn(async () => undefined),
    getAvailableInputsAsync: jest.fn(async () => []),
    getAvailableOutputsAsync: jest.fn(async () => []),
  },
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}));

// Mock expo-speech (ESM module that Jest can't transform)
jest.mock('expo-speech', () => ({
  __esModule: true,
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(async () => false),
  getAvailableVoicesAsync: jest.fn(async () => []),
}));

// Mock expo-file-system legacy entry (ESM module that Jest can't transform)
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file://',
  cacheDirectory: 'file://',
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 0 })),
  readAsStringAsync: jest.fn(async () => ''),
  writeAsStringAsync: jest.fn(async () => undefined),
  deleteAsync: jest.fn(async () => undefined),
}));

// Mock expo-router (JSX in node_modules that Jest can't transform)
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    __esModule: true,
    router: {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      canDismiss: jest.fn(() => false),
      dismissAll: jest.fn(),
    },
    usePathname: jest.fn(() => '/'),
    useLocalSearchParams: jest.fn(() => ({})),
    useSegments: jest.fn(() => []),
    Link: ({ children }) => React.createElement(React.Fragment, null, children),
    Stack: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});

// Mock @sentry/react-native (ESM module that Jest can't transform)
jest.mock('@sentry/react-native', () => ({
  __esModule: true,
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setContext: jest.fn(),
  setUser: jest.fn(),
  Native: {
    addBreadcrumb: jest.fn(),
    setUser: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setContext: jest.fn(),
  },
  Browser: {
    addBreadcrumb: jest.fn(),
    setUser: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
  },
}));

// Mock posthog-react-native (avoids native svg/gesture deps in Jest)
jest.mock('posthog-react-native', () => {
  const PostHog = function PostHog() {
    return {
      capture: jest.fn(),
      identify: jest.fn(),
      reset: jest.fn(),
    };
  };
  return {
    __esModule: true,
    default: PostHog,
  };
});

// Suppress console errors/warnings in tests unless needed
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
