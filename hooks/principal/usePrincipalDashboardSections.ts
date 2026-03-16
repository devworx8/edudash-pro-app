import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ALL_PRINCIPAL_SECTION_IDS,
  getDefaultCollapsedSections,
  getUrgentExpandedSectionIds,
  isPrincipalSectionId,
  type PrincipalSectionId,
  type PrincipalSectionResolverInput,
} from '@/components/dashboard/principal/sectionTypes';

let AsyncStorage: any = null;
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // AsyncStorage can be unavailable in some runtime contexts.
}

const STORAGE_VERSION = 1;
const STORAGE_PREFIX = '@principal_dashboard_sections:v1';

interface StoredPrincipalSections {
  version: number;
  collapsed: string[];
}

const setsEqual = <T extends string>(a: Set<T>, b: Set<T>): boolean => {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

const sanitizeCollapsedSections = (values: string[]): Set<PrincipalSectionId> => {
  const next = new Set<PrincipalSectionId>();
  for (const value of values) {
    if (isPrincipalSectionId(value)) {
      next.add(value);
    }
  }
  return next;
};

interface UsePrincipalDashboardSectionsParams extends PrincipalSectionResolverInput {
  userId?: string | null;
  orgId?: string | null;
}

export function usePrincipalDashboardSections({
  userId,
  orgId,
  pendingRegistrations,
  pendingPayments,
  pendingPOPs,
  pendingApprovals,
}: UsePrincipalDashboardSectionsParams) {
  const resolverInput = useMemo<PrincipalSectionResolverInput>(
    () => ({
      pendingRegistrations,
      pendingPayments,
      pendingPOPs,
      pendingApprovals,
    }),
    [pendingApprovals, pendingPOPs, pendingPayments, pendingRegistrations]
  );

  const urgentExpandedSections = useMemo(
    () => getUrgentExpandedSectionIds(resolverInput),
    [resolverInput]
  );

  const defaultCollapsedSections = useMemo(
    () => getDefaultCollapsedSections(resolverInput),
    [resolverInput]
  );

  const storageKey = useMemo(() => {
    if (!userId || !orgId) return null;
    return `${STORAGE_PREFIX}:${userId}:${orgId}`;
  }, [orgId, userId]);

  const [collapsedSections, setCollapsedSections] = useState<Set<PrincipalSectionId>>(
    () => defaultCollapsedSections
  );
  const [isHydrated, setIsHydrated] = useState(false);

  const applyUrgentOpenOverrides = useCallback(
    (collapsed: Set<PrincipalSectionId>): Set<PrincipalSectionId> => {
      const next = new Set(collapsed);
      urgentExpandedSections.forEach((sectionId) => {
        next.delete(sectionId);
      });
      return next;
    },
    [urgentExpandedSections]
  );

  useEffect(() => {
    let isCancelled = false;

    const hydrateCollapsedSections = async () => {
      const fallback = applyUrgentOpenOverrides(defaultCollapsedSections);

      if (!storageKey || !AsyncStorage) {
        if (!isCancelled) { setCollapsedSections(fallback); setIsHydrated(true); }
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) { if (!isCancelled) setCollapsedSections(fallback); return; }

        const parsed = JSON.parse(raw) as StoredPrincipalSections;
        if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.collapsed)) {
          if (!isCancelled) setCollapsedSections(fallback);
          return;
        }

        const restored = sanitizeCollapsedSections(parsed.collapsed);
        if (!isCancelled) setCollapsedSections(applyUrgentOpenOverrides(restored));
      } catch {
        if (!isCancelled) setCollapsedSections(fallback);
      } finally {
        if (!isCancelled) setIsHydrated(true);
      }
    };

    hydrateCollapsedSections();

    return () => {
      isCancelled = true;
    };
  }, [applyUrgentOpenOverrides, defaultCollapsedSections, storageKey]);

  useEffect(() => {
    if (!isHydrated) return;
    setCollapsedSections((prev) => {
      const next = applyUrgentOpenOverrides(prev);
      return setsEqual(prev, next) ? prev : next;
    });
  }, [applyUrgentOpenOverrides, isHydrated]);

  useEffect(() => {
    if (!isHydrated || !storageKey || !AsyncStorage) return;

    const payload: StoredPrincipalSections = {
      version: STORAGE_VERSION,
      collapsed: Array.from(collapsedSections),
    };

    AsyncStorage.setItem(storageKey, JSON.stringify(payload)).catch(() => {
      // Non-blocking persistence.
    });
  }, [collapsedSections, isHydrated, storageKey]);

  const toggleSection = useCallback(
    (sectionId: PrincipalSectionId, explicitCollapsed?: boolean) => {
      setCollapsedSections((prev) => {
        const shouldCollapse =
          typeof explicitCollapsed === 'boolean'
            ? explicitCollapsed
            : !prev.has(sectionId);

        const next = new Set(prev);
        if (shouldCollapse) {
          next.add(sectionId);
        } else {
          next.delete(sectionId);
        }
        return next;
      });
    },
    []
  );

  const expandAll = useCallback(() => {
    setCollapsedSections(new Set<PrincipalSectionId>());
  }, []);

  const collapseAll = useCallback(() => {
    const collapsed = new Set<PrincipalSectionId>(ALL_PRINCIPAL_SECTION_IDS);
    urgentExpandedSections.forEach((sectionId) => {
      collapsed.delete(sectionId);
    });
    setCollapsedSections(collapsed);
  }, [urgentExpandedSections]);

  return {
    collapsedSections,
    toggleSection,
    expandAll,
    collapseAll,
    isHydrated,
  };
}

