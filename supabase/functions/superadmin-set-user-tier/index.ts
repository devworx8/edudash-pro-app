/// <reference path="../../../types/deno-std.d.ts" />
// Supabase Edge Function: superadmin-set-user-tier
// Allows superadmins to set a user's subscription tier and sync metadata.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SetUserTierRequest = {
  target_user_id?: string;
  user_id?: string;
  email?: string;
  subscription_tier?: string;
  tier?: string;
};

const VALID_TIERS = new Set([
  "free",
  "trial",
  "parent_starter",
  "parent_plus",
  "teacher_starter",
  "teacher_pro",
  "learner_starter",
  "learner_pro",
  "school_starter",
  "school_premium",
  "school_pro",
  "school_enterprise",
]);

const LEGACY_TIER_MAP: Record<string, string> = {
  starter: "parent_starter",
  basic: "parent_starter",
  premium: "parent_plus",
  pro: "school_pro",
  enterprise: "school_enterprise",
  "parent-starter": "parent_starter",
  "parent-plus": "parent_plus",
  "teacher-starter": "teacher_starter",
  "teacher-pro": "teacher_pro",
  "learner-starter": "learner_starter",
  "learner-pro": "learner_pro",
  "school-starter": "school_starter",
  "school-premium": "school_premium",
  "school-pro": "school_pro",
  "school-enterprise": "school_enterprise",
};

function normalizeTier(tier: string): string {
  const normalized = tier.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  return LEGACY_TIER_MAP[normalized] || normalized;
}

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[superadmin-set-user-tier] Missing Supabase env vars");
    return jsonResponse(500, { success: false, error: "Supabase configuration missing" });
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader) {
    return jsonResponse(401, { success: false, error: "Unauthorized" });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    console.error("[superadmin-set-user-tier] Auth error:", authError);
    return jsonResponse(401, { success: false, error: "Unauthorized" });
  }

  const actorId = authData.user.id;

  const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role")
    .or(`id.eq.${actorId},auth_user_id.eq.${actorId}`)
    .maybeSingle();

  if (actorProfileError || !actorProfile) {
    console.error("[superadmin-set-user-tier] Profile error:", actorProfileError);
    return jsonResponse(403, { success: false, error: "Profile not found" });
  }

  const role = (actorProfile.role || "").toLowerCase();
  if (role !== "super_admin" && role !== "superadmin") {
    return jsonResponse(403, { success: false, error: "Insufficient permissions" });
  }

  let body: SetUserTierRequest;
  try {
    body = await req.json();
  } catch (parseError) {
    console.error("[superadmin-set-user-tier] Invalid JSON:", parseError);
    return jsonResponse(400, { success: false, error: "Invalid JSON payload" });
  }

  const targetUserId = body.target_user_id || body.user_id || null;
  const targetEmail = body.email || null;
  const tierInput = body.subscription_tier || body.tier || null;

  if (!tierInput) {
    return jsonResponse(400, { success: false, error: "Missing subscription_tier" });
  }

  const normalizedTier = normalizeTier(tierInput);
  if (!VALID_TIERS.has(normalizedTier)) {
    return jsonResponse(400, { success: false, error: `Invalid tier: ${tierInput}` });
  }

  let resolvedUserId = targetUserId;
  let resolvedEmail = targetEmail;

  if (!resolvedUserId && targetEmail) {
    const { data: emailLookup, error: emailError } = await supabaseAdmin
      .schema("auth")
      .from("users")
      .select("id, email")
      .eq("email", targetEmail)
      .maybeSingle();
    if (emailError || !emailLookup?.id) {
      console.error("[superadmin-set-user-tier] User lookup failed:", emailError);
      return jsonResponse(404, { success: false, error: "User not found" });
    }
    resolvedUserId = emailLookup.id;
    resolvedEmail = emailLookup.email || targetEmail;
  }

  if (!resolvedUserId) {
    return jsonResponse(400, { success: false, error: "Missing target_user_id or email" });
  }

  const { data: targetUserData } = await supabaseAdmin.auth.admin.getUserById(resolvedUserId);
  const existingMetadata = targetUserData?.user?.user_metadata || {};
  if (!resolvedEmail && targetUserData?.user?.email) {
    resolvedEmail = targetUserData.user.email;
  }

  const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(resolvedUserId, {
    user_metadata: {
      ...existingMetadata,
      subscription_tier: normalizedTier,
      subscription_tier_updated_at: new Date().toISOString(),
      subscription_tier_updated_by: actorId,
      subscription_tier_updated_by_email: actorProfile.email || null,
    },
  });

  if (updateAuthError) {
    console.error("[superadmin-set-user-tier] Auth update error:", updateAuthError);
    return jsonResponse(500, { success: false, error: "Failed to update user metadata" });
  }

  try {
    await supabaseAdmin
      .from("profiles")
      .update({ subscription_tier: normalizedTier })
      .or(`id.eq.${resolvedUserId},auth_user_id.eq.${resolvedUserId}`);
  } catch (error) {
    console.warn("[superadmin-set-user-tier] Failed to update profiles table:", error);
  }

  // Best-effort update custom users table if present
  try {
    await supabaseAdmin
      .from("users")
      .update({ subscription_tier: normalizedTier })
      .or(`id.eq.${resolvedUserId},auth_user_id.eq.${resolvedUserId}`);
  } catch (error) {
    console.warn("[superadmin-set-user-tier] Failed to update users table:", error);
  }

  // Best-effort: log superadmin action
  try {
    await supabaseAdmin.from("superadmin_user_actions").insert({
      action: "user_updated",
      admin_id: actorId,
      admin_user_id: actorId,
      description: `Subscription tier set to ${normalizedTier}`,
      target_user_id: resolvedUserId,
      resource_id: resolvedUserId,
      resource_type: "auth_user",
    });
  } catch (error) {
    console.warn("[superadmin-set-user-tier] Failed to log action:", error);
  }

  return jsonResponse(200, {
    success: true,
    user_id: resolvedUserId,
    email: resolvedEmail,
    subscription_tier: normalizedTier,
  });
});
