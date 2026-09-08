-- Migration: Create artists table for custom artist image and verified status management

CREATE TABLE IF NOT EXISTS public.artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  image_url text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by name
CREATE INDEX IF NOT EXISTS artists_name_idx ON public.artists (name);

-- Permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists TO authenticated;
GRANT SELECT ON public.artists TO anon;
GRANT ALL ON public.artists TO service_role;

-- Row Level Security
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view artists"
  ON public.artists FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can insert artists"
  ON public.artists FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update artists"
  ON public.artists FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete artists"
  ON public.artists FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
