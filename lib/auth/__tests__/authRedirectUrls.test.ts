/**
 * Tests for forgot-password and email-change redirect URL helpers.
 * Ensures correct redirects for web vs native and that landing/auth-callback
 * paths are used as expected.
 */
import {
  getPasswordResetRedirectUrl,
  getEmailChangeRedirectUrl,
} from '@/lib/auth/authRedirectUrls';

describe('getPasswordResetRedirectUrl', () => {
  it('returns auth-callback?type=recovery for web with origin', () => {
    expect(getPasswordResetRedirectUrl('web', 'https://app.example.com')).toBe(
      'https://app.example.com/auth-callback?type=recovery'
    );
  });

  it('returns custom scheme for native (iOS)', () => {
    expect(getPasswordResetRedirectUrl('ios')).toBe(
      'edudashpro://auth-callback?type=recovery'
    );
  });

  it('returns custom scheme for native (Android)', () => {
    expect(getPasswordResetRedirectUrl('android')).toBe(
      'edudashpro://auth-callback?type=recovery'
    );
  });

  it('returns native scheme when web has no origin', () => {
    expect(getPasswordResetRedirectUrl('web')).toBe(
      'edudashpro://auth-callback?type=recovery'
    );
  });
});

describe('getEmailChangeRedirectUrl', () => {
  it('returns landing?flow=email-change for web with origin', () => {
    expect(getEmailChangeRedirectUrl('web', 'https://app.example.com')).toBe(
      'https://app.example.com/landing?flow=email-change'
    );
  });

  it('returns production landing URL for native (iOS)', () => {
    expect(getEmailChangeRedirectUrl('ios')).toBe(
      'https://www.edudashpro.org.za/landing?flow=email-change'
    );
  });

  it('returns production landing URL for native (Android)', () => {
    expect(getEmailChangeRedirectUrl('android')).toBe(
      'https://www.edudashpro.org.za/landing?flow=email-change'
    );
  });

  it('returns production URL when web has no origin', () => {
    expect(getEmailChangeRedirectUrl('web')).toBe(
      'https://www.edudashpro.org.za/landing?flow=email-change'
    );
  });
});
