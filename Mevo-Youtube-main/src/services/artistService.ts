import { supabase } from "@/lib/supabase";
import { uploadCoverToB2 } from "@/lib/b2-storage";

export interface Artist {
  id: string;
  name: string;
  image_url: string | null;
  is_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UpsertArtistInput {
  id?: string;
  name: string;
  image_url?: string | null;
  is_verified?: boolean;
}

const ARTISTS_TABLE = "artists";

/**
 * Fetch all custom artist profiles from Supabase.
 */
export async function getArtists(): Promise<Artist[]> {
  try {
    const { data, error } = await supabase
      .from(ARTISTS_TABLE)
      .select("id, name, image_url, is_verified, created_at, updated_at")
      .order("name", { ascending: true });

    if (error) {
      console.warn("Could not fetch artists from Supabase:", error.message);
      return [];
    }

    return (data as Artist[]) ?? [];
  } catch (err) {
    console.warn("getArtists exception:", err);
    return [];
  }
}

/**
 * Fetch a single artist profile by name (case-insensitive).
 */
export async function getArtistByName(name: string): Promise<Artist | null> {
  try {
    const { data, error } = await supabase
      .from(ARTISTS_TABLE)
      .select("id, name, image_url, is_verified, created_at, updated_at")
      .ilike("name", name.trim())
      .maybeSingle();

    if (error) {
      return null;
    }

    return (data as Artist) || null;
  } catch {
    return null;
  }
}

/**
 * Create or update an artist profile in Supabase.
 */
export async function upsertArtist(input: UpsertArtistInput): Promise<Artist> {
  const cleanName = input.name.trim();
  if (!cleanName) {
    throw new Error("Artist name is required.");
  }

  const payload: {
    id?: string;
    name: string;
    image_url: string | null;
    is_verified: boolean;
    updated_at: string;
  } = {
    name: cleanName,
    image_url: input.image_url !== undefined ? input.image_url?.trim() || null : null,
    is_verified: Boolean(input.is_verified),
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    payload.id = input.id;
  }

  const { data, error } = await supabase
    .from(ARTISTS_TABLE)
    .upsert(payload, { onConflict: "name" })
    .select("id, name, image_url, is_verified, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(`Failed to save artist: ${error.message}`);
  }

  return data as Artist;
}

/**
 * Upload an artist profile picture to storage and return its public delivery URL.
 */
export async function uploadArtistImage(file: File): Promise<string> {
  const result = await uploadCoverToB2(file);
  return result.publicUrl;
}
