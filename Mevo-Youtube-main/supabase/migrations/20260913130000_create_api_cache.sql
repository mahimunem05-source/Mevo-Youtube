-- Migration: Create api_cache table for persistent YouTube API caching
-- Description: Provides multi-layer persistent caching across page reloads, tab switches, and server restarts

CREATE TABLE IF NOT EXISTS public.api_cache (
  cache_key TEXT PRIMARY KEY,
  cache_type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Index on cache_key and expires_at for high-performance lookup & pruning
CREATE INDEX IF NOT EXISTS idx_api_cache_cache_key ON public.api_cache (cache_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires_at ON public.api_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_api_cache_type_expires ON public.api_cache (cache_type, expires_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

-- Allow public and authenticated read
CREATE POLICY "Public read api_cache" ON public.api_cache
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow public and authenticated upsert
CREATE POLICY "Public upsert api_cache" ON public.api_cache
  FOR ALL TO anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

-- Grant table-level access to anon, authenticated, and service_role
GRANT ALL ON TABLE public.api_cache TO anon, authenticated, service_role;

-- Automatic cleanup function for expired cache entries
CREATE OR REPLACE FUNCTION public.cleanup_expired_api_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.api_cache
  WHERE expires_at < now();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
