-- Migration: Create youtube_cache table for shared server-side caching
-- Description: Provides persistent, shared caching across backend instances and users

CREATE TABLE IF NOT EXISTS public.youtube_cache (
  cache_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  stale_at TIMESTAMP WITH TIME ZONE NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for expiration lookups and cleanup
CREATE INDEX IF NOT EXISTS idx_youtube_cache_expires_at ON public.youtube_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_youtube_cache_stale_at ON public.youtube_cache (stale_at);

-- Security and Row Level Security
ALTER TABLE public.youtube_cache ENABLE ROW LEVEL SECURITY;

-- Allow anyone (public/anon) and authenticated users to read from the shared cache
CREATE POLICY "Public read youtube_cache" ON public.youtube_cache
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow server-side and authenticated updates/inserts (UPSERT)
CREATE POLICY "Public upsert youtube_cache" ON public.youtube_cache
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Lightweight cleanup function for expired cache records
CREATE OR REPLACE FUNCTION public.cleanup_expired_youtube_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.youtube_cache
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
