-- Year Plan Input: Notification triggers
-- Sends notifications when:
-- 1. A new input window is opened (notify all teachers in the school)
-- 2. A submission is reviewed (notify the submitting teacher)

-- ── Trigger: Notify teachers when a new window is created ───
CREATE OR REPLACE FUNCTION public.notify_teachers_input_window_opened()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  teacher_record RECORD;
BEGIN
  -- Only fire on INSERT when window is active
  IF NEW.is_active = TRUE THEN
    FOR teacher_record IN
      SELECT p.id AS user_id
      FROM public.profiles p
      WHERE COALESCE(p.organization_id, p.preschool_id) = NEW.preschool_id
        AND p.role = 'teacher'
    LOOP
      INSERT INTO public.notifications (user_id, title, message, type, action_url, metadata)
      VALUES (
        teacher_record.user_id,
        'Planning Input Window Open',
        'Your principal wants your input: ' || NEW.title || '. Tap to contribute your ideas.',
        'announcement',
        '/screens/teacher-year-plan-input',
        jsonb_build_object(
          'window_id', NEW.id,
          'window_title', NEW.title,
          'closes_at', NEW.closes_at
        )
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_teachers_input_window_opened
  AFTER INSERT ON public.year_plan_input_windows
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_teachers_input_window_opened();

-- ── Trigger: Notify teacher when their submission is reviewed ──
CREATE OR REPLACE FUNCTION public.notify_teacher_submission_reviewed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  status_label TEXT;
BEGIN
  -- Only fire when status changes from pending/under_review to a reviewed state
  IF OLD.status IN ('pending', 'under_review')
     AND NEW.status IN ('approved', 'modified', 'declined')
  THEN
    CASE NEW.status
      WHEN 'approved' THEN status_label := 'approved';
      WHEN 'modified' THEN status_label := 'approved with modifications';
      WHEN 'declined' THEN status_label := 'declined';
    END CASE;

    INSERT INTO public.notifications (user_id, title, message, type, action_url, metadata)
    VALUES (
      NEW.submitted_by,
      'Submission ' || INITCAP(NEW.status),
      'Your suggestion "' || NEW.title || '" has been ' || status_label || '.'
        || CASE WHEN NEW.principal_notes IS NOT NULL AND NEW.principal_notes != ''
             THEN ' Feedback: ' || LEFT(NEW.principal_notes, 100)
             ELSE ''
           END,
      'announcement',
      '/screens/teacher-year-plan-input',
      jsonb_build_object(
        'submission_id', NEW.id,
        'status', NEW.status,
        'title', NEW.title
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_teacher_submission_reviewed
  AFTER UPDATE ON public.year_plan_teacher_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_teacher_submission_reviewed();
