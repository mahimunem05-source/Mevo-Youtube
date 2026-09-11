export interface SectionConfig {
  id: string;
  title: string;
  subtitle: string;
  source: "youtube" | "local";
  type?: "chart" | "search";
  query?: string;
  order?: "viewCount" | "relevance";
  regionCode?: string;
}

export const HOME_SECTIONS: SectionConfig[] = [
  {
    id: "quick-picks",
    title: "Quick Picks",
    subtitle: "Personalized mixes inspired by your listening habits.",
    source: "local",
  },
  {
    id: "mevo-pulse",
    title: "MEVO Pulse",
    subtitle: "Top Global Trending & Chart-toppers.",
    source: "youtube",
    type: "chart",
    regionCode: "BD",
  },
  {
    id: "bengal-echo",
    title: "Bengal Echo",
    subtitle: "Official Bangla Band, Indie & Contemporary Hits.",
    source: "youtube",
    type: "search",
    query: "new bangla songs official music video | latest bangla band official audio | bangla hits official audio | SVF Music | G-Series -natok -drama -reaction -status -slowed -reverb -top10 -top20 -top50 -top100 -recap",
    order: "relevance",
  },
  {
    id: "hindi-reverie",
    title: "Hindi Reverie",
    subtitle: "High-Quality Bollywood & Indie Hindi Originals.",
    source: "youtube",
    type: "search",
    query: "latest hindi official audio songs | new bollywood music video | trending hindi songs | T-Series | Sony Music India -reaction -status -slowed -reverb -top10 -top20 -top50 -top100 -recap",
    order: "relevance",
  },
  {
    id: "english-essence",
    title: "English Essence",
    subtitle: "Iconic sound, refined in every note.",
    source: "youtube",
    type: "search",
    query: "new english pop official audio | viral english songs official audio | global pop hits official audio -billboard -top10 -top20 -top50 -top100 -recap -countdown -ranking",
    order: "relevance",
  },
  {
    id: "mahi-select",
    title: "Mahi Select",
    subtitle: "Personally chosen. Exceptionally refined.",
    source: "local",
  },
  {
    id: "boost-aura",
    title: "Aura Phonk",
    subtitle: "High-velocity Phonk, Bass-boosted drift, and energetic sonic beats.",
    source: "youtube",
    type: "search",
    query: "drift phonk official audio | brazilian phonk viral audio | phonk music official audio -top10 -top20 -top50 -top100 -recap -countdown -ranking",
    order: "relevance",
  },
  {
    id: "sonic-world",
    title: "Sonic World",
    subtitle: "International Sounds: K-Pop, J-Pop, Latin & Global Grooves.",
    source: "youtube",
    type: "search",
    query: "kpop official music video | latin hits reggaeton official audio | afrobeats viral official audio -hindi -bangla -bollywood -natok",
    order: "relevance",
  },
];
