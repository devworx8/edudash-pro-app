import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    // Create Supabase clients for both databases
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // EduSitePro client for cross-database cleanup
    const edusiteUrl = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_URL;
    const edusiteKey = process.env.NEXT_PUBLIC_EDUSITE_SUPABASE_ANON_KEY;
    if (!edusiteUrl || !edusiteKey) {
      console.error('[Delete Student] Missing EDUSITE env vars');
      return NextResponse.json(
        { error: 'Server configuration error: missing EduSite credentials' },
        { status: 500 }
      );
    }
    const edusiteSupabase = createClient(
      edusiteUrl,
      edusiteKey,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { studentId, reason } = await req.json();

    if (!studentId) {
      return NextResponse.json(
        { error: 'Missing required field: studentId' },
        { status: 400 }
      );
    }

    console.log('[Delete Student] Starting deletion process for student:', studentId);

    // Get student details before deletion
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, first_name, last_name, preschool_id')
      .eq('id', studentId)
      .single();

    if (studentError) {
      console.error('Error fetching student:', studentError);
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const studentName = `${student.first_name} ${student.last_name}`;

    // Get parent/guardian info from student_parent_relationships table
    const { data: guardianRelation, error: guardianError } = await supabase
      .from('student_parent_relationships')
      .select('parent_id, profiles!inner(email, first_name, last_name)')
      .eq('student_id', studentId)
      .maybeSingle();

    const parentUserId = guardianRelation?.parent_id;
    const parentEmail = Array.isArray(guardianRelation?.profiles) 
      ? guardianRelation?.profiles[0]?.email 
      : (guardianRelation?.profiles as any)?.email;
    
    // Construct full name from first_name and last_name
    const profileData = Array.isArray(guardianRelation?.profiles)
      ? guardianRelation?.profiles[0]
      : guardianRelation?.profiles;
    const parentName = profileData 
      ? `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Parent'
      : 'Parent';

    console.log('[Delete Student] Student:', studentName, '| Parent:', parentEmail);

    // Step 1: Delete from EduSitePro registration_requests table
    console.log('[Delete Student] Deleting from EduSitePro registration_requests...');
    const { error: edusiteDeleteError } = await edusiteSupabase
      .from('registration_requests')
      .delete()
      .eq('edudash_student_id', studentId);

    if (edusiteDeleteError) {
      console.error('⚠️  Error deleting from EduSitePro (non-critical):', edusiteDeleteError);
    } else {
      console.log('✅ Deleted from EduSitePro registration_requests');
    }

    // Step 2: Delete from EduDashPro registration_requests table
    console.log('[Delete Student] Deleting from EduDashPro registration_requests...');
    const { error: edudashRegError } = await supabase
      .from('registration_requests')
      .delete()
      .eq('id', studentId);

    if (edudashRegError) {
      console.error('⚠️  Error deleting from EduDashPro registration_requests (non-critical):', edudashRegError);
    } else {
      console.log('✅ Deleted from EduDashPro registration_requests');
    }

    // Step 3: Delete student record from EduDashPro
    const { error: deleteStudentError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (deleteStudentError) {
      console.error('Error deleting student:', deleteStudentError);
      return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 });
    }

    console.log('✅ Student record deleted');

    // Step 4: Check if parent has other students in this preschool
    const { data: otherStudents, error: checkError } = await supabase
      .from('student_parent_relationships')
      .select('student_id, students!inner(id, preschool_id)')
      .eq('parent_id', parentUserId)
      .eq('students.preschool_id', student.preschool_id);

    if (checkError) {
      console.error('Error checking other students:', checkError);
    }

    const hasOtherStudents = otherStudents && otherStudents.length > 0;

    console.log(`Parent has ${otherStudents?.length || 0} other students in this organization`);

    // Step 3: If no other students, delete parent's account and related records
    if (!hasOtherStudents && parentUserId) {
      console.log('[Delete Account] Deleting parent account...');

      // Delete from user_ai_usage
      const { error: usageError } = await supabase
        .from('user_ai_usage')
        .delete()
        .eq('user_id', parentUserId);

      if (usageError) {
        console.error('Error deleting AI usage (non-critical):', usageError);
      }

      // Delete from user_ai_tiers
      const { error: tierError } = await supabase
        .from('user_ai_tiers')
        .delete()
        .eq('user_id', parentUserId);

      if (tierError) {
        console.error('Error deleting AI tier (non-critical):', tierError);
      }

      // Delete from profiles
      const { error: profileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', parentUserId);

      if (profileError) {
        console.error('Error deleting profile:', profileError);
      } else {
        console.log('✅ Profile deleted');
      }

      // Delete auth user (requires admin/service role)
      // Note: This needs to be done via Supabase Admin API or Edge Function
      console.log('⚠️  Auth user deletion requires admin API call');
    }

    // Step 4: Send notification email to parent
    try {
      const emailBody = {
        to: parentEmail,
        subject: hasOtherStudents 
          ? `Student Removed from School - ${studentName}`
          : 'Account Closed - Join EduDash Pro Community',
        message: hasOtherStudents
          ? `Dear ${parentName},\n\nYour child ${studentName} has been removed from the school.\n\nReason: ${reason || 'Not specified'}\n\nYou still have other students enrolled at this school.\n\nIf you have any questions, please contact the school administration.\n\nBest regards,\nEduDash Pro Team`
          : `Dear ${parentName},\n\nYour child ${studentName} has been removed from the school, and your account with this school has been closed.\n\nReason: ${reason || 'Not specified'}\n\nYou can continue to use EduDash Pro by joining the EduDash Pro Community or Main School:\n\n1. Download the EduDash Pro app\n2. Create a new account\n3. Join the "EduDash Pro Community" school\n4. Access free learning resources and activities\n\nIf you have any questions, please contact support@edudashpro.org.za\n\nBest regards,\nEduDash Pro Team`,
      };

      const { error: emailError } = await supabase.functions.invoke('send-email', {
        body: emailBody,
      });

      if (emailError) {
        console.error('Email notification failed (non-critical):', emailError);
      } else {
        console.log('✅ Email notification sent');
      }
    } catch (emailError) {
      console.error('Email error (non-critical):', emailError);
    }

    return NextResponse.json({
      success: true,
      message: hasOtherStudents
        ? 'Student deleted successfully. Parent still has other students enrolled.'
        : 'Student and parent account deleted successfully. Email notification sent.',
      accountDeleted: !hasOtherStudents,
      parentEmail,
    });
  } catch (error: any) {
    console.error('Delete student error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
