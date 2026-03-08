-- =============================================================
-- K-12 Game Engine — EduDash Arena
-- Tables: k12_game_assignments, k12_game_sessions, k12_student_xp
-- =============================================================

-- ── 1. Assignments (teacher → class) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.k12_game_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         text        NOT NULL,
  class_id        uuid        NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  difficulty      text        NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')) DEFAULT 'medium',
  due_date        timestamptz,
  is_challenge    boolean     NOT NULL DEFAULT false,
  show_leaderboard boolean    NOT NULL DEFAULT true,
  max_attempts    int         NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  status          text        NOT NULL CHECK (status IN ('active', 'closed', 'archived')) DEFAULT 'active',
  assigned_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS k12_game_assignments_class_idx    ON public.k12_game_assignments (class_id);
CREATE INDEX IF NOT EXISTS k12_game_assignments_teacher_idx  ON public.k12_game_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS k12_game_assignments_status_idx   ON public.k12_game_assignments (status);

ALTER TABLE public.k12_game_assignments ENABLE ROW LEVEL SECURITY;

-- Teachers can manage their own assignments
CREATE POLICY "teacher_manage_own_assignments"
  ON public.k12_game_assignments
  FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Students can view active assignments for classes they belong to
CREATE POLICY "student_view_class_assignments"
  ON public.k12_game_assignments
  FOR SELECT
  USING (
    status = 'active'
    AND class_id IN (
      SELECT class_id FROM public.class_students WHERE student_id = auth.uid()
    )
  );

-- ── 2. Game Sessions (student results) ───────────────────────

