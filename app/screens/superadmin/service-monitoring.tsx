import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

const takeFirst = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : undefined;
  if (value == null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
};

export default function SuperadminServiceMonitoringAliasRedirect() {
  const params = useLocalSearchParams();

  useEffect(() => {
    const normalized: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      const text = takeFirst(value);
      if (text) normalized[key] = text;
    });

    router.replace({
      pathname: '/screens/super-admin-system-monitoring' as `/${string}`,
      params: normalized,
    } as never);
  }, [params]);

  return null;
}
