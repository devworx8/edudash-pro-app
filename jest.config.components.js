/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/components', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}', '**/tests/**/*.test.{ts,tsx}'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|@sentry/.*|native-base|react-native-svg|@tanstack/.*)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.components.js'],
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    '!components/**/*.d.ts',
    '!components/**/__tests__/**',
  ],
  coverageDirectory: 'coverage/components',
  coverageReporters: ['text', 'lcov'],
};
