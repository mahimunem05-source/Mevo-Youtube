export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  duration: number;
  cover_image: string | null;
  audio_file: string;
  release_date: string | null;
  play_count: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export type CreateSongInput = Omit<Song, "id" | "play_count" | "created_at" | "updated_at">;

export type UpdateSongInput = Partial<CreateSongInput>;

export interface ExtractedSongMetadata {
  title: string;
  artist: string;
  album: string;
  genre: string;
  duration: number;
  coverFile: File | null;
  coverPreviewUrl: string | null;
}
