import { BookmarkPlus, Trash2, Volume2 } from "lucide-react";
import { useState } from "react";
import {
  DELIVERY_PRESETS,
  VOICE_PERSONAS,
  type LanguageRegister,
  type SavedCustomPreset,
  type StudioMode,
  type VoiceEngine,
  type VoiceLanguage,
} from "../types/voiceover";
import { formatGainDb } from "../utils/wavGain";

interface VoicePresetPanelProps {
  mode: StudioMode;
  language: VoiceLanguage;
  onLanguageChange: (language: VoiceLanguage) => void;
  engine: VoiceEngine;
  onEngineChange: (engine: VoiceEngine) => void;
  voiceName: string;
  onVoiceNameChange: (id: string) => void;
  speakerAName: string;
  onSpeakerANameChange: (name: string) => void;
  speakerAVoice: string;
  onSpeakerAVoiceChange: (id: string) => void;
  speakerBName: string;
  onSpeakerBNameChange: (name: string) => void;
  speakerBVoice: string;
  onSpeakerBVoiceChange: (id: string) => void;
  selectedPresetId: string;
  onSelectPreset: (presetId: string) => void;
  register: LanguageRegister;
  onRegisterChange: (register: LanguageRegister) => void;
  customStylePrompt: string;
  onCustomStylePromptChange: (prompt: string) => void;
  volumeGain: number;
  onVolumeGainChange: (gain: number) => void;
  normalize: boolean;
  onNormalizeChange: (value: boolean) => void;
  trimSilence: boolean;
  onTrimSilenceChange: (value: boolean) => void;
  savedPresets: SavedCustomPreset[];
  onSavePreset: (name: string) => void;
  onApplySavedPreset: (preset: SavedCustomPreset) => void;
  onDeleteSavedPreset: (id: string) => void;
}

