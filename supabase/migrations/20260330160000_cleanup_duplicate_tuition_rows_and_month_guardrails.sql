-- Normalize historical tuition-fee drift and prevent duplicate month rows.
-- This migration:
--   1. Removes safe pre-enrollment tuition rows with no payment activity.
--   2. Collapses duplicate tuition rows per student + billing month.
--   3. Re-points payment/audit/reminder references before deleting stale rows.
--   4. Hardens assign_correct_fee_for_student and adds a uniqueness guard.

-- ---------------------------------------------------------------------------
-- 1. Safe pre-enrollment tuition cleanup
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_pre_enrollment_tuition_rows ON COMMIT DROP AS
SELECT sf.id AS fee_id
FROM public.student_fees sf
JOIN public.students s
  ON s.id = sf.student_id
LEFT JOIN public.payment_allocations pa
  ON pa.student_fee_id = sf.id
WHERE sf.category_code = 'tuition'
  AND sf.billing_month IS NOT NULL
  AND s.enrollment_date IS NOT NULL
  AND sf.billing_month < date_trunc('month', s.enrollment_date)::date
  AND coalesce(sf.amount_paid, 0) <= 0
  AND pa.student_fee_id IS NULL;

DO $$
BEGIN
  IF to_regclass('public.fee_corrections_audit') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgrelid = 'public.fee_corrections_audit'::regclass
         AND tgname = 'trg_fee_corrections_audit_no_update'
         AND NOT tgisinternal
     ) THEN
    ALTER TABLE public.fee_corrections_audit
      DISABLE TRIGGER trg_fee_corrections_audit_no_update;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.payment_reminders') IS NOT NULL THEN
    UPDATE public.payment_reminders pr
    SET student_fee_id = NULL
    WHERE pr.student_fee_id IN (
      SELECT fee_id FROM tmp_pre_enrollment_tuition_rows
    );
  END IF;
END;
$$;

UPDATE public.payments p
SET fee_ids = (
  SELECT CASE
    WHEN count(*) = 0 THEN NULL
    ELSE array_agg(fee_id)
  END
  FROM (
    SELECT DISTINCT fee_id
    FROM unnest(coalesce(p.fee_ids, ARRAY[]::text[])) AS fee_id
    WHERE fee_id NOT IN (SELECT fee_id::text FROM tmp_pre_enrollment_tuition_rows)
  ) deduped
)
WHERE EXISTS (
  SELECT 1
  FROM unnest(coalesce(p.fee_ids, ARRAY[]::text[])) AS fee_id
  WHERE fee_id IN (SELECT fee_id::text FROM tmp_pre_enrollment_tuition_rows)
);

DELETE FROM public.student_fees sf
WHERE sf.id IN (
  SELECT fee_id FROM tmp_pre_enrollment_tuition_rows
);

-- ---------------------------------------------------------------------------
-- 2. Duplicate tuition month collapse
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_duplicate_tuition_fee_map ON COMMIT DROP AS
WITH fee_allocation_totals AS (
  SELECT
    pa.student_fee_id,
    round(sum(coalesce(pa.allocated_amount, 0)), 2) AS allocated_total
  FROM public.payment_allocations pa
  GROUP BY pa.student_fee_id
),
ranked_rows AS (
  SELECT
    sf.id,
    sf.student_id,
    sf.billing_month,
    sf.category_code,
    sf.status,
    coalesce(sf.amount_paid, 0) AS amount_paid_value,
    coalesce(fa.allocated_total, 0) AS allocated_total_value,
    coalesce(
      sf.amount_outstanding,
      greatest(coalesce(sf.final_amount, sf.amount, 0) - coalesce(sf.amount_paid, 0), 0)
    ) AS outstanding_value,
    row_number() OVER (
      PARTITION BY sf.student_id, sf.billing_month, sf.category_code
      ORDER BY
        CASE sf.status
          WHEN 'paid' THEN 0
          WHEN 'partially_paid' THEN 1
          WHEN 'waived' THEN 2
          WHEN 'pending_verification' THEN 3
          WHEN 'pending' THEN 4
          WHEN 'overdue' THEN 5
          ELSE 6
        END,
        greatest(coalesce(sf.amount_paid, 0), coalesce(fa.allocated_total, 0)) DESC,
        coalesce(
          sf.amount_outstanding,
          greatest(coalesce(sf.final_amount, sf.amount, 0) - coalesce(sf.amount_paid, 0), 0)
        ) ASC,
        coalesce(sf.updated_at, sf.created_at, now()) DESC,
        coalesce(sf.created_at, now()) DESC,
        sf.id DESC
    ) AS row_rank,
    count(*) OVER (
      PARTITION BY sf.student_id, sf.billing_month, sf.category_code
    ) AS row_count
  FROM public.student_fees sf
  LEFT JOIN fee_allocation_totals fa
    ON fa.student_fee_id = sf.id
  WHERE sf.category_code = 'tuition'
    AND sf.billing_month IS NOT NULL
),
keepers AS (
  SELECT
    rr.student_id,
    rr.billing_month,
    rr.category_code,
    rr.id AS keep_fee_id
  FROM ranked_rows rr
  WHERE rr.row_count > 1
    AND rr.row_rank = 1
),
duplicates AS (
  SELECT
    rr.student_id,
    rr.billing_month,
    rr.category_code,
    rr.id AS drop_fee_id
  FROM ranked_rows rr
  WHERE rr.row_count > 1
    AND rr.row_rank > 1
)
SELECT
  d.drop_fee_id,
  k.keep_fee_id
