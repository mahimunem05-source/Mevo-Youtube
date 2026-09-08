import type { UnifiedSong } from './music-fetcher';
import { getExtractorBaseUrl } from './extractor';

const BANNED_KEYWORDS = [
  '#shorts', 'shorts', 'tiktok', 'reel', 'natok', 'drama',
  'full episode', 'vlog', 'reaction', 'review', 'tutorial',
  'trailer', 'teaser', 'gameplay', '1 hour', '10 hours',
  '10 hr', '1 hr', 'hour mix', 'hours mix', 'loop',
  'top 10', 'top 20', 'top 25', 'top 50', 'top 100', 'hot 100',
  'billboard', 'top songs', 'best songs of', 'mashup preview',
  'recap', 'countdown', 'this week', 'megamix', 'compilation',
  'greatest hits collection', 'ranking', 'rankings', 'jukebox',
  'non stop', 'nonstop', 'all songs', 'full album'
];

const BANNED_CHANNELS = [
  'inmusic', 'top music hits', 'billboard', 'billboard chart',
  'redlist', 'chart data', 'music chart', 'top hits', 'top songs',
  'ranking music', 'music ranking', 'song recap', 'top music',
  'best music chart', 'charts'
];

/**
 * Generates dynamic "Up Next" / Autoplay recommended tracks based on current title & artist.
 * Strictly enforces 60s to 480s duration and filters non-music/shorts/compilations.
 * Routes through backend queue/related and search endpoints (no direct Google API keys).
 */
export async function getRelatedTracks(
  title: string,
  artist: string,
  excludeId?: string
): Promise<UnifiedSong[]> {
  const extractorUrl = getExtractorBaseUrl();
  const cleanId = (excludeId || '').replace(/^yt-/, '').trim();

  // 1. Try Innertube Watch-Next radio queue from backend extractor
  if (cleanId && /^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    try {
      const relatedRes = await fetch(`${extractorUrl}/api/queue/related?videoId=${encodeURIComponent(cleanId)}`);
      if (relatedRes.ok) {
        const data = await relatedRes.json();
        const items = data.items || [];
        if (Array.isArray(items) && items.length > 0) {
          const songs = items
            .filter((r: any) => {
              const vid = r.id;
              const dur = typeof r.duration === 'number' ? r.duration : 0;
              const rTitle = (r.title || '').toLowerCase();
              const rChannel = (r.channelTitle || r.channel || r.uploader || r.artist || '').toLowerCase();
              const isBanned =
                BANNED_KEYWORDS.some((kw) => rTitle.includes(kw) || rChannel.includes(kw)) ||
                BANNED_CHANNELS.some((bc) => rChannel.includes(bc));
              const isValidDur = dur === 0 || (dur >= 60 && dur <= 480);
              return vid && vid !== cleanId && !isBanned && isValidDur;
            })
            .slice(0, 8)
            .map((r: any) => ({
              id: r.id,
              title: r.title || 'Unknown Track',
              artist: r.artist || r.channelTitle || r.channel || r.uploader || 'YouTube Artist',
              coverImage: r.thumbnail || `https://img.youtube.com/vi/${r.id}/hqdefault.jpg`,
              audioUrl: '',
              source: 'youtube' as const,
              youtubeId: r.id,
              duration: r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : 'YouTube',
            }));

          if (songs.length > 0) {
            return songs;
          }
        }
      }
    } catch (err) {
      console.warn('[getRelatedTracks] Related queue notice, falling back to search:', err);
    }
  }

  // 2. Search fallback via Backend Search Engine
  try {
    const cleanTitle = title
      .replace(/(\(|\[).*?(\)|\])/g, '')
      .replace(/[^\w\s]/gi, '')
      .trim();
    const query = `${artist} ${cleanTitle} official audio -shorts -tiktok -billboard -top10 -top20 -top50 -top100 -recap -countdown`;

    const fallbackRes = await fetch(`${extractorUrl}/api/search?q=${encodeURIComponent(query)}&limit=12`);
    if (fallbackRes.ok) {
      const results = await fallbackRes.json();
      const items = results.items || results || [];
      if (Array.isArray(items)) {
        return items
          .filter((r: any) => {
            const vid = r.id;
            const dur = typeof r.duration === 'number' ? r.duration : 0;
            const rTitle = (r.title || '').toLowerCase();
            const rChannel = (r.channelTitle || r.channel || r.uploader || r.artist || '').toLowerCase();
            const isBanned =
              BANNED_KEYWORDS.some((kw) => rTitle.includes(kw) || rChannel.includes(kw)) ||
              BANNED_CHANNELS.some((bc) => rChannel.includes(bc));
            const isValidDur = dur === 0 || (dur >= 60 && dur <= 480);
            return vid && vid !== cleanId && !isBanned && isValidDur;
          })
          .slice(0, 8)
          .map((r: any) => ({
            id: r.id,
            title: r.title || 'Unknown Track',
            artist: r.artist || r.channelTitle || r.channel || r.uploader || 'YouTube Artist',
            coverImage: r.thumbnail || `https://img.youtube.com/vi/${r.id}/hqdefault.jpg`,
            audioUrl: '',
            source: 'youtube' as const,
            youtubeId: r.id,
            duration: r.duration ? `${Math.floor(r.duration / 60)}:${String(r.duration % 60).padStart(2, '0')}` : 'YouTube',
          }));
      }
    }

    return [];
  } catch (error) {
    console.error('Error generating Up Next recommendations:', error);
    return [];
  }
}
