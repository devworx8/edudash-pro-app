import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  try {
    // Create Supabase client with service role for server-side operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { registrationId, verified } = await req.json();

    if (!registrationId || typeof verified !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: registrationId, verified' },
        { status: 400 }
      );
    }

    console.log(`[Verify Payment] ${verified ? 'Verifying' : 'Unverifying'} payment for registration:`, registrationId);

    // Update payment verification status in registration_requests table
    // When verifying, also set registration_fee_paid to true
    const updateData: any = {
      payment_verified: verified,
      payment_date: verified ? new Date().toISOString() : null,
    };
    
    if (verified) {
      updateData.registration_fee_paid = true;
    }

    const { data: regData, error: regError } = await supabase
      .from('registration_requests')
      .update(updateData)
      .eq('id', registrationId)
      .select();

    if (regError) {
      console.error('Error verifying payment in registration_requests:', regError);
      return NextResponse.json({ error: regError.message }, { status: 500 });
    }

    if (!regData || regData.length === 0) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 });
    }

    console.log('✅ Updated registration_requests table');

    // Also update in students table if student exists
    // Find student by matching guardian email and student name
    const registration = regData[0];
    if (registration) {
      const studentUpdateData: any = {
        payment_verified: verified,
        payment_date: verified ? new Date().toISOString() : null,
      };
      
      if (verified) {
        studentUpdateData.registration_fee_paid = true;
      }

      // Use preschool_id (the correct column name in students table)
      // organization_id from registration maps to preschool_id in students
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .update(studentUpdateData)
        .eq('preschool_id', registration.organization_id)
        .ilike('first_name', registration.student_first_name)
        .ilike('last_name', registration.student_last_name)
        .select();

      if (studentError) {
        console.error('Error updating students table (non-critical):', studentError);
        // Don't fail the request if student doesn't exist yet
      } else if (studentData && studentData.length > 0) {
        console.log('✅ Updated students table for', studentData.length, 'matching student(s)');
      }
    }

    return NextResponse.json({ 
      success: true, 
      data: registration,
      message: verified ? 'Payment verified successfully' : 'Payment verification removed'
    });
  } catch (error: any) {
    console.error('Verify payment error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