CREATE TABLE IF NOT EXISTS public.k12_game_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       uuid REFERENCES public.k12_game_assignments(id) ON DELETE SET NULL,
  student_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_id             text        NOT NULL,
  score               int         NOT NULL DEFAULT 0 CHECK (score >= 0),
  max_score           int         NOT NULL DEFAULT 0 CHECK (max_score >= 0),
  correct_answers     int         NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  total_questions     int         NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
  time_spent_seconds  int         NOT NULL DEFAULT 0 CHECK (time_spent_seconds >= 0),
  stars               int         NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 3),
  xp_earned          int         NOT NULL DEFAULT 0 CHECK (xp_earned >= 0),
  completed_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS k12_sessions_student_idx     ON public.k12_game_sessions (student_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS k12_sessions_assignment_idx  ON public.k12_game_sessions (assignment_id);
CREATE INDEX IF NOT EXISTS k12_sessions_game_idx        ON public.k12_game_sessions (game_id);

ALTER TABLE public.k12_game_sessions ENABLE ROW LEVEL SECURITY;

-- Students insert and read their own sessions
CREATE POLICY "student_own_sessions"
  ON public.k12_game_sessions
  FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Teachers read sessions for students in their classes
CREATE POLICY "teacher_read_class_sessions"
  ON public.k12_game_sessions
  FOR SELECT
  USING (
    student_id IN (
      SELECT cs.student_id
      FROM public.class_students cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.teacher_id = auth.uid()
         OR c.id IN (
           SELECT class_id FROM public.k12_game_assignments WHERE teacher_id = auth.uid()
         )
    )
  );

-- Students can read leaderboard peers (assignment sessions, show_leaderboard = true)
CREATE POLICY "student_read_leaderboard_sessions"
  ON public.k12_game_sessions
  FOR SELECT
  USING (
    assignment_id IS NOT NULL
    AND assignment_id IN (
      SELECT a.id
      FROM public.k12_game_assignments a
      JOIN public.class_students cs ON cs.class_id = a.class_id
      WHERE cs.student_id = auth.uid()
        AND a.show_leaderboard = true
        AND a.status = 'active'
    )
  );

-- ── 3. Student XP / Level / Streak ───────────────────────────

CREATE TABLE IF NOT EXISTS public.k12_student_xp (
  student_id       uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_xp         int         NOT NULL DEFAULT 0 CHECK (total_xp >= 0),
  level            int         NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  current_streak   int         NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak   int         NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_played_at   timestamptz,
  subject_xp       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.k12_student_xp ENABLE ROW LEVEL SECURITY;

-- Students manage their own XP row
CREATE POLICY "student_own_xp"
  ON public.k12_student_xp
  FOR ALL
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

-- Students can read classmates' XP for leaderboards
CREATE POLICY "student_read_classmate_xp"
  ON public.k12_student_xp
  FOR SELECT
  USING (
    student_id IN (
      SELECT cs2.student_id
      FROM public.class_students cs1
      JOIN public.class_students cs2 ON cs2.class_id = cs1.class_id
      WHERE cs1.student_id = auth.uid()
    )
  );

-- Teachers can read XP for students in their classes
CREATE POLICY "teacher_read_class_xp"
  ON public.k12_student_xp
  FOR SELECT
  USING (
    student_id IN (
      SELECT cs.student_id
      FROM public.class_students cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.teacher_id = auth.uid()
    )
  );

-- ── 4. RPC: upsert_student_xp ────────────────────────────────
-- Called by client after each game session to accumulate XP safely.

CREATE OR REPLACE FUNCTION public.upsert_student_xp(
  p_student_id  uuid,
  p_xp_earned   int,
  p_subject     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_xp        int;
  v_new_level       int;
  v_last_played     timestamptz;
  v_current_streak  int;
  v_longest_streak  int;
  v_today           date := CURRENT_DATE;
BEGIN
  -- Only the calling student may update their own XP
  IF p_student_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Upsert the row
  INSERT INTO public.k12_student_xp (student_id, total_xp, subject_xp, last_played_at)
  VALUES (
    p_student_id,
    GREATEST(0, p_xp_earned),
    jsonb_build_object(p_subject, GREATEST(0, p_xp_earned)),
    now()
  )
  ON CONFLICT (student_id) DO UPDATE
    SET total_xp   = k12_student_xp.total_xp + GREATEST(0, p_xp_earned),
        subject_xp = jsonb_set(
          k12_student_xp.subject_xp,
          ARRAY[p_subject],
          to_jsonb(COALESCE((k12_student_xp.subject_xp ->> p_subject)::int, 0) + GREATEST(0, p_xp_earned))
        ),
        last_played_at = now(),
        updated_at     = now()
  RETURNING total_xp, current_streak, longest_streak, last_played_at
  INTO v_total_xp, v_current_streak, v_longest_streak, v_last_played;

  -- Recompute level
  v_new_level := CASE
    WHEN v_total_xp <    200 THEN 1
    WHEN v_total_xp <    500 THEN 2
    WHEN v_total_xp <   1000 THEN 3
    WHEN v_total_xp <   2000 THEN 4
    WHEN v_total_xp <   4000 THEN 5
    WHEN v_total_xp <   7000 THEN 6
    WHEN v_total_xp <  11000 THEN 7
    WHEN v_total_xp <  16000 THEN 8
    WHEN v_total_xp <  22000 THEN 9
    ELSE 10
  END;

  -- Streak: increment if last play was yesterday, reset if gap > 1 day
  IF v_last_played IS NULL OR v_last_played::date < v_today - INTERVAL '1 day' THEN
    v_current_streak := 1;
  ELSIF v_last_played::date = v_today - INTERVAL '1 day' THEN
    v_current_streak := v_current_streak + 1;
  END IF;
  -- else already played today — streak stays

  v_longest_streak := GREATEST(v_longest_streak, v_current_streak);

  UPDATE public.k12_student_xp
  SET level          = v_new_level,
      current_streak = v_current_streak,
      longest_streak = v_longest_streak
  WHERE student_id = p_student_id;
END;
$$;

-- ── 5. Attempt guard ─────────────────────────────────────────
-- Returns how many attempts a student has used for an assignment.

CREATE OR REPLACE FUNCTION public.k12_attempts_used(
  p_assignment_id uuid,
  p_student_id    uuid
)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.k12_game_sessions
  WHERE assignment_id = p_assignment_id
    AND student_id    = p_student_id;
$$;

-- ── 6. Grants ─────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.upsert_student_xp(uuid, int, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.k12_attempts_used(uuid, uuid)          TO authenticated;
