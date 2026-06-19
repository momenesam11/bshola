-- Allow public (anon) read on branches so the booking page can list branches
CREATE POLICY "public_read_branches" ON branches
  FOR SELECT
  USING (true);
