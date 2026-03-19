import { Platform } from 'react-native';

/** Split pathname into dash-separated tokens for exact single-word matching (no substring false positives). */
function getTokens(pathname: string): string[] {
  return pathname.split('/').filter(Boolean).flatMap((s) => s.split('-'));
}

/** Split pathname into path segments (split by / only) for compound pattern matching. */
function getPathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

export function isAuthLikeRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  if (
    pathname.startsWith('/(auth)') ||
    pathname === '/' ||
    pathname.startsWith('/sign-in') ||
    pathname.startsWith('/landing')
  ) {
    return true;
  }
  // Compound patterns — match full path segments
  const pathSegments = getPathSegments(pathname);
  if (
    pathSegments.includes('auth-callback') ||
    pathSegments.includes('reset-password') ||
    pathSegments.includes('profiles-gate')
  ) {
    return true;
  }
  // Single-word patterns — match tokens to avoid substring false positives
  const tokens = getTokens(pathname);
  return tokens.includes('onboarding') || tokens.includes('verify');
}

const EDUCATIONAL_KEYWORDS = [
  'learning',
  'lesson',
  'lessons',
  'homework',
  'worksheet',
  'quiz',
  'practice',
  'study',
  'dash-assistant',
  'dash-orb',
  'dash-ai',
  'tutor',
  'progress',
  'grades',
  'attendance',
  'report',
  'reports',
  'activity',
  'activities',
  'live-classes',
  'reading',
  'math',
  'science',
];

const NON_EDUCATIONAL_KEYWORDS = [
  'settings',
  'account',
  'profile',
  'payments',
  'billing',
  'subscription',
  'membership',
  'messages',
  'chat',
  'calendar',
  'birthday',
  'announcements',
  'notifications',
  'support',
  'help',
  'calls',
  'call',
  'invite',
  'invites',
  'uniform',
  'fees',
  'donation',
  'admin',
  'principal',
  'teacher',
  'parent',
];

/** Match keyword against route: compound keywords (containing '-') match path segments; single words match tokens. */
function matchesKeyword(keyword: string, pathSegments: string[], tokens: string[]): boolean {
  return keyword.includes('-')
    ? pathSegments.includes(keyword)
    : tokens.includes(keyword);
}

export function isEducationalRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const pathSegments = getPathSegments(pathname);
  const tokens = getTokens(pathname);
  return EDUCATIONAL_KEYWORDS.some((kw) => matchesKeyword(kw, pathSegments, tokens));
}

export function isNonEducationalRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (isAuthLikeRoute(pathname)) return false;
  if (isEducationalRoute(pathname)) return false;
  const pathSegments = getPathSegments(pathname);
  const tokens = getTokens(pathname);
  return NON_EDUCATIONAL_KEYWORDS.some((kw) => matchesKeyword(kw, pathSegments, tokens));
}

export function isWebPlatform(): boolean {
  return Platform.OS === 'web';
}
