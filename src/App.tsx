import { AlertCircle, Loader2, Mic, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiIntegrationSection } from "./components/ApiIntegrationSection";
import { BatchProcessor } from "./components/BatchProcessor";
import { TakeHistory } from "./components/TakeHistory";
import { VoicePresetPanel } from "./components/VoicePresetPanel";
import { VoiceStyleMatcher } from "./components/VoiceStyleMatcher";
import { WaveformPlayer } from "./components/WaveformPlayer";
import {
  DELIVERY_PRESETS,
  SAMPLE_SCRIPTS,
  UPLOADED_VOICE_SAMPLE_URL,
  USER_MATCHED_PROFILE,
  VOICE_PERSONAS,
  type GeneratedTake,
  type LanguageRegister,
  type MatchedVoiceProfile,
  type SavedCustomPreset,
  type StudioMode,
  type VoiceEngine,
  type VoiceLanguage,
} from "./types/voiceover";

const STORAGE_PRESETS_KEY = "kotha_studio_custom_presets_v1";
const STORAGE_DRAFT_KEY = "kotha_studio_script_draft_v1";
const STORAGE_MATCHED_PROFILE_KEY = "kotha_studio_matched_profile_v1";

function base64ToWavUrl(base64: string): string {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function loadStoredMatchedProfile(): MatchedVoiceProfile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_MATCHED_PROFILE_KEY);
    if (raw === "null") return null;
    if (raw) return JSON.parse(raw) as MatchedVoiceProfile;
  } catch {
    // ignore storage errors
  }
  return USER_MATCHED_PROFILE;
}

