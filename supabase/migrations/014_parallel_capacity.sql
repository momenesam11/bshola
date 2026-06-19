ALTER TABLE branches ADD COLUMN IF NOT EXISTS capacity int DEFAULT 1;
-- capacity = how many simultaneous appointments allowed at the same time slot in this branch