export function VoicePresetPanel({
  mode,
  language,
  onLanguageChange,
  engine,
  onEngineChange,
  voiceName,
  onVoiceNameChange,
  speakerAName,
  onSpeakerANameChange,
  speakerAVoice,
  onSpeakerAVoiceChange,
  speakerBName,
  onSpeakerBNameChange,
  speakerBVoice,
  onSpeakerBVoiceChange,
  selectedPresetId,
  onSelectPreset,
  register,
  onRegisterChange,
  customStylePrompt,
  onCustomStylePromptChange,
  volumeGain,
  onVolumeGainChange,
  normalize,
  onNormalizeChange,
  trimSilence,
  onTrimSilenceChange,
  savedPresets,
  onSavePreset,
  onApplySavedPreset,
  onDeleteSavedPreset,
}: VoicePresetPanelProps) {
  const [presetNameInput, setPresetNameInput] = useState("");
  return (
    <aside className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200">
      {/* Voice Language */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Voice Language (ভাষা)</h2>
          <span className="text-xs text-slate-500">Natural Native Flow</span>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { id: "bn", label: "বাংলা" },
              { id: "en", label: "English" },
              { id: "bilingual", label: "বাংলা + Eng" },
            ] as const
          ).map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => onLanguageChange(lang.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors font-bengali whitespace-nowrap shrink-0 cursor-pointer ${
                language === lang.id
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">
          {language === "en"
            ? "Generates natural spoken English for Male & Female voices."
            : language === "bilingual"
              ? "Blends spoken Bengali and English seamlessly in one voiceover."
              : "Generates natural spoken Bengali (চলিত, প্রমিত ও আবেগী)."}
        </p>
      </div>

      {/* Synthesis Engine */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Speech Engine</h2>
          <span className="text-xs font-mono text-slate-500">
            {mode === "dual" || engine === "expressive"
              ? "gemini-3.8-flash-tts"
              : "gemini-3.8-flash-lite-tts"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => onEngineChange("expressive")}
            className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              engine === "expressive" || mode === "dual"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Expressive Studio
          </button>
          <button
            type="button"
            disabled={mode === "dual"}
            onClick={() => onEngineChange("fast")}
            className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === "dual"
                ? "text-slate-400 cursor-not-allowed"
                : engine === "fast"
                  ? "bg-white text-slate-900 shadow-xs cursor-pointer"
                  : "text-slate-600 hover:text-slate-900 cursor-pointer"
            }`}
          >
            Fast Narrator
          </button>
        </div>
        <p className="mt-2.5 text-xs text-slate-500 leading-relaxed">
          {mode === "dual"
            ? "Dual-speaker dialogue automatically uses Expressive Studio for natural turn-taking and vocal cues."
            : engine === "expressive"
              ? "Best for natural storytelling, emotional inflection, and <breath>/<laugh> cues."
              : "Low-latency synthesis for crisp news, articles, and longer narration."}
        </p>
      </div>

      {/* Voice Cast */}
      <div className="p-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">
          {mode === "dual" ? "Speaker Cast (Male & Female)" : "Narrator Voice (পুরুষ ও নারী)"}
        </h2>

        {mode === "single" ? (
          <div className="space-y-1.5">
            {VOICE_PERSONAS.map((persona) => {
              const active = voiceName === persona.id;
              return (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => onVoiceNameChange(persona.id)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? "border-blue-700 bg-blue-50/50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 font-bengali">
                      {persona.bengaliLabel}
                    </span>
                    <span className="text-[11px] font-medium text-slate-500 shrink-0 font-bengali">
                      {persona.genderLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {persona.timbre} · {persona.bestFor}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onLanguageChange("bn");
                  onSpeakerANameChange("আরিফ");
                  onSpeakerAVoiceChange("Puck");
                  onSpeakerBNameChange("তানিয়া");
                  onSpeakerBVoiceChange("Kore");
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="block text-xs font-semibold text-slate-900 font-bengali">
                  বাংলা পুরুষ + নারী
                </span>
                <span className="block text-[11px] text-slate-500">
                  আরিফ (M) · তানিয়া (F)
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onLanguageChange("en");
                  onSpeakerANameChange("Alex");
                  onSpeakerAVoiceChange("Charon");
                  onSpeakerBNameChange("Maya");
                  onSpeakerBVoiceChange("Kore");
                }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <span className="block text-xs font-semibold text-slate-900">
                  English Male + Female
                </span>
                <span className="block text-[11px] text-slate-500">
                  Alex (M) · Maya (F)
                </span>
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Speaker 1 Name &amp; Voice
              </label>
              <div className="grid grid-cols-5 gap-2">
                <input
                  type="text"
                  value={speakerAName}
                  onChange={(e) => onSpeakerANameChange(e.target.value)}
                  placeholder={language === "en" ? "Alex" : "আরিফ"}
                  className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 font-bengali focus:border-blue-700 focus:outline-none"
                />
                <select
                  value={speakerAVoice}
                  onChange={(e) => onSpeakerAVoiceChange(e.target.value)}
                  className="col-span-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                >
                  {VOICE_PERSONAS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender === "male" ? "Male" : "Female"}) — {v.character}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-700">
                Speaker 2 Name &amp; Voice
              </label>
              <div className="grid grid-cols-5 gap-2">
                <input
                  type="text"
                  value={speakerBName}
                  onChange={(e) => onSpeakerBNameChange(e.target.value)}
                  placeholder={language === "en" ? "Maya" : "তানিয়া"}
                  className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 font-bengali focus:border-blue-700 focus:outline-none"
                />
                <select
                  value={speakerBVoice}
                  onChange={(e) => onSpeakerBVoiceChange(e.target.value)}
                  className="col-span-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                >
                  {VOICE_PERSONAS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.gender === "male" ? "Male" : "Female"}) — {v.character}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Register & Delivery Tone */}
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-900 mb-2">
            {language === "en" ? "Speaking Tone" : "Bengali Register (ভাষার ধরন)"}
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              language === "en"
                ? ([
                    { id: "colloquial", label: "Casual" },
                    { id: "standard", label: "Standard" },
                    { id: "warm", label: "Warm" },
                  ] as const)
                : ([
                    { id: "colloquial", label: "চলিত" },
                    { id: "standard", label: "প্রমিত" },
                    { id: "warm", label: "আবেগী" },
                  ] as const)
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onRegisterChange(opt.id)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors font-bengali whitespace-nowrap shrink-0 cursor-pointer ${
                  register === opt.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="delivery-preset"
            className="block text-sm font-semibold text-slate-900 mb-2"
          >
            Delivery Preset
          </label>
          <select
            id="delivery-preset"
            value={selectedPresetId}
            onChange={(e) => onSelectPreset(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 font-bengali focus:border-blue-700 focus:outline-none"
          >
            {DELIVERY_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.bengaliLabel} · {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="voice-direction"
            className="block text-xs font-medium text-slate-700 mb-1.5"
          >
            Voice Direction Prompt
          </label>
          <textarea
            id="voice-direction"
            rows={3}
            value={customStylePrompt}
            onChange={(e) => onCustomStylePromptChange(e.target.value)}
            placeholder="Describe pacing, warmth, or accent nuance..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-800 leading-relaxed focus:border-blue-700 focus:bg-white focus:outline-none resize-none"
          />
        </div>
      </div>

      {/* Output Volume Gain */}
      <div className="p-5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor="volume-gain-slider"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900"
          >
            <Volume2 className="h-4 w-4 text-slate-500" />
            Volume Gain
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono tabular-nums text-slate-700">
              {volumeGain.toFixed(2)}x ({formatGainDb(volumeGain)})
            </span>
            {Math.abs(volumeGain - 1) >= 0.01 && (
              <button
                type="button"
                onClick={() => onVolumeGainChange(1)}
                className="text-xs text-blue-700 hover:text-blue-800 font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <input
          id="volume-gain-slider"
          type="range"
          min={0.25}
          max={2}
          step={0.05}
          value={volumeGain}
          onChange={(e) => onVolumeGainChange(Number(e.target.value))}
          className="w-full accent-blue-700 cursor-pointer"
        />

        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
          <span>0.25x (-12 dB)</span>
          <span>1.00x (0 dB)</span>
          <span>2.00x (+6 dB)</span>
        </div>

        <div className="pt-2 space-y-2 border-t border-slate-100">
          <label className="flex items-center justify-between gap-2 text-xs text-slate-700 cursor-pointer">
            <span>Peak Normalize (-1 dB broadcast loudness)</span>
            <input
              type="checkbox"
              checked={normalize}
              onChange={(e) => onNormalizeChange(e.target.checked)}
              className="h-4 w-4 rounded accent-blue-700 cursor-pointer"
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-xs text-slate-700 cursor-pointer">
            <span>Trim Leading &amp; Trailing Silence</span>
            <input
              type="checkbox"
              checked={trimSilence}
              onChange={(e) => onTrimSilenceChange(e.target.checked)}
              className="h-4 w-4 rounded accent-blue-700 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Saved Custom Voice Presets */}
      <div className="p-5 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Saved Personal Presets</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = presetNameInput.trim();
            if (!trimmed) return;
            onSavePreset(trimmed);
            setPresetNameInput("");
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
            placeholder="Preset name (e.g. এক কাপ বই)"
            className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-900 font-bengali focus:border-blue-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!presetNameInput.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookmarkPlus className="h-3.5 w-3.5 text-blue-700" />
            Save
          </button>
        </form>

        {savedPresets.length === 0 ? (
          <p className="text-xs text-slate-500">
            Save your favorite voice, direction, and mastering levels for 1-click reuse.
          </p>
        ) : (
          <div className="space-y-1.5">
            {savedPresets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onApplySavedPreset(preset)}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <p className="text-xs font-semibold text-slate-900 truncate font-bengali">
                    {preset.name}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {preset.voiceName} · {preset.volumeGain.toFixed(2)}x
                    {preset.normalize ? " · Normalized" : ""}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteSavedPreset(preset.id)}
                  title="Delete preset"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
