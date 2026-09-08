REVOKE EXECUTE ON FUNCTION public.on_song_play_event() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.on_song_created() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_song_engagement(UUID) FROM anon, authenticated, public;