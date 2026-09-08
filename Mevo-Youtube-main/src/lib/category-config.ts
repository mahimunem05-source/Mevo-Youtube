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
    query: "bangla songs official music video | bangla band official audio | SVF Music | G-Series -natok -reaction -status -slowed -reverb -top10 -top20 -top50 -top100 -recap",
    order: "viewCount",
  },
  {
    id: "hindi-reverie",
    title: "Hindi Reverie",
    subtitle: "High-Quality Bollywood & Indie Hindi Originals.",
    source: "youtube",
    type: "search",
    query: "latest hindi official audio songs | bollywood official music video | T-Series | Sony Music India -reaction -status -slowed -reverb -top10 -top20 -top50 -top100 -recap",
    order: "viewCount",
  },
  {
    id: "english-essence",
    title: "English Essence",
    subtitle: "Iconic sound, refined in every note.",
    source: "youtube",
    type: "search",
    query: "english pop official audio songs | viral english songs official audio -billboard -top10 -top20 -top50 -top100 -recap -countdown -ranking",
    order: "viewCount",
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
    query: "drift phonk official audio | phonk music official audio -top10 -top20 -top50 -top100 -recap -countdown -ranking",
    order: "viewCount",
  },
  {
    id: "sonic-world",
    title: "Sonic World",
    subtitle: "Ambient, Lofi, EDM & Atmospheric Classics.",
    source: "youtube",
    type: "search",
    query: "viral english pop official audio | global hits official music video | kpop official audio | afrobeat official audio -hindi -bollywood -bangla -natok -reaction -status -slowed -reverb -top10 -top20 -top50 -top100 -recap",
    order: "relevance",
  },
];
