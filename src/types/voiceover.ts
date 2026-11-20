export type StudioMode = "single" | "dual";
export type VoiceEngine = "expressive" | "fast";
export type LanguageRegister = "colloquial" | "standard" | "warm";
export type VoiceLanguage = "bn" | "en" | "bilingual";

export interface VoicePersona {
  id: "Kore" | "Puck" | "Charon" | "Fenrir" | "Zephyr";
  name: string;
  gender: "male" | "female";
  genderLabel: string;
  bengaliLabel: string;
  character: string;
  timbre: string;
  bestFor: string;
}

export interface DeliveryPreset {
  id: string;
  label: string;
  bengaliLabel: string;
  register: LanguageRegister;
  stylePrompt: string;
}

export interface MatchedVoiceProfile {
  recommendedVoice: VoicePersona["id"];
  voiceProfileName: string;
  stylePrompt: string;
  register: LanguageRegister;
  recommendedLanguage?: VoiceLanguage;
  traitsSummary: string;
}

export const UPLOADED_VOICE_SAMPLE_URL = "/assets/aistudio/rule-01-voice_1cb2965a.mp3";

export const USER_MATCHED_PROFILE: MatchedVoiceProfile = {
  recommendedVoice: "Charon",
  voiceProfileName: "Reflective Bengali Book Narrator",
  register: "warm",
  traitsSummary:
    "Warm mid-baritone · measured storytelling pace · thoughtful question pauses · Dhaka standard-colloquial Bangla",
  stylePrompt:
    "Speak as a calm, warm, grounded Bengali male book narrator with a rich mid-baritone timbre. Maintain an unhurried, deliberate storytelling pace with thoughtful pauses after rhetorical questions and numbered takeaways. Articulate clearly in natural Dhaka standard-colloquial Bangla, blending any English terms smoothly into the Bengali rhythm with empathetic, reassuring warmth.",
};

export interface SampleScript {
  id: string;
  title: string;
  category: string;
  mode: StudioMode;
  language: VoiceLanguage;
  presetId: string;
  speakerAName?: string;
  speakerBName?: string;
  speakerAVoice?: VoicePersona["id"];
  speakerBVoice?: VoicePersona["id"];
  text: string;
}

export interface GeneratedTake {
  id: string;
  title: string;
  script: string;
  mode: StudioMode;
  engine: VoiceEngine;
  modelUsed: string;
  voiceName: string;
  speakerAVoice?: string;
  speakerBVoice?: string;
  styleLabel: string;
  audioUrl: string;
  durationSec: number;
  createdAt: string;
}

export type BatchItemStatus = "queued" | "generating" | "ready" | "error";

export interface BatchItem {
  id: string;
  title: string;
  script: string;
  status: BatchItemStatus;
  audioUrl?: string;
  durationSec?: number;
  modelUsed?: string;
  error?: string;
}

export interface SavedCustomPreset {
  id: string;
  name: string;
  mode: StudioMode;
  language?: VoiceLanguage;
  engine: VoiceEngine;
  voiceName: string;
  register: LanguageRegister;
  stylePrompt: string;
  volumeGain: number;
  normalize: boolean;
  trimSilence: boolean;
}

export const VOICE_PERSONAS: VoicePersona[] = [
  {
    id: "Kore",
    name: "Kore",
    gender: "female",
    genderLabel: "নারী · Female",
    bengaliLabel: "কোর — উষ্ণ ও স্পষ্ট",
    character: "Warm, articulate female voice",
    timbre: "Mid-bright, steady cadence",
    bestFor: "Storytelling, audiobooks, explainers",
  },
  {
    id: "Zephyr",
    name: "Zephyr",
    gender: "female",
    genderLabel: "নারী · Female",
    bengaliLabel: "জেফার — শান্ত ও স্নিগ্ধ",
    character: "Calm, soothing female voice",
    timbre: "Soft, unhurried, intimate",
    bestFor: "Poetry, late-night stories, calm narration",
  },
  {
    id: "Puck",
    name: "Puck",
    gender: "male",
    genderLabel: "পুরুষ · Male",
    bengaliLabel: "পাক — প্রাণবন্ত ও স্বতঃস্ফূর্ত",
    character: "Upbeat, conversational male voice",
    timbre: "Bright, energetic, friendly",
    bestFor: "YouTube videos, reels, casual podcasts",
  },
  {
    id: "Charon",
    name: "Charon",
    gender: "male",
    genderLabel: "পুরুষ · Male",
    bengaliLabel: "ক্যারন — গম্ভীর ও প্রামাণ্য",
    character: "Deep, grounded male narrator",
    timbre: "Rich low-mid resonance",
    bestFor: "Book summaries, documentaries, news",
  },
  {
    id: "Fenrir",
    name: "Fenrir",
    gender: "male",
    genderLabel: "পুরুষ · Male",
    bengaliLabel: "ফেনরির — দৃঢ় ও গতিশীল",
    character: "Crisp, expressive male voice",
    timbre: "Clear punchy articulation",
    bestFor: "Commercials, trailers, tech reviews",
  },
];

