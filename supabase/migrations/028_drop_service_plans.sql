-- migration 027 (service_plans / service_plan_steps) was built against the
-- wrong mental model: a follow-up template tied to a SERVICE, not a
-- sequence of visits tied to a CLIENT. Confirmed zero live usage before
-- dropping (service_plans count = 0, service_plan_steps count = 0).
-- CASCADE drops the FK constraint on appointments.plan_step_id along with
-- service_plan_steps — it does not drop the column itself, which is left
-- as an orphaned nullable uuid (harmless, unused going forward).

DROP TABLE IF EXISTS service_plan_steps CASCADE;
DROP TABLE IF EXISTS service_plans CASCADE;
