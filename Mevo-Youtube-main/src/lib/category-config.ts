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
    regionCode: "US",
  },
  {
    id: "bengal-echo",
    title: "Bengal Echo",
    subtitle: "Coke Studio Bangla, Band & Premium Indie Hits.",
    source: "youtube",
    type: "search",
    query: "Coke Studio Bangla Hatirpool Sessions Odd Signature Meghdol Shironamhin Artcell Anupam Roy Arnob official",
    order: "relevance",
  },
  {
    id: "hindi-reverie",
    title: "Hindi Reverie",
    subtitle: "High-Quality Bollywood & Indie Hindi Originals.",
    source: "youtube",
    type: "search",
    query: "latest hindi songs official music video bollywood hits T-Series Sony Music",
    order: "relevance",
  },
  {
    id: "english-essence",
    title: "English Essence",
    subtitle: "Iconic sound, refined in every note.",
    source: "youtube",
    type: "search",
    query: "The Weeknd Billie Eilish Dua Lipa Coldplay Post Malone Taylor Swift Harry Styles Bruno Mars official music video COLORS SHOW",
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
    query: "drift phonk official audio viral brazilian phonk music",
    order: "relevance",
  },
  {
    id: "sonic-world",
    title: "Sonic World",
    subtitle: "International Hits, Latin, K-Pop, French & Global Sounds.",
    source: "youtube",
    type: "search",
    query: "Rosalía | Bad Bunny | NewJeans | Stromae | Yoasobi | Elyanna official",
    order: "relevance",
  },
];
