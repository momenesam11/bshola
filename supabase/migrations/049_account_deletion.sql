-- Account deletion: the clinic asks from Settings, the owner approves from
-- /admin, and the admin Edge Function does the deleting.
--
-- account_deletion_requests keeps one row per request. business_id goes NULL
-- once the account is gone, and business_name stays so /admin can still show
-- what was deleted and when. Nothing about patients is kept here.
--
-- The clinic never touches the table directly, only through the RPCs below,
-- which check that the caller owns the account. admin_business_files and
-- admin_delete_business are for the service role (the admin Edge Function).
--
-- Rollback: supabase/rollbacks/049_account_deletion_down.sql.

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  business_name text NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 500),
  requested_by text NOT NULL DEFAULT 'owner' CHECK (requested_by IN ('owner', 'admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deleted', 'rejected', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

-- One open request per account.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
  ON account_deletion_requests (business_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx
  ON account_deletion_requests (status, requested_at DESC);

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_deletion_requests FROM anon, authenticated;
GRANT ALL ON account_deletion_requests TO service_role;

-- The clinic's open request, or nothing.
CREATE OR REPLACE FUNCTION my_account_deletion_request(p_business_id uuid)
RETURNS TABLE (id uuid, reason text, requested_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.reason, r.requested_at
  FROM account_deletion_requests r
  JOIN businesses b ON b.id = r.business_id
  WHERE r.business_id = p_business_id AND r.status = 'pending' AND b.owner_id = auth.uid()
$$;

-- Asking twice returns the request already open instead of failing.
CREATE OR REPLACE FUNCTION request_account_deletion(p_business_id uuid, p_reason text DEFAULT NULL)
RETURNS TABLE (id uuid, reason text, requested_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  SELECT b.name INTO v_name FROM businesses b WHERE b.id = p_business_id AND b.owner_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;

  IF NOT EXISTS (SELECT 1 FROM account_deletion_requests r WHERE r.business_id = p_business_id AND r.status = 'pending') THEN
    INSERT INTO account_deletion_requests (business_id, business_name, reason)
    VALUES (p_business_id, v_name, nullif(left(btrim(coalesce(p_reason, '')), 500), ''));
  END IF;

  RETURN QUERY
    SELECT r.id, r.reason, r.requested_at FROM account_deletion_requests r
    WHERE r.business_id = p_business_id AND r.status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION cancel_account_deletion(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = p_business_id AND b.owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE account_deletion_requests SET status = 'cancelled', decided_at = now()
  WHERE business_id = p_business_id AND status = 'pending';
END;
$$;

-- Every stored file of the account. Both buckets keep files under
-- "<business id>/...". The Edge Function removes them through the Storage API,
-- because Supabase does not allow deleting storage rows with SQL.
CREATE OR REPLACE FUNCTION admin_business_files(p_business_id uuid)
RETURNS TABLE (bucket_id text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
  SELECT o.bucket_id, o.name FROM storage.objects o
  WHERE o.bucket_id IN ('business-assets', 'medical-files')
    AND o.name LIKE p_business_id::text || '/%'
$$;

-- Deletes the account and, through ON DELETE CASCADE, everything under it.
-- Returns the owner and how many other accounts they still own, so the Edge
-- Function deletes the login only when nothing else uses it.
CREATE OR REPLACE FUNCTION admin_delete_business(p_business_id uuid)
RETURNS TABLE (owner_id uuid, other_businesses integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b businesses%ROWTYPE;
BEGIN
  SELECT * INTO b FROM businesses WHERE businesses.id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business not found' USING ERRCODE = 'P0002'; END IF;

  UPDATE account_deletion_requests SET status = 'deleted', decided_at = now()
  WHERE business_id = p_business_id AND status = 'pending';
  IF NOT FOUND THEN
    INSERT INTO account_deletion_requests (business_id, business_name, requested_by, status, decided_at)
    VALUES (p_business_id, b.name, 'admin', 'deleted', now());
  END IF;

  DELETE FROM businesses WHERE businesses.id = p_business_id;

  RETURN QUERY SELECT b.owner_id,
    (SELECT count(*)::int FROM businesses x WHERE x.owner_id = b.owner_id);
END;
$$;

-- Supabase grants new functions to anon and authenticated directly, not only
-- through PUBLIC, so each role is revoked by name.
REVOKE ALL ON FUNCTION my_account_deletion_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION request_account_deletion(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION cancel_account_deletion(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_business_files(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION admin_delete_business(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION my_account_deletion_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION request_account_deletion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_account_deletion(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_business_files(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION admin_delete_business(uuid) TO service_role;
