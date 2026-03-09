// Process Aftercare Enrollment
// Automatically creates student and parent accounts when aftercare registration is enrolled
// Sends welcome email with password reset link

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderEduDashProEmail } from '../_shared/edudashproEmail.ts';
import { buildWebUrl } from '../_shared/urls.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = 'EduDash Pro <support@edudashpro.org.za>';
const SUPPORT_EMAIL = 'support@edudashpro.org.za';
const WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/FQVPXqY6daRLIonPjQqZTv';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Generate welcome email HTML with password setup link
 */
function generateWelcomeEmailHTML(
  parentName: string,
  childName: string,
  passwordResetLink: string,
  email: string
): string {
  const bodyHtml = `
<p>Hi ${parentName},</p>
<p>Great news! <strong>${childName}</strong> has been enrolled in the EduDash Pro Community School aftercare program.</p>
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:12px;margin:14px 0;">
  <p style="margin:0;color:#0369a1;font-weight:600;">Your account email: ${email}</p>
</div>
<p>Use the button below to set your password and access the parent portal.</p>
<p><strong>What you can do:</strong></p>
<ul style="margin:0 0 0 18px;padding:0;color:#475569;">
  <li>View attendance and daily updates</li>
  <li>Receive important announcements</li>
  <li>Message teachers and staff</li>
  <li>Track payments and invoices</li>
  <li>Update emergency contacts</li>
</ul>
<p>Join the WhatsApp community for updates and reminders.</p>
<p><strong>Do you have a Gmail address?</strong> Reply to this email so we can add you to Google Play testing for early app access.</p>
  `.trim();

  return renderEduDashProEmail({
    title: `${childName} is enrolled`,
    subtitle: 'Welcome to EduDash Pro Aftercare',
    preheader: 'Set your password to access your dashboard',
    bodyHtml,
    cta: { label: 'Set my password', url: passwordResetLink },
    secondaryCta: { label: 'Join WhatsApp Group', url: WHATSAPP_GROUP_LINK },
    supportEmail: SUPPORT_EMAIL,
  });
}

/**
 * Send welcome email via Resend API
 */
async function sendWelcomeEmail(
  email: string,
  parentName: string,
  childName: string,
  passwordResetLink: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    console.warn('[process-aftercare-enrollment] RESEND_API_KEY not configured');
    return { success: false, error: 'Email service not configured' };
  }

  try {
    const subject = `🎓 Welcome to EduDash Pro - ${childName} is Enrolled!`;
    const emailHtml = generateWelcomeEmailHTML(parentName, childName, passwordResetLink, email);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: subject,
        html: emailHtml,
        reply_to: SUPPORT_EMAIL,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[process-aftercare-enrollment] Resend API error:', errorText);
      return { success: false, error: errorText };
    }

    const result = await response.json();
    console.log('[process-aftercare-enrollment] Welcome email sent:', result.id);
    return { success: true, messageId: result.id };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[process-aftercare-enrollment] Error sending email:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

interface AftercareRegistration {
  id: string;
  preschool_id: string;
  parent_user_id: string | null;
  parent_email: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone: string;
  child_first_name: string;
  child_last_name: string;
  child_grade: string;
  child_date_of_birth: string | null;
  child_allergies: string | null;
  child_medical_conditions: string | null;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  status: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { registration_id, registration_data } = await req.json();