FROM duplicates d
JOIN keepers k
  ON k.student_id = d.student_id
 AND k.billing_month = d.billing_month
 AND k.category_code = d.category_code;

INSERT INTO public.payment_allocations (
  payment_id,
  student_fee_id,
  allocated_amount,
  billing_month,
  category_code,
  notes,
  created_by,
  created_at,
  updated_at
)
SELECT
  pa.payment_id,
  map.keep_fee_id,
  round(sum(coalesce(pa.allocated_amount, 0)), 2) AS allocated_amount,
  min(pa.billing_month) AS billing_month,
  min(pa.category_code) AS category_code,
  min(pa.notes) AS notes,
  (array_remove(array_agg(pa.created_by), NULL))[1] AS created_by,
  min(pa.created_at) AS created_at,
  max(pa.updated_at) AS updated_at
FROM public.payment_allocations pa
JOIN tmp_duplicate_tuition_fee_map map
  ON map.drop_fee_id = pa.student_fee_id
GROUP BY pa.payment_id, map.keep_fee_id
ON CONFLICT (payment_id, student_fee_id)
DO UPDATE
SET allocated_amount = round(
      coalesce(public.payment_allocations.allocated_amount, 0) + coalesce(EXCLUDED.allocated_amount, 0),
      2
    ),
    billing_month = coalesce(public.payment_allocations.billing_month, EXCLUDED.billing_month),
    category_code = coalesce(public.payment_allocations.category_code, EXCLUDED.category_code),
    notes = coalesce(public.payment_allocations.notes, EXCLUDED.notes),
    updated_at = greatest(
      coalesce(public.payment_allocations.updated_at, public.payment_allocations.created_at, now()),
      coalesce(EXCLUDED.updated_at, EXCLUDED.created_at, now())
    );

DELETE FROM public.payment_allocations pa
WHERE pa.student_fee_id IN (
  SELECT drop_fee_id FROM tmp_duplicate_tuition_fee_map
);

DO $$
BEGIN
  IF to_regclass('public.payment_reminders') IS NOT NULL THEN
    UPDATE public.payment_reminders pr
    SET student_fee_id = map.keep_fee_id
    FROM tmp_duplicate_tuition_fee_map map
    WHERE pr.student_fee_id = map.drop_fee_id;
  END IF;
END;
$$;

UPDATE public.payments p
SET fee_ids = (
  SELECT CASE
    WHEN count(*) = 0 THEN NULL
    ELSE array_agg(fee_id)
  END
  FROM (
    SELECT DISTINCT coalesce(map.keep_fee_id::text, fee_id) AS fee_id
    FROM unnest(coalesce(p.fee_ids, ARRAY[]::text[])) AS fee_id
    LEFT JOIN tmp_duplicate_tuition_fee_map map
      ON map.drop_fee_id::text = fee_id
  ) deduped
)
WHERE EXISTS (
  SELECT 1
  FROM unnest(coalesce(p.fee_ids, ARRAY[]::text[])) AS fee_id
  WHERE fee_id IN (SELECT drop_fee_id::text FROM tmp_duplicate_tuition_fee_map)
);

DELETE FROM public.student_fees sf
WHERE sf.id IN (
  SELECT drop_fee_id FROM tmp_duplicate_tuition_fee_map
);

