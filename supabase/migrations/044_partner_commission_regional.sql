-- Partners earn the same percentage on a clinic from any country. Outside Egypt it
-- applies to what that country's plan is worth in pounds, because commissions are
-- paid in pounds. These amounts mirror src/lib/pricing.js at about 50 pounds to
-- the dollar. They are fixed on purpose, so a partner's commission doesn't move
-- with the exchange rate, and need updating by hand if prices or rates change.
-- Run after 043, which adds businesses.country. Safe to re-run, and changes no
-- commission already recorded.

ALTER TABLE growth_settings
  ADD COLUMN IF NOT EXISTS regional_plan_prices jsonb NOT NULL DEFAULT '{
    "SA": {"1": 1300, "3": 3300, "6": 5300},
    "AE": {"1": 1350, "3": 3400, "6": 5450},
    "QA": {"1": 1350, "3": 3400, "6": 5450},
    "KW": {"1": 1300, "3": 3250, "6": 5200},
    "BH": {"1": 1350, "3": 3350, "6": 5300},
    "OM": {"1": 1300, "3": 3250, "6": 5200},
    "JO": {"1": 700, "3": 1750, "6": 2800},
    "MA": {"1": 775, "3": 1950, "6": 3100},
    "TN": {"1": 650, "3": 1700, "6": 2700},
    "OTHER": {"1": 950, "3": 2400, "6": 3800}
  }'::jsonb;

CREATE OR REPLACE FUNCTION growth_accrue_commissions(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  l        growth_leads%ROWTYPE;
  p        growth_partners%ROWTYPE;
  b        businesses%ROWTYPE;
  s        growth_settings%ROWTYPE;
  v_owner  text;
  v_days   numeric;
  v_months int;
  v_price  numeric;
  v_country text;
BEGIN
  SELECT * INTO l FROM growth_leads WHERE id = p_lead_id;
  IF NOT FOUND OR l.is_test THEN RETURN; END IF;

  IF l.business_id IS NOT NULL THEN
    SELECT * INTO b FROM businesses WHERE id = l.business_id;
    v_owner := growth_normalize_phone(coalesce(b.owner_phone, b.phone));
  END IF;

  IF l.stage = 'paid' AND l.qualified_at IS NULL THEN
    UPDATE growth_leads SET qualified_at = now(), qualified_by = 'auto' WHERE id = l.id RETURNING * INTO l;
    INSERT INTO growth_activities (lead_id, kind, body, meta)
    VALUES (l.id, 'system', 'اتأكدت إنها عيادة حقيقية: دفعت اشتراك', jsonb_build_object('reason', 'paid'));
  END IF;

  IF l.partner_id IS NOT NULL THEN
    SELECT * INTO p FROM growth_partners WHERE id = l.partner_id;
    IF v_owner IS NOT NULL AND growth_normalize_phone(p.phone) = v_owner THEN
      IF NOT EXISTS (SELECT 1 FROM growth_activities WHERE lead_id = l.id AND meta->>'reason' = 'partner_own_number') THEN
        INSERT INTO growth_activities (lead_id, kind, body, meta)
        VALUES (l.id, 'system', 'مفيش عمولة: رقم صاحب العيادة هو نفس رقم الشريك', jsonb_build_object('reason', 'partner_own_number'));
      END IF;
    ELSE
      IF l.qualified_at IS NOT NULL AND p.signup_bonus_egp > 0 THEN
        INSERT INTO growth_commissions (partner_id, lead_id, kind, amount_egp, basis)
        VALUES (p.id, l.id, 'signup_bonus', p.signup_bonus_egp,
                'عيادة حقيقية اتأكدنا منها (' || CASE WHEN l.qualified_by = 'admin' THEN 'يدوي' WHEN l.stage = 'paid' THEN 'دفعت اشتراك' ELSE 'حجوزات حقيقية' END || ')')
        ON CONFLICT (lead_id, kind) DO NOTHING;
      END IF;

      IF l.stage = 'paid' AND p.commission_pct > 0 AND l.business_id IS NOT NULL THEN
        SELECT * INTO s FROM growth_settings WHERE id = 1;
        -- The admin activates for N days; N ≈ the plan's months × 30.
        v_days := extract(epoch FROM (b.trial_ends_at - coalesce(b.activated_at, l.paid_at))) / 86400;
        v_months := CASE WHEN v_days >= 150 THEN 6 WHEN v_days >= 75 THEN 3 ELSE 1 END;
        -- Outside Egypt the percentage applies to that country's price in pounds.
        v_country := coalesce(b.country, 'EG');
        v_price := CASE WHEN v_country = 'EG' THEN NULL
                        ELSE coalesce(s.regional_plan_prices -> v_country, s.regional_plan_prices -> 'OTHER') ->> v_months::text
                   END::numeric;
        v_price := coalesce(v_price, (s.plan_prices ->> v_months::text)::numeric, 0);
        INSERT INTO growth_commissions (partner_id, lead_id, kind, amount_egp, basis)
        VALUES (p.id, l.id, 'subscription', round(v_price * p.commission_pct / 100, 2),
                p.commission_pct || '% من باقة ' || v_months || ' شهر (' || v_price || ' جنيه'
                || CASE WHEN v_country = 'EG' THEN '' ELSE '، ما يعادل سعر ' || v_country END || ')')
        ON CONFLICT (lead_id, kind) DO NOTHING;
      END IF;
    END IF;
  END IF;

  IF l.stage = 'paid' AND l.referrer_business_id IS NOT NULL AND l.referrer_business_id IS DISTINCT FROM l.business_id
     AND NOT EXISTS (SELECT 1 FROM growth_leads x WHERE x.business_id = l.referrer_business_id AND x.is_test)
     AND NOT EXISTS (
       SELECT 1 FROM businesses r
       WHERE r.id = l.referrer_business_id AND v_owner IS NOT NULL
         AND growth_normalize_phone(coalesce(r.owner_phone, r.phone)) = v_owner
     ) THEN
    INSERT INTO growth_referral_rewards (referrer_business_id, lead_id)
    VALUES (l.referrer_business_id, l.id)
    ON CONFLICT (lead_id) DO NOTHING;
  END IF;
END;
$$;
