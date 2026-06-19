-- Replace simple working_hours jsonb with flexible time blocks, per branch.
ALTER TABLE branches ADD COLUMN IF NOT EXISTS schedule_blocks jsonb DEFAULT '{}';
-- Format example:
-- {
--   "saturday": [{"start":"12:00","end":"13:00"}, {"start":"15:00","end":"17:30"}, {"start":"19:00","end":"22:00"}],
--   "sunday": [],
--   "monday": [{"start":"09:00","end":"17:00"}],
--   ...
-- }
