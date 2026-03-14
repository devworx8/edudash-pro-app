/**
 * Generate Weekly Report Edge Function
 * Generates AI-powered weekly learning reports for parents
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth gate: verify JWT and ensure caller has access to the student
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const authSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: authError } = await authSupabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { studentId, weekStart, weekEnd } = await req.json()

    if (!studentId || !weekStart || !weekEnd) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[generate-weekly-report] Generating for student ${studentId}, week ${weekStart} to ${weekEnd}`)

    // Get student info
    const { data: student } = await supabase
      .from('students')
      .select('id, first_name, last_name, date_of_birth, grade, parent_id, preschool_id')
      .eq('id', studentId)
      .single()

    if (!student) {
      return new Response(
        JSON.stringify({ error: 'Student not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify caller is the student's parent or a teacher/principal at their school
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('id, role, preschool_id')
      .eq('auth_user_id', user!.id)
      .single()

    const isParent = callerProfile?.id === student.parent_id
    const isSchoolStaff = callerProfile?.preschool_id && callerProfile.preschool_id === student.preschool_id &&
      (callerProfile.role === 'teacher' || callerProfile.role === 'principal')

    if (!isParent && !isSchoolStaff) {
      return new Response(
        JSON.stringify({ error: 'You do not have access to this student' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get activities for the week
    const { data: activities } = await supabase
      .from('student_activity_feed')
      .select('*')
      .eq('student_id', studentId)
      .gte('activity_at', weekStart)
      .lte('activity_at', weekEnd)
      .order('activity_at', { ascending: true })

    // Count activity types
    const activityBreakdown: Record<string, number> = {}
    activities?.forEach((a: any) => {
      const type = a.activity_type || 'other'
      activityBreakdown[type] = (activityBreakdown[type] || 0) + 1
    })

    // Generate AI report using Claude
    const startTime = Date.now()
    const systemPrompt = `You are an experienced early childhood educator creating weekly progress reports for parents.

Generate warm, encouraging, and specific reports. Return ONLY a JSON object (no markdown):
{
  "highlights": ["3-5 specific achievements"],
  "focusAreas": ["2-3 areas for growth"],
  "homeActivities": ["3-4 age-appropriate activities"],
  "moodSummary": "Brief description",
  "progressMetrics": {
    "socialSkills": 1-5,
    "academicProgress": 1-5,
    "participation": 1-5,
    "behavior": 1-5
  }
}`

    const userPrompt = `Generate a weekly report for:
- Student: ${student.first_name} ${student.last_name}
- Week: ${weekStart} to ${weekEnd}
- Activities this week: ${Object.entries(activityBreakdown).map(([k, v]) => `${k}: ${v}`).join(', ')}

Generate the report JSON now:`

    const modelName = Deno.env.get('ANTHROPIC_MODEL') || 'claude-haiku-4-5-20251001';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!response.ok) {
      throw new Error(`AI generation failed: ${response.status}`)
    }

    const result = await response.json()
    const aiData = JSON.parse(result.content[0].text.trim())
    const duration = Date.now() - startTime

    const reportData = {
      highlights: aiData.highlights || [],
      focusAreas: aiData.focusAreas || [],
      attendanceSummary: { daysPresent: 5, daysAbsent: 0, totalDays: 5, attendanceRate: 100 },
      homeworkCompletion: 100,
      teacherNotes: [],
      homeActivities: aiData.homeActivities || [],
      moodSummary: aiData.moodSummary || 'Positive',
      progressMetrics: aiData.progressMetrics || { socialSkills: 4, academicProgress: 4, participation: 4, behavior: 4 },
      activityBreakdown,
    }

    // Save report
    const { data: report, error } = await supabase
      .from('weekly_learning_reports')
      .upsert({
        student_id: studentId,
        parent_id: student.parent_id,
        preschool_id: student.preschool_id,
        week_start: weekStart,
        week_end: weekEnd,
        report_data: reportData,
        ai_model: modelName,
        generation_duration_ms: duration,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, reportId: report.id, duration }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('[generate-weekly-report] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