export default function App() {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const initialMatched = useMemo(() => loadStoredMatchedProfile(), []);

  const [mode, setMode] = useState<StudioMode>("single");
  const [language, setLanguage] = useState<VoiceLanguage>(
    initialMatched?.recommendedLanguage ?? "bn"
  );
  const [engine, setEngine] = useState<VoiceEngine>("expressive");
  const [voiceName, setVoiceName] = useState<string>(
    initialMatched?.recommendedVoice ?? USER_MATCHED_PROFILE.recommendedVoice
  );
  const [speakerAName, setSpeakerAName] = useState<string>("আরিফ");
  const [speakerAVoice, setSpeakerAVoice] = useState<string>("Puck");
  const [speakerBName, setSpeakerBName] = useState<string>("তানিয়া");
  const [speakerBVoice, setSpeakerBVoice] = useState<string>("Kore");

  const [selectedPresetId, setSelectedPresetId] = useState<string>("storytelling");
  const [register, setRegister] = useState<LanguageRegister>(
    initialMatched?.register ?? USER_MATCHED_PROFILE.register
  );
  const [customStylePrompt, setCustomStylePrompt] = useState<string>(
    initialMatched?.stylePrompt ?? USER_MATCHED_PROFILE.stylePrompt
  );

  const [script, setScript] = useState<string>(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_DRAFT_KEY);
      return saved !== null && saved.trim().length > 0 ? saved : SAMPLE_SCRIPTS[0].text;
    } catch {
      return SAMPLE_SCRIPTS[0].text;
    }
  });
  const [previousScript, setPreviousScript] = useState<string | null>(null);
  const [coachingNote, setCoachingNote] = useState<{
    detectedInput: string;
    note: string;
  } | null>(null);

  const [isNaturalizing, setIsNaturalizing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [takes, setTakes] = useState<GeneratedTake[]>([]);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<MatchedVoiceProfile | null>(initialMatched);
  const [volumeGain, setVolumeGain] = useState<number>(1);
  const [normalize, setNormalize] = useState<boolean>(true);
  const [trimSilence, setTrimSilence] = useState<boolean>(true);

  const [savedPresets, setSavedPresets] = useState<SavedCustomPreset[]>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_PRESETS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedCustomPreset[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_DRAFT_KEY, script);
    } catch {
      // ignore quota errors
    }
  }, [script]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(savedPresets));
    } catch {
      // ignore quota errors
    }
  }, [savedPresets]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_MATCHED_PROFILE_KEY,
        matchedProfile ? JSON.stringify(matchedProfile) : "null"
      );
    } catch {
      // ignore quota errors
    }
  }, [matchedProfile]);

  // Revoke any remaining blob URLs on unmount
  const takesRef = useRef<GeneratedTake[]>([]);
  takesRef.current = takes;
  useEffect(() => {
    return () => {
      takesRef.current.forEach((t) => URL.revokeObjectURL(t.audioUrl));
    };
  }, []);

  const activeTake = useMemo(
    () => takes.find((t) => t.id === activeTakeId) ?? null,
    [takes, activeTakeId]
  );

  const stats = useMemo(() => {
    const trimmed = script.trim();
    const chars = script.length;
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const estSeconds = Math.max(0, Math.round(words * 0.42));
    return { chars, words, estSeconds };
  }, [script]);

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    setMatchedProfile(null);
    const preset = DELIVERY_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setRegister(preset.register);
      setCustomStylePrompt(preset.stylePrompt);
    }
  };

  const handleProfileMatched = (profile: MatchedVoiceProfile) => {
    setMatchedProfile(profile);
    setMode("single");
    setEngine("expressive");
    setVoiceName(profile.recommendedVoice);
    if (profile.recommendedLanguage) {
      setLanguage(profile.recommendedLanguage);
    }
    setRegister(profile.register);
    setCustomStylePrompt(profile.stylePrompt);
  };

  const handleClearMatchedProfile = () => {
    setMatchedProfile(null);
    const preset = DELIVERY_PRESETS.find((p) => p.id === selectedPresetId);
    if (preset) {
      setRegister(preset.register);
      setCustomStylePrompt(preset.stylePrompt);
    }
  };

  const handleSaveCustomPreset = (name: string) => {
    const newPreset: SavedCustomPreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      mode,
      language,
      engine,
      voiceName,
      register,
      stylePrompt: customStylePrompt,
      volumeGain,
      normalize,
      trimSilence,
    };
    setSavedPresets((prev) => [newPreset, ...prev]);
  };

  const handleApplySavedPreset = (preset: SavedCustomPreset) => {
    setMode(preset.mode);
    setLanguage(preset.language ?? "bn");
    setEngine(preset.engine);
    setVoiceName(preset.voiceName);
    setRegister(preset.register);
    setCustomStylePrompt(preset.stylePrompt);
    setVolumeGain(preset.volumeGain);
    setNormalize(preset.normalize);
    setTrimSilence(preset.trimSilence);
    setMatchedProfile(null);
  };

  const handleDeleteSavedPreset = (id: string) => {
    setSavedPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const handleLoadSample = (sampleId: string) => {
    const sample = SAMPLE_SCRIPTS.find((s) => s.id === sampleId);
    if (!sample) return;
    setMode(sample.mode);
    setLanguage(sample.language);
    if (sample.speakerAName) setSpeakerAName(sample.speakerAName);
    if (sample.speakerBName) setSpeakerBName(sample.speakerBName);
    if (sample.speakerAVoice) setSpeakerAVoice(sample.speakerAVoice);
    if (sample.speakerBVoice) setSpeakerBVoice(sample.speakerBVoice);
    setScript(sample.text);
    setPreviousScript(null);
    handleSelectPreset(sample.presetId);
    setCoachingNote(null);
    setErrorMessage(null);
  };

  const handleInsertCue = (cue: string) => {
    const textarea = editorRef.current;
    if (!textarea) {
      setScript((prev) => (prev ? `${prev} ${cue}` : cue));
      return;
    }
    const start = textarea.selectionStart ?? script.length;
    const end = textarea.selectionEnd ?? script.length;
    const before = script.slice(0, start);
    const after = script.slice(end);
    const spacerBefore = before.length > 0 && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
    const spacerAfter = after.length > 0 && !after.startsWith(" ") && !after.startsWith("\n") ? " " : "";
    const next = `${before}${spacerBefore}${cue}${spacerAfter}${after}`;
    setScript(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = before.length + spacerBefore.length + cue.length + spacerAfter.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const handleNaturalize = async () => {
    if (!script.trim()) {
      setErrorMessage("Please enter Bengali, Banglish, or English text to naturalize.");
      return;
    }
    setErrorMessage(null);
    setIsNaturalizing(true);

    try {
      const preset = DELIVERY_PRESETS.find((p) => p.id === selectedPresetId);
      const response = await fetch("/api/naturalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: script,
          mode,
          language,
          styleLabel: preset?.label ?? "Natural Conversational",
          register,
          speakerAName: speakerAName.trim() || (language === "en" ? "Alex" : "আরিফ"),
          speakerBName: speakerBName.trim() || (language === "en" ? "Maya" : "তানিয়া"),
          allowExpressiveTags: mode === "dual" || engine === "expressive",
        }),
      });

      const data = (await response.json()) as {
        script?: string;
        detectedInput?: string;
        coachingNote?: string;
        error?: string;
      };

      if (!response.ok || !data.script) {
        throw new Error(data.error || "Failed to polish script for voiceover.");
      }

      setPreviousScript(script);
      setScript(data.script);
      setCoachingNote({
        detectedInput: data.detectedInput || "Bengali",
        note: data.coachingNote || "Polished for natural spoken cadence.",
      });
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not naturalize script. Please try again."
      );
    } finally {
      setIsNaturalizing(false);
    }
  };

  const handleGenerateVoiceover = async () => {
    if (!script.trim()) {
      setErrorMessage("Please enter a script before generating a voiceover.");
      editorRef.current?.focus();
      return;
    }
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const preset = DELIVERY_PRESETS.find((p) => p.id === selectedPresetId);
      const response = await fetch("/api/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script,
          mode,
          language,
          engine,
          voiceName,
          speakerAVoice,
          speakerBVoice,
          speakerAName: speakerAName.trim() || (language === "en" ? "Alex" : "আরিফ"),
          speakerBName: speakerBName.trim() || (language === "en" ? "Maya" : "তানিয়া"),
          stylePrompt: customStylePrompt.trim() || preset?.stylePrompt || "",
        }),
      });

      const data = (await response.json()) as {
        audioBase64?: string;
        modelUsed?: string;
        error?: string;
      };

      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || "Failed to generate Bengali voiceover audio.");
      }

      const audioUrl = base64ToWavUrl(data.audioBase64);
      const cleanPreview = script
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      const title = cleanPreview.length > 52 ? `${cleanPreview.slice(0, 52)}...` : cleanPreview;

      const now = new Date();
      const timeLabel = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const newTake: GeneratedTake = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: title || "Bengali Voiceover",
        script,
        mode,
        engine: mode === "dual" ? "expressive" : engine,
        modelUsed: data.modelUsed || "gemini-3.8-flash-tts",
        voiceName,
        speakerAVoice: mode === "dual" ? speakerAVoice : undefined,
        speakerBVoice: mode === "dual" ? speakerBVoice : undefined,
        styleLabel: matchedProfile
          ? matchedProfile.voiceProfileName
          : preset?.bengaliLabel ?? "কাস্টম স্টাইল",
        audioUrl,
        durationSec: stats.estSeconds,
        createdAt: timeLabel,
      };

      setTakes((prev) => [newTake, ...prev]);
      setActiveTakeId(newTake.id);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Voiceover generation failed. Please try again."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDurationDetected = (takeId: string, durationSec: number) => {
    setTakes((prev) =>
      prev.map((t) => (t.id === takeId ? { ...t, durationSec } : t))
    );
  };

  const handleDeleteTake = (id: string) => {
    setTakes((prev) => {
      const target = prev.find((t) => t.id === id);
      if (target) {
        URL.revokeObjectURL(target.audioUrl);
      }
      const next = prev.filter((t) => t.id !== id);
      if (activeTakeId === id) {
        setActiveTakeId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-6 py-3.5">
          <a
            href="#studio-top"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Kotha Studio
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => {
                setMode("single");
                scrollToSection("studio-top");
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === "single" ? "text-slate-900" : ""
              }`}
            >
              Narrator Studio
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("dual");
                scrollToSection("studio-top");
              }}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === "dual" ? "text-slate-900" : ""
              }`}
            >
              Dialogue Mode
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("batch-section")}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Batch Queue
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("voice-match-section")}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Voice Match
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("takes-section")}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Saved Takes
            </button>
            <button
              type="button"
              onClick={() => scrollToSection("api-integration-section")}
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              AI API
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => void handleGenerateVoiceover()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {isGenerating ? "Generating..." : "Generate Voiceover"}
            </button>
          </div>
        </div>
      </header>

      <main id="studio-top" className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8 space-y-8">
        {/* Studio Intro */}
        <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-700 mb-1.5">
              Bengali Voiceover &amp; Dialogue Workbench
            </p>
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 font-bengali"
              style={{ textWrap: "balance", fontFamily: "var(--font-display)" }}
            >
              বাংলা ও ইংরেজিতে স্বাভাবিক পুরুষ ও নারী ভয়েসওভার স্টুডিও
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Generate natural Bengali and English voiceovers with Male &amp; Female narrators or
              two-speaker dialogues. Write in Bengali script, Banglish, or English and switch
              languages anytime.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 shrink-0">
            <span>24 kHz Studio WAV</span>
            <span aria-hidden="true">·</span>
            <span>Bangla &amp; English</span>
            <span aria-hidden="true">·</span>
            <span>Male &amp; Female Cast</span>
          </div>
        </section>

        {/* Error Notification */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-xs font-medium text-red-700 hover:text-red-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main 2-Column Studio Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Script Editor + Waveform Player */}
          <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Mode & Sample Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3.5">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === "single"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Single Narrator
                </button>
                <button
                  type="button"
                  onClick={() => setMode("dual")}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mode === "dual"
                      ? "bg-white text-slate-900 shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Dual-Speaker Podcast
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 mr-1">Samples:</span>
                {SAMPLE_SCRIPTS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleLoadSample(sample.id)}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors font-bengali whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {sample.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor Area */}
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="voiceover-script"
                  className="text-xs font-semibold text-slate-700"
                >
                  {mode === "dual"
                    ? `Dialogue Script (use "${speakerAName || (language === "en" ? "Alex" : "আরিফ")}:" and "${speakerBName || (language === "en" ? "Maya" : "তানিয়া")}:" per line)`
                    : language === "en"
                      ? "Voiceover Script (Natural English)"
                      : "Voiceover Script (বাংলা, Banglish, or English)"}
                </label>
                <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
                  <span>{stats.words} words</span>
                  <span aria-hidden="true">·</span>
                  <span>{stats.chars} chars</span>
                  <span aria-hidden="true">·</span>
                  <span>~{stats.estSeconds}s</span>
                </div>
              </div>

              <textarea
                id="voiceover-script"
                ref={editorRef}
                rows={8}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                placeholder={
                  mode === "dual"
                    ? language === "en"
                      ? `${speakerAName || "Alex"}: Welcome back to the studio!\n${speakerBName || "Maya"}: <breath> Thanks, excited to dive into today's story.`
                      : `${speakerAName || "আরিফ"}: আজকের পর্বে সবাইকে স্বাগতম!\n${speakerBName || "তানিয়া"}: <breath> একদম ঠিক, আজ আমরা দারুণ একটা বিষয় নিয়ে কথা বলব।`
                    : language === "en"
                      ? "Write your English narration script here..."
                      : "এখানে আপনার বাংলা টেক্সট লিখুন, অথবা Banglish-এ লিখুন (যেমন: Ajke amra ekta notun golpo shunbo)..."
                }
                className="w-full rounded-lg border border-slate-200 bg-slate-50/40 px-4 py-3.5 text-[16px] leading-relaxed text-slate-900 font-bengali placeholder:text-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none resize-y"
              />

              {/* Naturalizer Feedback */}
              {coachingNote && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-emerald-700">
                      Polished from {coachingNote.detectedInput}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{coachingNote.note}</span>
                  </div>
                  {previousScript !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setScript(previousScript);
                        setPreviousScript(null);
                        setCoachingNote(null);
                      }}
                      className="text-xs font-medium text-blue-700 hover:text-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Undo Naturalize
                    </button>
                  )}
                </div>
              )}

              {/* Editor Actions */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(mode === "dual" || engine === "expressive") && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleInsertCue("<breath>")}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        + &lt;breath&gt;
                      </button>
                      <button
                        type="button"
                        onClick={() => handleInsertCue("<laugh>")}
                        className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-mono text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        + &lt;laugh&gt;
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleInsertCue("।")}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bengali text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    + দাঁড়ি (।)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScript("");
                      setCoachingNote(null);
                      editorRef.current?.focus();
                    }}
                    className="rounded-md px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isNaturalizing || isGenerating}
                    onClick={() => void handleNaturalize()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isNaturalizing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-700" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-blue-700" />
                    )}
                    {isNaturalizing
                      ? "Polishing Script..."
                      : language === "en"
                        ? "Naturalize to Spoken English"
                        : language === "bilingual"
                          ? "Naturalize Bilingual Script"
                          : "Naturalize to Spoken Bangla"}
                  </button>

                  <button
                    type="button"
                    disabled={isGenerating || isNaturalizing}
                    onClick={() => void handleGenerateVoiceover()}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Mic className="h-3.5 w-3.5" />
                    )}
                    {isGenerating ? "Generating Audio..." : "Generate Voiceover"}
                  </button>
                </div>
              </div>
            </div>

            {/* Docked Waveform Player */}
            <WaveformPlayer
              take={activeTake}
              isGenerating={isGenerating}
              volumeGain={volumeGain}
              normalize={normalize}
              trimSilence={trimSilence}
              onDurationDetected={handleDurationDetected}
            />
          </div>

          {/* Right Column: Voice & Direction Panel */}
          <div className="lg:col-span-4">
            <VoicePresetPanel
              mode={mode}
              language={language}
              onLanguageChange={setLanguage}
              engine={engine}
              onEngineChange={setEngine}
              voiceName={voiceName}
              onVoiceNameChange={setVoiceName}
              speakerAName={speakerAName}
              onSpeakerANameChange={setSpeakerAName}
              speakerAVoice={speakerAVoice}
              onSpeakerAVoiceChange={setSpeakerAVoice}
              speakerBName={speakerBName}
              onSpeakerBNameChange={setSpeakerBName}
              speakerBVoice={speakerBVoice}
              onSpeakerBVoiceChange={setSpeakerBVoice}
              selectedPresetId={selectedPresetId}
              onSelectPreset={handleSelectPreset}
              register={register}
              onRegisterChange={setRegister}
              customStylePrompt={customStylePrompt}
              onCustomStylePromptChange={setCustomStylePrompt}
              volumeGain={volumeGain}
              onVolumeGainChange={setVolumeGain}
              normalize={normalize}
              onNormalizeChange={setNormalize}
              trimSilence={trimSilence}
              onTrimSilenceChange={setTrimSilence}
              savedPresets={savedPresets}
              onSavePreset={handleSaveCustomPreset}
              onApplySavedPreset={handleApplySavedPreset}
              onDeleteSavedPreset={handleDeleteSavedPreset}
            />
          </div>
        </div>

        {/* Batch Voiceover Processing */}
        <BatchProcessor
          mode={mode}
          language={language}
          engine={engine}
          voiceName={voiceName}
          speakerAName={speakerAName}
          speakerBName={speakerBName}
          speakerAVoice={speakerAVoice}
          speakerBVoice={speakerBVoice}
          register={register}
          stylePrompt={
            customStylePrompt.trim() ||
            DELIVERY_PRESETS.find((p) => p.id === selectedPresetId)?.stylePrompt ||
            ""
          }
          activeStyleLabel={
            matchedProfile?.voiceProfileName ||
            DELIVERY_PRESETS.find((p) => p.id === selectedPresetId)?.bengaliLabel ||
            "Custom Style"
          }
          volumeGain={volumeGain}
          normalize={normalize}
          trimSilence={trimSilence}
        />

        {/* Voice Style Matcher (Record / Upload Voice Sample) */}
        <VoiceStyleMatcher
          activeProfile={matchedProfile}
          defaultSampleUrl={UPLOADED_VOICE_SAMPLE_URL}
          defaultSampleName="rule-01-voice_1cb2965a.mp3"
          onProfileMatched={handleProfileMatched}
          onClearProfile={handleClearMatchedProfile}
        />

        {/* Voice Cast Overview */}
        <section id="voices-section" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Studio Voice Cast (পুরুষ ও নারী)
            </h2>
            <span className="text-xs text-slate-500">
              All 5 Male &amp; Female voices work naturally in both Bengali and English
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {VOICE_PERSONAS.map((persona) => {
              const isSelected = mode === "single" && voiceName === persona.id;
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => {
                    setMode("single");
                    setVoiceName(persona.id);
                    scrollToSection("studio-top");
                  }}
                  className={`text-left rounded-xl border p-4 transition-colors cursor-pointer ${
                    isSelected
                      ? "border-blue-700 bg-blue-50/40"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <p className="text-xs font-medium text-blue-700 font-bengali">
                    {persona.genderLabel}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 font-bengali">
                    {persona.bengaliLabel}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">{persona.character}</p>
                  <p className="mt-2 text-xs text-slate-500">{persona.bestFor}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Recorded Takes History */}
        <TakeHistory
          takes={takes}
          activeTakeId={activeTakeId}
          volumeGain={volumeGain}
          normalize={normalize}
          trimSilence={trimSilence}
          onSelectTake={(take) => {
            setActiveTakeId(take.id);
            scrollToSection("studio-top");
          }}
          onLoadScript={(take) => {
            setMode(take.mode);
            setEngine(take.engine);
            setVoiceName(take.voiceName);
            if (take.speakerAVoice) setSpeakerAVoice(take.speakerAVoice);
            if (take.speakerBVoice) setSpeakerBVoice(take.speakerBVoice);
            setScript(take.script);
            scrollToSection("studio-top");
            editorRef.current?.focus();
          }}
          onDeleteTake={handleDeleteTake}
          onFocusEditor={() => {
            scrollToSection("studio-top");
            editorRef.current?.focus();
          }}
        />

        {/* External AI & API Integration */}
        <ApiIntegrationSection
          script={script}
          mode={mode}
          language={language}
          engine={engine}
          voiceName={voiceName}
          speakerAName={speakerAName}
          speakerBName={speakerBName}
          speakerAVoice={speakerAVoice}
          speakerBVoice={speakerBVoice}
          stylePrompt={
            customStylePrompt.trim() ||
            DELIVERY_PRESETS.find((p) => p.id === selectedPresetId)?.stylePrompt ||
            ""
          }
          volumeGain={volumeGain}
          normalize={normalize}
          trimSilence={trimSilence}
        />
      </main>

      <footer className="border-t border-slate-200 bg-white py-5 px-6 mt-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Kotha Studio — Natural Bengali Voiceover Workbench</span>
          <span>24 kHz Mono WAV Export · Single Narrator &amp; Dual-Speaker Dialogue</span>
        </div>
      </footer>
    </div>
  );
}
