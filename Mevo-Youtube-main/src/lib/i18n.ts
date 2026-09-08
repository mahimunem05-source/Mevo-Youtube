export type Language = "en" | "bn";

export const translations: Record<Language, Record<string, string>> = {
  en: {
    // Navigation
    "nav.home": "Home",
    "nav.trending": "Trending",
    "nav.allSongs": "All Songs",
    "nav.albums": "Albums",
    "nav.artists": "Artists",
    "nav.downloads": "Downloads",
    "nav.favorites": "Favorites",
    "nav.recentlyPlayed": "Recently Played",
    "nav.library": "Library",
    "nav.settings": "Settings",
    "nav.about": "About MEVO",
    "nav.search": "Search",
    "nav.searchPlaceholder": "Search songs, artists, albums...",
    "search.recentSearches": "Recent Searches",
    "search.clearAll": "Clear All",
    "search.noRecent": "No recent searches",

    // Player Controls & Labels
    "player.playingFrom": "PLAYING FROM",
    "player.lyrics": "Lyrics",
    "player.upNext": "UP NEXT",
    "player.seeAll": "SEE ALL",
    "player.clear": "CLEAR",
    "player.queue": "Queue",
    "player.noLyrics": "No lyrics available for this song.",
    "player.nowPlaying": "Now Playing",
    "player.autoplay": "Autoplay",
    "player.shuffle": "Shuffle",
    "player.repeat": "Repeat",
    "player.repeatOff": "Repeat Off",
    "player.repeatAll": "Repeat All",
    "player.repeatOne": "Repeat One",

    // Settings Header
    "settings.eyebrow": "PREFERENCES",
    "settings.title": "Settings",
    "settings.subtitle": "Manage playback, audio quality, storage, and app preferences.",

    // Settings - Playback
    "settings.playback.title": "Playback",
    "settings.playback.desc": "Customize how tracks transition, resume, and queue up.",
    "settings.autoplay.label": "Autoplay",
    "settings.autoplay.desc": "Keep the music playing with similar songs when your queue ends.",
    "settings.crossfade.label": "Crossfade",
    "settings.crossfade.desc": "Overlap audio between ending and starting tracks.",
    "settings.gapless.label": "Gapless Playback",
    "settings.gapless.desc": "Eliminate silence between continuous tracks.",
    "settings.normalization.label": "Volume Normalization",
    "settings.normalization.desc": "Maintain consistent loudness across diverse songs.",
    "settings.rememberPosition.label": "Remember Playback Position",
    "settings.rememberPosition.desc": "Resume tracks from where you last stopped.",

    // Settings - Audio Quality
    "settings.audioQuality.title": "Audio Quality",
    "settings.audioQuality.desc": "Set streaming bitrates and download fidelity.",
    "settings.streamingQuality.label": "Streaming Quality",
    "settings.streamingQuality.desc":
      "Higher bitrates use more bandwidth but deliver crisper clarity.",
    "settings.downloadQuality.label": "Download Quality",
    "settings.downloadQuality.desc": "Audio fidelity applied to newly saved offline tracks.",

    // Settings - Storage
    "settings.storage.title": "Storage & Downloads",
    "settings.storage.desc": "Manage downloaded tracks and cache storage.",
    "settings.downloadedTracks": "Downloaded Tracks",
    "settings.storageUsed": "Storage Used",
    "settings.clearDownloads": "Clear All Downloads",

    // Settings - Appearance
    "settings.appearance.title": "Appearance",
    "settings.appearance.desc": "Customize MEVO's visual theme and interface behavior.",
    "settings.theme.label": "Theme",
    "settings.theme.dark": "Dark Emerald (Default)",
    "settings.theme.midnight": "Pure Dark / Midnight",
    "settings.theme.light": "Bright / Light",
    "settings.reduceMotion.label": "Reduce Motion",
    "settings.reduceMotion.desc": "Disable background ambient blooms and large UI transitions.",
    "settings.compactPlayer.label": "Compact Bottom Player",
    "settings.compactPlayer.desc": "Use a smaller fixed player panel on mobile.",

    // Settings - Content & Experience
    "settings.content.title": "Content & Experience",
    "settings.content.desc": "Privacy, explicit content, and notification permissions.",
    "settings.explicit.label": "Allow Explicit Content",
    "settings.explicit.desc": "Play songs containing explicit language tags.",
    "settings.listeningActivity.label": "Show Listening Activity",
    "settings.listeningActivity.desc": "Save played tracks to your Recently Played history.",
    "settings.privateSession.label": "Private Session",
    "settings.privateSession.desc": "Temporarily pause recording your listening history.",
    "settings.notifications.label": "Notifications",
    "settings.notifications.desc": "Receive updates for new releases and charts.",
    "settings.notifications.blocked": "Notifications are blocked in your browser settings.",
    "settings.enable": "Enable",
    "settings.enabled": "Enabled",
    "settings.blocked": "Blocked",

    // Settings - Language
    "settings.language.title": "Language",
    "settings.language.desc": "Select app interface language.",
    "settings.appLanguage.label": "App Language",

    // Settings - History & Privacy
    "settings.historyPrivacy.title": "History & Privacy",
    "settings.historyPrivacy.desc": "Manage local data and listening records.",
    "settings.clearHistory": "Clear Listening History",
    "settings.clearSearch": "Clear Search History",
    "settings.clearPositions": "Clear Playback Positions",
    "settings.clearArtwork": "Clear Artwork Cache",

    // Settings - Reset & Legal
    "settings.reset.title": "Reset to Defaults",
    "settings.reset.desc":
      "Restore all audio, streaming, and display preferences to factory settings.",
    "settings.resetButton": "Reset All Preferences",
    "settings.aboutMevo": "About MEVO",
    "settings.supportFaq": "Support & FAQ",
    "settings.terms": "Terms of Service",
    "settings.privacy": "Privacy Policy",
    "settings.contact": "Contact Us",
  },
  bn: {
    // Navigation
    "nav.home": "হোম",
    "nav.trending": "ট্রেন্ডিং",
    "nav.allSongs": "সব গান",
    "nav.albums": "অ্যালবাম",
    "nav.artists": "শিল্পী",
    "nav.downloads": "ডাউনলোড",
    "nav.favorites": "প্রিয় গান",
    "nav.recentlyPlayed": "সম্প্রতি বাজানো",
    "nav.library": "লাইব্রেরি",
    "nav.settings": "সেটিংস",
    "nav.about": "MEVO সম্পর্কে",
    "nav.search": "খুঁজুন",
    "nav.searchPlaceholder": "গান, শিল্পী, অ্যালবাম খুঁজুন...",
    "search.recentSearches": "সাম্প্রতিক অনুসন্ধান",
    "search.clearAll": "সব মুছুন",
    "search.noRecent": "কোন সাম্প্রতিক অনুসন্ধান নেই",

    // Player Controls & Labels
    "player.playingFrom": "চলছে",
    "player.lyrics": "লিরিক্স",
    "player.upNext": "পরবর্তী গান",
    "player.seeAll": "সব দেখুন",
    "player.clear": "মুছুন",
    "player.queue": "কিউ",
    "player.noLyrics": "এই গানের কোন লিরিক্স পাওয়া যায়নি।",
    "player.nowPlaying": "এখন বাজছে",
    "player.autoplay": "অটো-প্লে",
    "player.shuffle": "শাফল",
    "player.repeat": "রিপিট",
    "player.repeatOff": "রিপিট বন্ধ",
    "player.repeatAll": "সব রিপিট",
    "player.repeatOne": "একটি রিপিট",

    // Settings Header
    "settings.eyebrow": "পছন্দসমূহ",
    "settings.title": "সেটিংস",
    "settings.subtitle": "প্লেব্যাক, অডিও কোয়ালিটি, স্টোরেজ এবং অ্যাপ পছন্দসমূহ পরিচালনা করুন।",

    // Settings - Playback
    "settings.playback.title": "প্লেব্যাক",
    "settings.playback.desc": "ট্র্যাকের ট্রানজিশন, রিস্টার্ট এবং কিউ পছন্দসমূহ পরিচালনা করুন।",
    "settings.autoplay.label": "অটো-প্লে",
    "settings.autoplay.desc": "কিউ শেষ হলে অনুরূপ গান বাজানো চালিয়ে যান।",
    "settings.crossfade.label": "ক্রসফেড",
    "settings.crossfade.desc": "ট্র্যাক পরিবর্তনের সময় মসৃণ ভলিউম ফেড প্রয়োগ করুন।",
    "settings.gapless.label": "গ্যাপলেস প্লেব্যাক",
    "settings.gapless.desc": "নিরবচ্ছিন্ন ট্র্যাকগুলির মধ্যবর্তী বিরতি বাদ দিন।",
    "settings.normalization.label": "ভলিউম স্বাভাবিককরণ",
    "settings.normalization.desc":
      "বিভিন্ন গানের মধ্যে সমান ও সামঞ্জস্যপূর্ণ শব্দমাত্রা বজায় রাখুন।",
    "settings.rememberPosition.label": "প্লেব্যাক পজিশন মনে রাখুন",
    "settings.rememberPosition.desc": "শেষ যেখানে থেমেছিলেন সেখান থেকেই গান চালু করুন।",

    // Settings - Audio Quality
    "settings.audioQuality.title": "অডিও কোয়ালিটি",
    "settings.audioQuality.desc": "স্ট্রিমিং বিটরেট এবং ডাউনলোড কোয়ালিটি নির্ধারণ করুন।",
    "settings.streamingQuality.label": "স্ট্রিমিং কোয়ালিটি",
    "settings.streamingQuality.desc": "উচ্চতর বিটরেট স্বচ্ছ ও নিখুঁত শব্দ সরবরাহ করে।",
    "settings.downloadQuality.label": "ডাউনলোড কোয়ালিটি",
    "settings.downloadQuality.desc": "অফলাইনে সংরক্ষিত ট্র্যাকগুলির অডিও কোয়ালিটি।",

    // Settings - Storage
    "settings.storage.title": "স্টোরেজ ও ডাউনলোড",
    "settings.storage.desc": "ডাউনলোড করা ট্র্যাক এবং ক্যাশ স্টোরেজ পরিচালনা করুন।",
    "settings.downloadedTracks": "ডাউনলোড করা গান",
    "settings.storageUsed": "ব্যবহৃত স্টোরেজ",
    "settings.clearDownloads": "সমস্ত ডাউনলোড মুছুন",

    // Settings - Appearance
    "settings.appearance.title": "রূপরেখা",
    "settings.appearance.desc": "MEVO-র ভিজ্যুয়াল থিম ও ইন্টারফেসের আচরণ কাস্টমাইজ করুন।",
    "settings.theme.label": "থিম",
    "settings.theme.dark": "ডার্ক এমারেল্ড (ডিফল্ট)",
    "settings.theme.midnight": "মিডনাইট ডার্ক",
    "settings.theme.light": "উজ্জ্বল / লাইট",
    "settings.reduceMotion.label": "মোশন হ্রাস করুন",
    "settings.reduceMotion.desc": "ব্যাকগ্রাউন্ড অ্যানিমেশন ও বড় ট্রানজিশন বন্ধ করুন।",
    "settings.compactPlayer.label": "কমপ্যাক্ট বটম প্লেয়ার",
    "settings.compactPlayer.desc": "মোবাইলে একটি ছোট আকারের প্লেয়ার বার ব্যবহার করুন।",

    // Settings - Content & Experience
    "settings.content.title": "বিষয়বস্তু ও অভিজ্ঞতা",
    "settings.content.desc": "গোপনীয়তা, স্পষ্ট বিষয়বস্তু এবং নোটিফিকেশন অনুমতি।",
    "settings.explicit.label": "স্পষ্ট বিষয়বস্তুর অনুমতি দিন",
    "settings.explicit.desc": "স্পষ্ট ভাষার ট্যাগযুক্ত গানগুলো চালু করার অনুমতি দিন।",
    "settings.listeningActivity.label": "শোনার কার্যকলাপ দেখান",
    "settings.listeningActivity.desc": "বাজানো গানগুলি আপনার সম্প্রতি বাজানো ইতিহাসে সংরক্ষণ করুন।",
    "settings.privateSession.label": "ব্যক্তিগত সেশন",
    "settings.privateSession.desc": "সাময়িকভাবে শোনার ইতিহাস সংরক্ষণ বন্ধ রাখুন।",
    "settings.notifications.label": "নোটিফিকেশন",
    "settings.notifications.desc": "নতুন রিলিজ এবং চার্ট আপডেটের নোটিফিকেশন পান।",
    "settings.notifications.blocked": "আপনার ব্রাউজার সেটিংসে নোটিফিকেশন অবরুদ্ধ আছে।",
    "settings.enable": "সক্রিয় করুন",
    "settings.enabled": "সক্রিয়",
    "settings.blocked": "অবরুদ্ধ",

    // Settings - Language
    "settings.language.title": "ভাষা",
    "settings.language.desc": "অ্যাপের ইন্টারফেস ভাষা নির্বাচন করুন।",
    "settings.appLanguage.label": "অ্যাপের ভাষা",

    // Settings - History & Privacy
    "settings.historyPrivacy.title": "ইতিহাস ও গোপনীয়তা",
    "settings.historyPrivacy.desc": "স্থানীয় ডেটা এবং শোনার রেকর্ড পরিচালনা করুন।",
    "settings.clearHistory": "শোনার ইতিহাস মুছুন",
    "settings.clearSearch": "অনুসন্ধানের ইতিহাস মুছুন",
    "settings.clearPositions": "প্লেব্যাক পজিশন মুছুন",
    "settings.clearArtwork": "আর্টওয়ার্ক ক্যাশ মুছুন",

    // Settings - Reset & Legal
    "settings.reset.title": "ডিফল্টে রিসেট করুন",
    "settings.reset.desc": "সমস্ত পছন্দসমূহ পূর্বাবস্থায় ফিরিয়ে আনুন।",
    "settings.resetButton": "সমস্ত পছন্দসমূহ রিসেট করুন",
    "settings.aboutMevo": "MEVO সম্পর্কে",
    "settings.supportFaq": "সাপোর্ট ও জিজ্ঞাসা",
    "settings.terms": "সেবার শর্তাবলী",
    "settings.privacy": "গোপনীয়তা নীতি",
    "settings.contact": "যোগাযোগ করুন",
  },
};

export function getTranslation(key: string, lang: Language = "en"): string {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}
