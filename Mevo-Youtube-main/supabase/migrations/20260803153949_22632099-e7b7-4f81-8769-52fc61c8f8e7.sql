CREATE TABLE public.custom_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  cover_image text,
  cover_path text,
  release_date date,
  published boolean NOT NULL DEFAULT false,
  collection text NOT NULL DEFAULT 'mahi-edition',
  display_order integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_albums TO authenticated;
GRANT SELECT ON public.custom_albums TO anon;
GRANT ALL ON public.custom_albums TO service_role;

ALTER TABLE public.custom_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published custom albums"
  ON public.custom_albums FOR SELECT
  TO anon, authenticated
  USING (published = true);

CREATE POLICY "Admins can view all custom albums"
  ON public.custom_albums FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert custom albums"
  ON public.custom_albums FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update custom albums"
  ON public.custom_albums FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete custom albums"
  ON public.custom_albums FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_custom_albums_updated_at
  BEFORE UPDATE ON public.custom_albums
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.album_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES public.custom_albums(id) ON DELETE CASCADE,
  song_id uuid NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, song_id)
);

CREATE INDEX album_songs_album_id_position_idx ON public.album_songs (album_id, position);
CREATE INDEX album_songs_song_id_idx ON public.album_songs (song_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.album_songs TO authenticated;
GRANT SELECT ON public.album_songs TO anon;
GRANT ALL ON public.album_songs TO service_role;

ALTER TABLE public.album_songs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view tracks of published custom albums"
  ON public.album_songs FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.custom_albums a
    WHERE a.id = album_songs.album_id AND a.published = true
  ));

CREATE POLICY "Admins can view all album songs"
  ON public.album_songs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage album songs"
  ON public.album_songs FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));