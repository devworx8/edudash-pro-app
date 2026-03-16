/**
 * Detects the NextGen teacher dashboard theme variant.
 * Centralises the hex comparison so it doesn't litter component files.
 */
export const isNextGenTheme = (theme: { background?: string } | null | undefined): boolean =>
  String(theme?.background || '').toLowerCase() === '#0f121e';