    if (!registration_id && !registration_data) {
      return new Response(
        JSON.stringify({ error: 'registration_id or registration_data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch registration if only ID provided
    let registration: AftercareRegistration;
    if (registration_data) {
      registration = registration_data;
    } else {
      const { data, error } = await supabase
        .from('aftercare_registrations')
        .select('*')
        .eq('id', registration_id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({ error: 'Registration not found', details: error }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      registration = data;
    }

    // Only process if status is 'enrolled' - accounts are created ONLY on enrollment
    // 'paid' status means payment verified but not yet enrolled
    if (registration.status !== 'enrolled') {
      return new Response(
        JSON.stringify({ 
          message: 'Registration status is not enrolled, skipping account creation',
          note: 'Accounts are only created when principal clicks "Enroll Student"'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let parentUserId = registration.parent_user_id;
    let parentAccountCreated = false;

    // Step 1: Check if parent account exists
    if (!parentUserId) {
      // Check by email
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('email', registration.parent_email.toLowerCase())
        .maybeSingle();

      if (existingProfile) {
        parentUserId = existingProfile.id;
      } else {
        // Create parent account
        // Generate a random password (parent will need to reset it)
        const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12) + 'A1!';
        
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: registration.parent_email.toLowerCase(),
          password: tempPassword,
          email_confirm: true, // Auto-confirm email
          user_metadata: {
            first_name: registration.parent_first_name,
            last_name: registration.parent_last_name,
            phone: registration.parent_phone,
          },
        });

        if (authError || !authData.user) {
          console.error('Error creating parent account:', authError);
          return new Response(
            JSON.stringify({ 
              error: 'Failed to create parent account', 
              details: authError?.message 
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        parentUserId = authData.user.id;
        parentAccountCreated = true;

        // Send password reset email so parent can set their own password
        // Since we created them with a temporary password, they need to reset it
        try {
          const { error: resetError } = await supabase.auth.admin.generateLink({
            type: 'recovery',
            email: registration.parent_email.toLowerCase(),
            options: {
              redirectTo: buildWebUrl('/auth/callback?type=password-reset'),
            },
          });
          if (resetError) {
            console.warn('Failed to generate password reset link:', resetError);
            // Don't throw - account creation should still succeed even if email fails
          }
        } catch (emailError) {
          console.warn('Error generating password reset link:', emailError);
          // Don't throw - account creation should still succeed
        }

        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: parentUserId,
            email: registration.parent_email.toLowerCase(),
            first_name: registration.parent_first_name,
            last_name: registration.parent_last_name,
            phone: registration.parent_phone,
            role: 'parent',
            preschool_id: registration.preschool_id,
            organization_id: registration.preschool_id,
          });

        if (profileError) {
          console.error('Error creating parent profile:', profileError);
          // Continue anyway - profile might be created by trigger
        }
      }
    }

    // Step 2: Check if student already exists
    const { data: existingStudent } = await supabase
      .from('students')
      .select('id, parent_id')
      .eq('first_name', registration.child_first_name.trim())
      .eq('last_name', registration.child_last_name.trim())
      .eq('preschool_id', registration.preschool_id)
      .maybeSingle();

    let studentId: string;
    let studentCreated = false;

    if (existingStudent) {
      studentId = existingStudent.id;
      // Link to parent if not already linked
      if (existingStudent.parent_id !== parentUserId) {
        await supabase
          .from('students')
          .update({
            parent_id: parentUserId,
            guardian_id: parentUserId,
          })
          .eq('id', studentId);
      }
    } else {
      // Create student record
      const { data: newStudent, error: studentError } = await supabase
        .from('students')
        .insert({
          first_name: registration.child_first_name.trim(),
          last_name: registration.child_last_name.trim(),
          date_of_birth: registration.child_date_of_birth || null,
          grade: registration.child_grade,
          parent_id: parentUserId,
          guardian_id: parentUserId,
          preschool_id: registration.preschool_id,
          emergency_contact_name: registration.emergency_contact_name,
          emergency_contact_phone: registration.emergency_contact_phone,
          emergency_contact_relation: registration.emergency_contact_relation,
          allergies: registration.child_allergies || null,
          medical_conditions: registration.child_medical_conditions || null,
          is_active: true,
          status: 'active',
          enrollment_date: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (studentError || !newStudent) {
        console.error('Error creating student:', studentError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create student record', 
            details: studentError?.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      studentId = newStudent.id;
      studentCreated = true;
    }

    // Step 3: Update registration with enrolled_at timestamp
    await supabase
      .from('aftercare_registrations')
      .update({
        enrolled_at: new Date().toISOString(),
        parent_user_id: parentUserId, // Ensure parent_user_id is set
      })
      .eq('id', registration.id);

    // Step 4: Send welcome email with password reset link
    let welcomeEmailSent = false;
    let welcomeEmailId: string | undefined;
    
    if (parentAccountCreated) {
      // Generate password reset link for new account
      try {
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'recovery',
          email: registration.parent_email.toLowerCase(),
          options: {
            redirectTo: buildWebUrl('/auth/callback?type=password-reset&redirect=/dashboard/parent'),
          },
        });

        if (linkError) {
          console.warn('[process-aftercare-enrollment] Failed to generate reset link:', linkError);
        } else if (linkData?.properties?.action_link) {
          // Send branded welcome email with password reset link
          const emailResult = await sendWelcomeEmail(
            registration.parent_email.toLowerCase(),
            registration.parent_first_name,
            `${registration.child_first_name} ${registration.child_last_name}`,
            linkData.properties.action_link
          );
          
          welcomeEmailSent = emailResult.success;
          welcomeEmailId = emailResult.messageId;
          
          if (emailResult.success) {
            console.log(`[process-aftercare-enrollment] ✅ Welcome email sent to ${registration.parent_email}`);
          } else {
            console.warn(`[process-aftercare-enrollment] ⚠️ Welcome email failed: ${emailResult.error}`);
          }
        }
      } catch (emailError) {
        console.warn('[process-aftercare-enrollment] Error sending welcome email:', emailError);
        // Don't throw - enrollment should still succeed even if email fails
      }
    } else {
      // Existing user - send a simpler enrollment notification
      try {
        const emailResult = await sendWelcomeEmail(
          registration.parent_email.toLowerCase(),
          registration.parent_first_name,
          `${registration.child_first_name} ${registration.child_last_name}`,
          buildWebUrl('/dashboard/parent') // Just link to dashboard for existing users
        );
        welcomeEmailSent = emailResult.success;
        welcomeEmailId = emailResult.messageId;
      } catch (emailError) {
        console.warn('[process-aftercare-enrollment] Error sending notification email:', emailError);
      }
    }

    // Log email to database
    if (welcomeEmailSent && welcomeEmailId) {
      try {
        await supabase.from('email_logs').insert({
          recipient: registration.parent_email,
          subject: `Welcome to EduDash Pro - ${registration.child_first_name} is Enrolled!`,
          status: 'sent',
          message_id: welcomeEmailId,
          metadata: {
            type: 'aftercare_enrollment_welcome',
            registration_id: registration.id,
            child_name: `${registration.child_first_name} ${registration.child_last_name}`,
            parent_account_created: parentAccountCreated,
          },
        });
      } catch (logErr) {
        console.warn('[process-aftercare-enrollment] Could not log email:', logErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Enrollment processed successfully',
        data: {
          parent_user_id: parentUserId,
          parent_account_created: parentAccountCreated,
          student_id: studentId,
          student_created: studentCreated,
          welcome_email_sent: welcomeEmailSent,
          welcome_email_id: welcomeEmailId,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing enrollment:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
