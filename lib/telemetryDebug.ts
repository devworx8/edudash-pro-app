import * as Sentry from '@sentry/react-native';
import { getPostHog } from '@/lib/posthogClient';

export function testSentry() {
  try {
    Sentry.captureMessage('Test event from device', { level: 'info' as any });
    // Also capture an example exception
    Sentry.captureException(new Error('Sentry test exception'));
  } catch {
    // no-op
  }
}

export function testPostHog() {
  try {
    getPostHog()?.capture('test_event', { source: 'device', ts: Date.now() });
  } catch {
    // no-op
  }
}