export const DELIVERY_PRESETS: DeliveryPreset[] = [
  {
    id: "conversational",
    label: "Natural Conversational",
    bengaliLabel: "স্বাভাবিক কথোপকথন",
    register: "colloquial",
    stylePrompt:
      "Warm, friendly, everyday conversational cadence. Sound like a real person talking naturally to a friend, with smooth phrasing and relaxed pauses.",
  },
  {
    id: "storytelling",
    label: "Storytelling & Audiobook",
    bengaliLabel: "গল্পপাঠ ও অডিওবুক",
    register: "warm",
    stylePrompt:
      "Expressive literary storyteller. Vary pitch gently for emotion, pause thoughtfully between sentences, and keep an engaging narrative flow.",
  },
  {
    id: "youtube",
    label: "YouTube & Reels",
    bengaliLabel: "ইউটিউব ও রিলস",
    register: "colloquial",
    stylePrompt:
      "Crisp, engaging content creator energy. Clear hook pacing, bright tone, confident emphasis on key phrases without sounding robotic.",
  },
  {
    id: "documentary",
    label: "Documentary",
    bengaliLabel: "ডকুমেন্টারি",
    register: "standard",
    stylePrompt:
      "Measured, cinematic documentary narrator. Authoritative yet empathetic, deliberate pacing, clear enunciation.",
  },
  {
    id: "news",
    label: "News Broadcast",
    bengaliLabel: "সংবাদ পাঠ",
    register: "standard",
    stylePrompt:
      "Polished, professional news anchor. Neutral authoritative tone, crisp syllable clarity, steady broadcast tempo.",
  },
  {
    id: "calm",
    label: "Calm & Poetic",
    bengaliLabel: "শান্ত ও কাব্যিক",
    register: "warm",
    stylePrompt:
      "Gentle, unhurried, soothing voiceover. Soft breathy warmth, poetic cadence, peaceful evening atmosphere.",
  },
];

export const SAMPLE_SCRIPTS: SampleScript[] = [
  {
    id: "bangla-story",
    title: "বাংলা গল্প (একক)",
    category: "Bangla Solo",
    mode: "single",
    language: "bn",
    presetId: "storytelling",
    text: "বাইরে তখন ঝমঝম করে বৃষ্টি পড়ছে। জানালার কাচে জমে থাকা বৃষ্টির ফোঁটাগুলোর দিকে তাকিয়ে রাহাত ভাবছিল, <breath> শহরের এই ব্যস্ত কোলাহলের মাঝেও কিছু মুহূর্ত কত শান্ত হতে পারে! হাতে এক কাপ গরম চা, আর পুরোনো দিনের সেই ফেলে আসা স্মৃতিগুলো যেন আবার জীবন্ত হয়ে উঠল।",
  },
  {
    id: "podcast-adda",
    title: "বাংলা পুরুষ ও নারী (২ জন)",
    category: "Bangla Dual",
    mode: "dual",
    language: "bn",
    presetId: "conversational",
    speakerAName: "আরিফ",
    speakerBName: "তানিয়া",
    speakerAVoice: "Puck",
    speakerBVoice: "Kore",
    text: "আরিফ: স্বাগতম আমাদের আজকের পডকাস্টে! তানিয়া, আজকাল তো দেখছি সবাই বাংলা কনটেন্টে ভয়েসওভার নিয়ে বেশ পরীক্ষা-নিরীক্ষা করছে।\nতানিয়া: একদম ঠিক বলেছ আরিফ। <breath> আগে মানুষ ভাবত শুধু ভারী স্টুডিও মাইক ছাড়া ভালো ভয়েসওভার হয় না, কিন্তু এখন স্বাভাবিক কথা বলার ভঙ্গিটাই শ্রোতাদের কাছে সবচেয়ে বেশি ভালো লাগে।\nআরিফ: <laugh> আসলেই তাই! কৃত্রিম শোনালে দর্শক আর বেশিক্ষণ শুনতে চায় না, কথায় প্রাণ থাকাটাই সবচেয়ে জরুরি।",
  },
  {
    id: "english-solo",
    title: "English Narration (Solo)",
    category: "English Solo",
    mode: "single",
    language: "en",
    presetId: "storytelling",
    text: "Most people think consistency requires giant bursts of motivation. <breath> In reality, it is built in quiet ten-minute pockets when nobody is watching. Open the page, write one honest paragraph, and let tomorrow thank you for showing up today.",
  },
  {
    id: "english-dual",
    title: "English Male & Female (2 Speakers)",
    category: "English Dual",
    mode: "dual",
    language: "en",
    presetId: "conversational",
    speakerAName: "Alex",
    speakerBName: "Maya",
    speakerAVoice: "Charon",
    speakerBVoice: "Kore",
    text: "Alex: Welcome back to the show, Maya. Today we are talking about why calm, natural storytelling beats loud editing every single time.\nMaya: <breath> Completely agree, Alex. When a voiceover sounds like a real conversation across a coffee table, listeners actually stay until the very last second.\nAlex: <laugh> Exactly—no artificial hype, just clarity and warmth.",
  },
  {
    id: "banglish-youtube",
    title: "Banglish → Bangla",
    category: "Banglish Input",
    mode: "single",
    language: "bn",
    presetId: "youtube",
    text: "Assalamualaikum bondhura, ajke amra kotha bolbo kivabe apni shudhu mobile phone diye professional quality video edit korte parben. Video-ta shesh porjonto dekhben, karon ajker tips-gulo apnar kaj onek shohoj kore dibe!",
  },
];

