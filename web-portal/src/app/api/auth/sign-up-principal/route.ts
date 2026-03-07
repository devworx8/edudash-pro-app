import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/auth/sign-up-principal
 * 
 * Handle organization admin sign-up with organization + campus creation
 * Uses service role to bypass RLS during initial setup
 * 
 * Creates:
 * 1. User account (auth.users)
 * 2. Organization (organizations table)
 * 3. First campus/preschool (preschools table)
 * 4. User profile (profiles table)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      // Personal info
      email,
      password,
      fullName,
      phoneNumber,
      
      // Organization info
      organizationName,
      organizationSlug,
      planTier,
      billingEmail,
      
      // Organization address
      addressLine1,
      addressLine2,
      city,
      province,
      postalCode,
      country,
      
      // Campus info
      campusName,
      campusCode,
      campusAddress,
      campusCapacity,
    } = body;

    // Validation
    if (!email || !password || !fullName || !phoneNumber) {
      return NextResponse.json(
        { error: 'Personal information is incomplete' },
        { status: 400 }
      );
    }

    if (!organizationName || !organizationSlug || !billingEmail) {
      return NextResponse.json(
        { error: 'Organization information is incomplete' },
        { status: 400 }
      );
    }

    if (!addressLine1 || !city || !province || !postalCode) {
      return NextResponse.json(
        { error: 'Organization address is incomplete' },
        { status: 400 }
      );
    }

    if (!campusName) {
      return NextResponse.json(
        { error: 'Campus name is required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(organizationSlug)) {
      return NextResponse.json(
        { error: 'Organization slug can only contain lowercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    // Validate campus code format if provided
    if (campusCode && !/^[A-Z0-9-]+$/.test(campusCode)) {
      return NextResponse.json(
        { error: 'Campus code must be uppercase letters, numbers, and hyphens' },
        { status: 400 }
      );
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    console.log('[Sign-up Principal] Starting organization creation...');

    // 1. Create the user account
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Require email verification
      user_metadata: {
        full_name: fullName,
        role: 'principal',
      },
    });

    if (authError) {
      console.error('[Sign-up Principal] Auth error:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    console.log('[Sign-up Principal] User created:', authData.user.id);

    // 2. Create the organization
    const { data: organizationData, error: organizationError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: organizationName,
        slug: organizationSlug,
        plan_tier: planTier || 'solo',
        max_centres: planTier === 'solo' ? 1 : planTier === 'group_5' ? 5 : planTier === 'group_10' ? 10 : 999,
        primary_contact_name: fullName,
        primary_contact_email: email,
        primary_contact_phone: phoneNumber,
        billing_email: billingEmail,
        address_line1: addressLine1,
        address_line2: addressLine2 || null,
        city,
        province,
        postal_code: postalCode,
        country: country || 'ZA',
        subscription_status: 'trialing', // Start with trial
        trial_end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7-day trial
        status: 'active',
      })
      .select()
      .single();

    if (organizationError) {
      console.error('[Sign-up Principal] Organization creation error:', organizationError);
      // Cleanup: delete the user if organization creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      
      if (organizationError.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'Organization slug already exists. Please choose a different one.' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: `Failed to create organization: ${organizationError.message}` },
        { status: 500 }
      );
    }

    console.log('[Sign-up Principal] Organization created:', organizationData.id);

    // 3. Create the first campus/preschool
    const { data: preschoolData, error: preschoolError } = await supabaseAdmin
      .from('preschools')
      .insert({
        organization_id: organizationData.id,
        name: campusName,
        campus_code: campusCode || null,
        address: campusAddress || addressLine1, // Default to org address if not specified
        principal_id: authData.user.id,
        capacity: campusCapacity || 200,
        current_enrollment: 0,
        active: true,
      })
      .select()
      .single();

    if (preschoolError) {
      console.error('[Sign-up Principal] Preschool creation error:', preschoolError);
      // Cleanup: delete organization and user
      await supabaseAdmin.from('organizations').delete().eq('id', organizationData.id);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      
      if (preschoolError.code === '23505') { // Unique constraint violation
        return NextResponse.json(
          { error: 'Campus code already exists. Please choose a different one.' },
          { status: 409 }
        );
      }
      
      return NextResponse.json(
        { error: `Failed to create campus: ${preschoolError.message}` },
        { status: 500 }
      );
    }

    console.log('[Sign-up Principal] Preschool created:', preschoolData.id);

    // 4. Update the user's profile with role and preschool
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'principal',
        full_name: fullName,
        phone_number: phoneNumber,
        preschool_id: preschoolData.id,
      })
      .eq('id', authData.user.id);

    if (profileError) {
      console.error('[Sign-up Principal] Profile update error:', profileError);
      // Cleanup: delete preschool, organization, and user
      await supabaseAdmin.from('preschools').delete().eq('id', preschoolData.id);
      await supabaseAdmin.from('organizations').delete().eq('id', organizationData.id);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: `Failed to update profile: ${profileError.message}` },
        { status: 500 }
      );
    }

    console.log('[Sign-up Principal] Profile updated successfully');

    // 5. Send email verification (optional, Supabase does this by default if enabled)
    // You can customize the email template in Supabase dashboard

    return NextResponse.json(
      {
        success: true,
        message: 'Organization and account created successfully',
        data: {
          userId: authData.user.id,
          email: authData.user.email,
          organizationId: organizationData.id,
          organizationName: organizationData.name,
          organizationSlug: organizationData.slug,
          preschoolId: preschoolData.id,
          campusName: preschoolData.name,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[Sign-up Principal] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
