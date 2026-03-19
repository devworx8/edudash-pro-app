/**
 * sensitiveFieldGuard — Prevents voice dictation in security-sensitive contexts.
 *
 * Defines a registry of field types/names that should block or warn when
 * the user attempts voice input. Password fields, OTP inputs, and secret
 * tokens should never accept dictated text.
 *
 * Usage:
 *   if (isSensitiveField(fieldProps)) {
 *     // Show warning or block voice input
 *   }
 *
 * @module lib/voice/sensitiveFieldGuard
 */

/** Field context passed from the focused TextInput or form field. */
export interface FieldContext {
  /** React Native TextInput secureTextEntry flag */
  secureTextEntry?: boolean;
  /** TextInput textContentType (iOS) or autoComplete (Android) */
  textContentType?: string;
  autoComplete?: string;
  /** Custom field name / identifier from the form */
  fieldName?: string;
  /** Accessible label */
  accessibilityLabel?: string;
}

/** Set of autoComplete / textContentType values that indicate sensitive input. */
const SENSITIVE_CONTENT_TYPES = new Set([
  'password',
  'newPassword',
  'oneTimeCode',
  'creditCardNumber',
  'creditCardExpiration',
  'creditCardSecurityCode',
]);

/** Patterns in field names that suggest sensitive input. */
const SENSITIVE_NAME_PATTERNS = [
  /password/i,
  /passcode/i,
  /pin\b/i,
  /\botp\b/i,
  /secret/i,
  /token/i,
  /\bcsv\b/i,
  /\bcvv\b/i,
  /credit.?card/i,
  /api.?key/i,
  /private.?key/i,
];

/**
 * Determine whether a field is sensitive and should block voice input.
 *
 * Returns a reason string if sensitive, or null if safe for voice.
 */
export function isSensitiveField(context: FieldContext): string | null {
  // Direct secure flag — most reliable signal
  if (context.secureTextEntry) {
    return 'secure_text_entry';
  }

  // iOS textContentType
  if (context.textContentType && SENSITIVE_CONTENT_TYPES.has(context.textContentType)) {
    return `content_type:${context.textContentType}`;
  }

  // Android autoComplete
  if (context.autoComplete && SENSITIVE_CONTENT_TYPES.has(context.autoComplete)) {
    return `auto_complete:${context.autoComplete}`;
  }

  // Field name heuristics
  const fieldName = context.fieldName || context.accessibilityLabel || '';
  for (const pattern of SENSITIVE_NAME_PATTERNS) {
    if (pattern.test(fieldName)) {
      return `field_name:${fieldName}`;
    }
  }

  return null;
}

/**
 * Get a user-friendly warning message when voice input is blocked.
 */
export function getSensitiveFieldWarning(reason: string): string {
  if (reason.startsWith('secure_text_entry') || reason.includes('password')) {
    return 'Voice input is disabled for password fields for your security.';
  }
  if (reason.includes('oneTimeCode') || reason.includes('otp')) {
    return 'Voice input is disabled for verification codes.';
  }
  if (reason.includes('credit') || reason.includes('cvv') || reason.includes('csv')) {
    return 'Voice input is disabled for payment fields.';
  }
  return 'Voice input is disabled for this sensitive field.';
}
