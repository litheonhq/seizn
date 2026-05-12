-- 2026-05-11 prod P0 convergence:
-- - Prevent nullable memory booleans from making fresh rows invisible to filters.
-- - Converge sibling boolean drift found in the incident sweep.
-- - Fix memory_count drift when soft-delete state changes.

BEGIN;

CREATE OR REPLACE PROCEDURE pg_temp.enforce_boolean_column(
  p_table TEXT,
  p_column TEXT,
  p_default BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_relation_oid OID;
  v_null_count INTEGER;
  v_default_sql TEXT := CASE WHEN p_default THEN 'TRUE' ELSE 'FALSE' END;
BEGIN
  SELECT c.oid
    INTO v_relation_oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = p_table
    AND c.relkind IN ('r', 'p');

  IF v_relation_oid IS NULL THEN
    RAISE NOTICE 'Skipping %.%: public.% is not a base table', p_table, p_column, p_table;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  ) THEN
    RAISE NOTICE 'Skipping %.%: column does not exist', p_table, p_column;
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE public.%I SET %I = %s WHERE %I IS NULL',
    p_table,
    p_column,
    v_default_sql,
    p_column
  );

  EXECUTE format(
    'SELECT COUNT(*)::INTEGER FROM public.%I WHERE %I IS NULL',
    p_table,
    p_column
  )
  INTO v_null_count;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'public.%.% still has % NULL rows after backfill', p_table, p_column, v_null_count;
  END IF;

  EXECUTE format(
    'ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s, ALTER COLUMN %I SET NOT NULL',
    p_table,
    p_column,
    v_default_sql,
    p_column
  );
END;
$$;

-- Bug 1 and A.1: memories booleans used by live filters.
CALL pg_temp.enforce_boolean_column('memories', 'is_deleted', FALSE);
CALL pg_temp.enforce_boolean_column('memories', 'is_encrypted', FALSE);

-- A.1 sibling booleans. Use each column's existing semantic default.
CALL pg_temp.enforce_boolean_column('provider_keys', 'is_active', TRUE);
CALL pg_temp.enforce_boolean_column('provider_keys', 'is_default', FALSE);
CALL pg_temp.enforce_boolean_column('policy_packs', 'is_official', FALSE);
CALL pg_temp.enforce_boolean_column('policy_packs', 'publisher_verified', FALSE);
CALL pg_temp.enforce_boolean_column('answer_contracts', 'is_grounded', FALSE);
CALL pg_temp.enforce_boolean_column('fall_retrieval_traces', 'sampled', TRUE);
CALL pg_temp.enforce_boolean_column('plan_selections', 'user_satisfied', FALSE);

-- winter_rtbf_verification_summary.is_verified is a derived view expression:
-- (verification_hash IS NOT NULL). It is not an insert target and cannot be
-- constrained with ALTER TABLE; the expression itself never returns NULL.

CREATE OR REPLACE FUNCTION public.update_memory_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_deleted, FALSE) = FALSE THEN
      UPDATE public.profiles
      SET memory_count = COALESCE(memory_count, 0) + 1
      WHERE id::TEXT = NEW.user_id::TEXT;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.is_deleted, FALSE) = FALSE THEN
      UPDATE public.profiles
      SET memory_count = GREATEST(COALESCE(memory_count, 0) - 1, 0)
      WHERE id::TEXT = OLD.user_id::TEXT;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id::TEXT IS DISTINCT FROM NEW.user_id::TEXT THEN
      IF COALESCE(OLD.is_deleted, FALSE) = FALSE THEN
        UPDATE public.profiles
        SET memory_count = GREATEST(COALESCE(memory_count, 0) - 1, 0)
        WHERE id::TEXT = OLD.user_id::TEXT;
      END IF;

      IF COALESCE(NEW.is_deleted, FALSE) = FALSE THEN
        UPDATE public.profiles
        SET memory_count = COALESCE(memory_count, 0) + 1
        WHERE id::TEXT = NEW.user_id::TEXT;
      END IF;

      RETURN NEW;
    END IF;

    IF COALESCE(OLD.is_deleted, FALSE) = FALSE
      AND COALESCE(NEW.is_deleted, FALSE) = TRUE THEN
      UPDATE public.profiles
      SET memory_count = GREATEST(COALESCE(memory_count, 0) - 1, 0)
      WHERE id::TEXT = NEW.user_id::TEXT;
    ELSIF COALESCE(OLD.is_deleted, FALSE) = TRUE
      AND COALESCE(NEW.is_deleted, FALSE) = FALSE THEN
      UPDATE public.profiles
      SET memory_count = COALESCE(memory_count, 0) + 1
      WHERE id::TEXT = NEW.user_id::TEXT;
    END IF;

    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_memory_change ON public.memories;
CREATE TRIGGER on_memory_change
  AFTER INSERT OR UPDATE OR DELETE ON public.memories
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_count();

UPDATE public.profiles p
SET memory_count = COALESCE((
  SELECT COUNT(*)::INTEGER
  FROM public.memories m
  WHERE m.user_id::TEXT = p.id::TEXT
    AND COALESCE(m.is_deleted, FALSE) = FALSE
), 0);

NOTIFY pgrst, 'reload schema';

COMMIT;
