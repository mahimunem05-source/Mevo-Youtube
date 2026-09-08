-- =========================================================================
-- MEVO Secure Download & Device Approval System Migration
-- =========================================================================

-- 1. Create download_requests table
CREATE TABLE IF NOT EXISTS public.download_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id TEXT NOT NULL,
  song_title TEXT,
  song_artist TEXT,
  device_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  CONSTRAINT unique_song_device UNIQUE (song_id, device_id)
);

-- 2. Performance indexes for fast device and status lookups
CREATE INDEX IF NOT EXISTS idx_download_requests_device_song ON public.download_requests(device_id, song_id);
CREATE INDEX IF NOT EXISTS idx_download_requests_status ON public.download_requests(status);
CREATE INDEX IF NOT EXISTS idx_download_requests_created_at ON public.download_requests(created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.download_requests ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Policy 1: Anyone (anonymous device or authenticated user) can submit a download request
CREATE POLICY "Allow insert download requests"
  ON public.download_requests
  FOR INSERT
  WITH CHECK (true);

-- Policy 2: Allow reading download requests (devices can query their own approval status)
CREATE POLICY "Allow select download requests"
  ON public.download_requests
  FOR SELECT
  USING (true);

-- Policy 3: Allow updating download requests (for approval/rejection)
CREATE POLICY "Allow update download requests"
  ON public.download_requests
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policy 4: Allow deleting download requests
CREATE POLICY "Allow delete download requests"
  ON public.download_requests
  FOR DELETE
  USING (true);