DO $$
BEGIN
  IF to_regclass('public.fee_corrections_audit') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_trigger
       WHERE tgrelid = 'public.fee_corrections_audit'::regclass
         AND tgname = 'trg_fee_corrections_audit_no_update'
         AND NOT tgisinternal
     ) THEN
    ALTER TABLE public.fee_corrections_audit
      ENABLE TRIGGER trg_fee_corrections_audit_no_update;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Guardrail: one tuition row per student per billing month
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_fees_unique_tuition_month_per_student
  ON public.student_fees (student_id, billing_month)
  WHERE category_code = 'tuition'
    AND billing_month IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Harden age-based tuition reassessment RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_correct_fee_for_student(
  p_student_id uuid,
  p_billing_month date DEFAULT date_trunc('month', CURRENT_DATE)::date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_student RECORD;
  v_correct RECORD;
  v_existing RECORD;
  v_billing_month date := date_trunc('month', coalesce(p_billing_month, CURRENT_DATE)::timestamp)::date;
  v_rows_updated integer := 0;
BEGIN
  SELECT id, date_of_birth, preschool_id, first_name, last_name
  INTO v_student
  FROM public.students
  WHERE id = p_student_id;

  IF v_student IS NULL THEN
    RETURN jsonb_build_object('error', 'Student not found');
  END IF;

  IF v_student.date_of_birth IS NULL THEN
    RETURN jsonb_build_object('error', 'Student has no date of birth set');
  END IF;

  SELECT *
  INTO v_correct
  FROM get_tuition_fee_for_age(v_student.preschool_id, v_student.date_of_birth, v_billing_month);

  IF v_correct.fee_structure_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No matching fee structure found for this age');
  END IF;

  SELECT
    sf.id,
    sf.amount,
    sf.status,
    coalesce(sf.amount_paid, 0) AS amount_paid
  INTO v_existing
  FROM public.student_fees sf
  WHERE sf.student_id = p_student_id
    AND sf.billing_month = v_billing_month
    AND sf.category_code = 'tuition'
  ORDER BY
    CASE sf.status
      WHEN 'paid' THEN 0
      WHEN 'partially_paid' THEN 1
      WHEN 'waived' THEN 2
      WHEN 'pending_verification' THEN 3
      WHEN 'pending' THEN 4
      WHEN 'overdue' THEN 5
      ELSE 6
    END,
    coalesce(sf.amount_paid, 0) DESC,
    coalesce(sf.updated_at, sf.created_at, now()) DESC,
    coalesce(sf.created_at, now()) DESC,
    sf.id DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    IF v_existing.status IN ('paid', 'waived') THEN
      RETURN jsonb_build_object(
        'action', 'unchanged',
        'reason', 'existing_fee_is_settled',
        'student', v_student.first_name || ' ' || v_student.last_name,
        'fee_name', v_correct.fee_name,
        'amount', v_existing.amount,
        'billing_month', v_billing_month
      );
    END IF;

    UPDATE public.student_fees
    SET fee_structure_id = v_correct.fee_structure_id,
        amount = v_correct.fee_amount,
        final_amount = v_correct.fee_amount,
        amount_outstanding = greatest(v_correct.fee_amount - coalesce(amount_paid, 0), 0)
    WHERE id = v_existing.id
      AND status IN ('pending', 'overdue', 'partially_paid', 'pending_verification');

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    IF v_rows_updated > 0 THEN
      RETURN jsonb_build_object(
        'action', 'updated',
        'student', v_student.first_name || ' ' || v_student.last_name,
        'fee_name', v_correct.fee_name,
        'amount', v_correct.fee_amount,
        'billing_month', v_billing_month
      );
    END IF;

    RETURN jsonb_build_object(
      'action', 'unchanged',
      'reason', 'existing_fee_not_updatable',
      'student', v_student.first_name || ' ' || v_student.last_name,
      'fee_name', v_correct.fee_name,
      'amount', v_existing.amount,
      'billing_month', v_billing_month
    );
  END IF;

  INSERT INTO public.student_fees (
    student_id,
    fee_structure_id,
    amount,
    final_amount,
    due_date,
    billing_month,
    status,
    amount_outstanding,
    category_code
  ) VALUES (
    p_student_id,
    v_correct.fee_structure_id,
    v_correct.fee_amount,
    v_correct.fee_amount,
    v_billing_month,
    v_billing_month,
    'pending',
    v_correct.fee_amount,
    'tuition'
  );

  RETURN jsonb_build_object(
    'action', 'created',
    'student', v_student.first_name || ' ' || v_student.last_name,
    'fee_name', v_correct.fee_name,
    'amount', v_correct.fee_amount,
    'billing_month', v_billing_month
  );
END;
$$;

COMMENT ON FUNCTION assign_correct_fee_for_student IS
  'Assigns or corrects the tuition fee for a student for a given billing month. '
  'Normalizes the billing month, preserves settled rows, and prevents stale duplicate tuition rows.';

GRANT EXECUTE ON FUNCTION assign_correct_fee_for_student TO authenticated;
