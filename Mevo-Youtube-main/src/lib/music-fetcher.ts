import type { SectionConfig } from './category-config';
import { getSongs } from '@/services/songService';
import { getExtractorBaseUrl } from './extractor';
import { supabase } from '@/lib/supabase';
import { deduplicateYouTubeTracks } from '@/services/youtube';

// Banned keywords for non-music / shorts / loops / compilations / recaps
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

export interface UnifiedSong {
  id: string;
  title: string;
  artist: string;
  duration?: string;
  audioUrl: string;
  coverImage: string;
  source: 'local' | 'youtube';
  youtubeId: string;
}

export interface PaginatedResult {
  songs: UnifiedSong[];
  nextPageToken?: string;
  totalFetched: number;
}

// Helper to convert ISO 8601 duration (e.g. PT3M45S) to seconds
export function parseDurationToSeconds(durationStr: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function formatDurationSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return 'YouTube';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Searches YouTube for music tracks with strict 1 to 8 minutes duration verification via Video Details.
 */
export async function fetchYouTubeSearchTracks(
  query: string,
  limit = 50,
  pageToken?: string
): Promise<{ songs: UnifiedSong[]; nextPageToken?: string }> {
  try {
    const extractorUrl = getExtractorBaseUrl();
    const cleanSearchQuery = query.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    let endpoint = `${extractorUrl}/api/search?q=${encodeURIComponent(cleanSearchQuery)}&limit=${limit}`;
    if (pageToken) {
      endpoint += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const res = await fetch(endpoint);
    if (!res.ok) {
      return { songs: [] };
    }

    const data = await res.json();
    const items = data.items || [];
    const nextToken = data.nextPageToken;
    const accumulated: UnifiedSong[] = [];
    const seenIds = new Set<string>();

    for (const item of items) {
      if (!item.id || seenIds.has(item.id)) continue;
      const title = (item.title || '').toLowerCase();
      const channel = (item.channelTitle || item.channel || item.uploader || item.artist || '').toLowerCase();
      const dur = typeof item.duration === 'number' ? item.duration : 0;
      const isBanned =
        BANNED_KEYWORDS.some((kw) => title.includes(kw) || channel.includes(kw)) ||
        BANNED_CHANNELS.some((bc) => channel.includes(bc));
      const isValidDuration = dur === 0 || (dur >= 60 && dur <= 480);

      if (!isBanned && isValidDuration) {
        seenIds.add(item.id);
        accumulated.push({
          id: item.id,
          title: item.title || 'Unknown Title',
          artist: item.artist || item.channelTitle || item.channel || item.uploader || 'YouTube Artist',
          coverImage: item.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
          audioUrl: '',
          source: 'youtube' as const,
          youtubeId: item.id,
          duration: dur ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : 'YouTube',
        });
      }
    }

    const deduped = deduplicateYouTubeTracks(accumulated);
    return { songs: deduped.slice(0, limit), nextPageToken: nextToken };
  } catch (error) {
    console.error('Fetch search tracks error:', error);
    return { songs: [] };
  }
}

/**
 * Paginated YouTube Category Tracks Engine
 * Fetches batches of songs up to targetCount (e.g. 100 tracks) using nextPageToken and duration filtering.
 */
export async function fetchPaginatedCategoryTracks(
  section: SectionConfig,
  pageToken?: string,
  targetCount = 100
): Promise<PaginatedResult> {
  // If local Mahi Select
  if (section.source === 'local') {
    const localSongs = await fetchLocalMahiSelect();
    return {
      songs: localSongs.slice(0, targetCount),
      totalFetched: localSongs.length,
    };
  }

  // If MEVO Pulse
  if (section.id === 'mevo-pulse') {
    const pulseSongs = await fetchCustomMevoPulse();
    return {
      songs: pulseSongs,
      totalFetched: pulseSongs.length,
    };
  }

  let accumulatedSongs: UnifiedSong[] = [];
  let currentToken = pageToken;
  let attempts = 0;
  const maxAttempts = 8;
  const query = section.query || `${section.title} official audio`;

  try {
    while (accumulatedSongs.length < targetCount && attempts < maxAttempts) {
      attempts++;
      const needed = targetCount - accumulatedSongs.length;
      const res = await fetchYouTubeSearchTracks(query, Math.min(50, needed), currentToken);

      if (res.songs.length === 0) break;
      accumulatedSongs.push(...res.songs);
      currentToken = res.nextPageToken;

      if (!currentToken) break;
    }

    // Deduplicate
    const seen = new Set<string>();
    const deduped = accumulatedSongs.filter((song) => {
      if (seen.has(song.id)) return false;
      seen.add(song.id);
      return true;
    });

    return {
      songs: deduped.slice(0, targetCount),
      nextPageToken: currentToken,
      totalFetched: deduped.length,
    };
  } catch (error) {
    console.error('Paginated fetch error:', error);
    return { songs: [], totalFetched: 0 };
  }
}

/**
 * Custom Blended MEVO Pulse Generator
 * Interleaves top tracks across primary genres with dominant weighting on Hindi, English, Phonk, and Sonic World.
 */
export async function fetchCustomMevoPulse(): Promise<UnifiedSong[]> {
  try {
    const extractorUrl = getExtractorBaseUrl();
    const res = await fetch(`${extractorUrl}/api/youtube/trending?region=BD&limit=50`);
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      if (Array.isArray(items) && items.length > 0) {
        return items.map((item: any) => ({
          id: item.id,
          title: item.title || 'Unknown Track',
          artist: item.artist || item.channelTitle || 'YouTube Artist',
          coverImage: item.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
          audioUrl: '',
          source: 'youtube' as const,
          youtubeId: item.id,
          duration: item.duration ? `${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}` : 'YouTube',
        }));
      }
    }

    // Fallback: search query
    const fallbackRes = await fetchYouTubeSearchTracks(
      'top trending hindi bollywood english pop phonk viral official audio',
      50
    );
    return fallbackRes.songs;
  } catch (error) {
    console.error('Error creating MEVO Pulse feed:', error);
    return [];
  }
}

async function fetchLocalMahiSelect(): Promise<UnifiedSong[]> {
  try {
    const { data: songs, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && songs && songs.length > 0) {
      return songs.map((s: any) => ({
        id: s.id,
        title: s.title || 'Untitled Track',
        artist: (s.artist || s.artist_name || 'Unknown Artist').trim(),
        coverImage: s.cover_image || s.cover_url || s.cover || '/default-cover.jpg',
        audioUrl: s.audio_file || s.audio_url || s.audio || '',
        source: 'local' as const,
        youtubeId: '',
        duration: s.duration ? `${Math.floor(s.duration / 60)}:${String(s.duration % 60).padStart(2, '0')}` : '3:30',
      }));
    }
  } catch (err) {
    console.warn('Error fetching Mahi Select directly from Supabase, falling back:', err);
  }

  // Graceful fallback to getSongs()
  try {
    const localSongs = await getSongs();
    return localSongs.map((s) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      coverImage: s.cover_image || '/default-cover.jpg',
      audioUrl: s.audio_file || '',
      source: 'local' as const,
      youtubeId: '',
      duration: s.duration ? `${Math.floor(s.duration / 60)}:${String(s.duration % 60).padStart(2, '0')}` : '3:30',
    }));
  } catch (err) {
    console.error('Error fetching Mahi Select from database:', err);
    return [];
  }
}

/**
 * Main Section Dispatcher — Fetches 50 songs per section for homepage horizontal rows.
 */
export async function getSectionSongs(section: SectionConfig): Promise<UnifiedSong[]> {
  if (section.id === 'mevo-pulse') {
    return await fetchCustomMevoPulse();
  }
  if (section.source === 'local') {
    return await fetchLocalMahiSelect();
  }
  const res = await fetchYouTubeSearchTracks(section.query || `${section.title} official audio`, 50);
  return res.songs;
}
