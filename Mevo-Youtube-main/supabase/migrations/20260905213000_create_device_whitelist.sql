-- =========================================================================
-- MEVO Global Device Whitelist & Access Revocation System Migration
-- =========================================================================

-- 1. Create device_whitelist table
CREATE TABLE IF NOT EXISTS public.device_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  device_name TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_device_whitelist_device_id ON public.device_whitelist(device_id);
CREATE INDEX IF NOT EXISTS idx_device_whitelist_status ON public.device_whitelist(status);
CREATE INDEX IF NOT EXISTS idx_device_whitelist_requested_at ON public.device_whitelist(requested_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.device_whitelist ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Policy 1: Anyone (anonymous device or authenticated user) can submit a device registration request
CREATE POLICY "Allow insert device_whitelist"
  ON public.device_whitelist
  FOR INSERT
  WITH CHECK (true);

-- Policy 2: Allow reading device status (devices can query their own whitelist approval status)
CREATE POLICY "Allow select device_whitelist"
  ON public.device_whitelist
  FOR SELECT
  USING (true);

-- Policy 3: Allow update for admin approval / revocation
CREATE POLICY "Allow update device_whitelist"
  ON public.device_whitelist
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy 4: Allow delete for admin cleanup
CREATE POLICY "Allow delete device_whitelist"
  ON public.device_whitelist
  FOR DELETE
  USING (true);
