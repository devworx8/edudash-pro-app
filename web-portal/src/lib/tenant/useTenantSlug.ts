"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface TenantSlugResult {
  slug: string;
  name?: string;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function useTenantSlug(userId: string | undefined): TenantSlugResult {
  const [slug, setSlug] = useState<string>("");
  const [name, setName] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const supabase = createClient();

      // Get preschool_id from profiles (organization columns don't exist)
      const { data: prof } = await supabase
        .from("profiles")
        .select("preschool_id, organization_id")
        .eq("id", userId)
        .maybeSingle();

      // Get preschool ID from profile
      const preschoolId = prof?.preschool_id || prof?.organization_id as string | undefined;

      if (preschoolId) {
        const { data: school } = await supabase
          .from("preschools")
          .select("name")
          .eq("id", preschoolId)
          .maybeSingle();

        const schoolName = school?.name;
        const schoolSlug = schoolName ? slugify(schoolName) : "";
        if (schoolSlug) {
          setSlug(schoolSlug);
          setName(schoolName);
          return;
        }
      }

      // As last resort, fall back to email domain-like placeholder (stable but non-empty)
      if (!slug) {
        setSlug("");
      }
    } catch (err) {
      console.error("Failed to resolve tenant slug:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [userId, slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { slug, name, loading, error, refetch: load };
}