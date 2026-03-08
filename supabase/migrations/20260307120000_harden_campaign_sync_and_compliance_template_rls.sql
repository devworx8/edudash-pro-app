-- Harden campaign sync requests and isolate school-specific compliance templates.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.sync_campaign_to_edusite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  request_id int;
  payload jsonb;
  payload_text text;
  headers jsonb := jsonb_build_object('Content-Type', 'application/json');
  sync_secret text := nullif(current_setting('app.settings.edusite_sync_shared_secret', true), '');
  signed_at text;
  signature text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    payload := jsonb_build_object(
      'operation', TG_OP,
      'old_record', row_to_json(OLD)
    );
  ELSE
    payload := jsonb_build_object(
      'operation', TG_OP,
      'record', row_to_json(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
    );
  END IF;

  payload_text := payload::text;

  IF sync_secret IS NOT NULL THEN
    signed_at := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint::text;
    signature := encode(
      extensions.digest(payload_text || ':' || signed_at || ':' || sync_secret, 'sha256'),
      'hex'
    );
    headers := headers || jsonb_build_object(
      'x-edudash-sync-timestamp', signed_at,
      'x-edudash-sync-signature', signature
    );
  END IF;

  SELECT INTO request_id net.http_post(
    url := 'https://lvvvjywrmpcqrpvuptdi.supabase.co/functions/v1/sync-campaign-to-edusite',
    headers := headers,
    body := payload
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[Campaign Sync] Failed to sync: %', SQLERRM;
    RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP POLICY IF EXISTS compliance_tpl_principal_all ON public.compliance_checklist_templates;
CREATE POLICY compliance_tpl_principal_all
ON public.compliance_checklist_templates
FOR ALL
USING (
  compliance_checklist_templates.preschool_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role IN ('principal', 'admin', 'principal_admin', 'super_admin', 'superadmin')
      AND p.preschool_id = compliance_checklist_templates.preschool_id
  )
)
WITH CHECK (
  compliance_checklist_templates.preschool_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role IN ('principal', 'admin', 'principal_admin', 'super_admin', 'superadmin')
      AND p.preschool_id = compliance_checklist_templates.preschool_id
  )
);

DROP POLICY IF EXISTS compliance_tpl_teacher_select ON public.compliance_checklist_templates;
CREATE POLICY compliance_tpl_teacher_select
ON public.compliance_checklist_templates
FOR SELECT
USING (
  compliance_checklist_templates.preschool_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = auth.uid()
      AND p.role = 'teacher'
      AND p.preschool_id = compliance_checklist_templates.preschool_id
  )
);
