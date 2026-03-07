function envFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  const lowered = value.toLowerCase();
  if (['0', 'false', 'off', 'no', 'disabled'].includes(lowered)) return false;
  if (['1', 'true', 'on', 'yes', 'enabled'].includes(lowered)) return true;
  return defaultValue;
}

export function isWeeklyMenuBridgeEnabled(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_WEEKLY_MENU_BRIDGE_ENABLED, true);
}

export function isWeeklyMenuDedicatedEnabled(): boolean {
  return envFlag(process.env.NEXT_PUBLIC_WEEKLY_MENU_DEDICATED_ENABLED, false);
}
