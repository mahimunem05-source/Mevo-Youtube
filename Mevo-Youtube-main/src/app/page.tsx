import { HOME_SECTIONS, type SectionConfig } from '@/lib/category-config';
import { getSectionSongs, type UnifiedSong } from '@/lib/music-fetcher';
import { SongCard } from '@/components/music/song-card';
import type { Song } from '@/data/songs';

interface SectionWithSongs extends SectionConfig {
  songs: UnifiedSong[];
}

export default async function HomePage() {
  const sectionsWithData = await Promise.allSettled(
    HOME_SECTIONS.map(async (section): Promise<SectionWithSongs> => {
      const songs = await getSectionSongs(section);
      return { ...section, songs };
    })
  );

  const activeSections: SectionWithSongs[] = sectionsWithData
    .filter((res): res is PromiseFulfilledResult<SectionWithSongs> => res.status === 'fulfilled')
    .map((res) => res.value);

  return (
    <main className="space-y-8 px-4 pb-28 pt-4">
      {activeSections.map((section) => (
        <section key={section.id}>
          <div className="flex justify-between items-end mb-3">
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">{section.title}</h2>
              <p className="text-xs text-gray-400">{section.subtitle}</p>
            </div>
            <button className="text-xs text-emerald-400 font-medium hover:underline">
              See All &gt;
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar py-1">
            {section.songs.map((song: UnifiedSong) => {
              const adaptedSong: Song = {
                id: song.id,
                title: song.title,
                artist: song.artist,
                album: 'YouTube Stream',
                genre: 'Universal',
                year: new Date().getFullYear(),
                duration: 210,
                cover: song.coverImage,
                audio: song.audioUrl,
                section: (section.id === 'mahi-select' ? 'favourite' : 'global') as any,
                category: section.title,
              };
              return <SongCard key={song.id} song={adaptedSong} />;
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
