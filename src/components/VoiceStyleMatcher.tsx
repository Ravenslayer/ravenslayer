import { CheckCircle2, Loader2, Mic, Square, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MatchedVoiceProfile } from "../types/voiceover";

interface VoiceStyleMatcherProps {
  activeProfile: MatchedVoiceProfile | null;
  defaultSampleUrl?: string;
  defaultSampleName?: string;
  onProfileMatched: (profile: MatchedVoiceProfile) => void;
  onClearProfile: () => void;
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return window.btoa(binary);
}

function resolveAudioMimeType(file: File): string {
  const rawType = file.type.split(";")[0].trim().toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    aac: "audio/aac",
    ogg: "audio/ogg",
    opus: "audio/ogg",
    webm: "audio/webm",
    flac: "audio/flac",
  };
  if (ext && extMap[ext]) {
    return extMap[ext];
  }
  if (rawType.startsWith("audio/")) {
    if (rawType === "audio/x-m4a") return "audio/mp4";
    if (rawType === "audio/x-wav") return "audio/wav";
    return rawType;
  }
  return "audio/mpeg";
}

export function VoiceStyleMatcher({
  activeProfile,
  defaultSampleUrl,
  defaultSampleName = "Uploaded Voice Sample",
  onProfileMatched,
  onClearProfile,
}: VoiceStyleMatcherProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);
  const objectUrlRef = useRef<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [sampleUrl, setSampleUrl] = useState<string | null>(defaultSampleUrl ?? null);
  const [sampleBase64, setSampleBase64] = useState<string | null>(null);
  const [sampleMimeType, setSampleMimeType] = useState<string>("audio/mpeg");
  const [sampleName, setSampleName] = useState<string | null>(
    defaultSampleUrl ? defaultSampleName : null
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const analyzeAudioPayload = async (
    base64Input?: string | null,
    mimeInput?: string | null,
    urlFallback?: string | null
  ) => {
    let base64Payload = base64Input ?? sampleBase64;
    let mimePayload = mimeInput ?? sampleMimeType;
    const urlToFetch = urlFallback ?? sampleUrl;

    if (!base64Payload && !urlToFetch) {
      setError("Record or upload a 5–20 second voice sample first.");
      return;
    }

    setError(null);
    setIsAnalyzing(true);

    try {
      if (!base64Payload && urlToFetch) {
        const fileRes = await fetch(urlToFetch);
        if (!fileRes.ok) {
          throw new Error("Could not read the attached audio sample.");
        }
        const buf = await fileRes.arrayBuffer();
        base64Payload = arrayBufferToBase64(buf);
        mimePayload = fileRes.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
        setSampleBase64(base64Payload);
        setSampleMimeType(mimePayload);
      }

      const response = await fetch("/api/analyze-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: base64Payload,
          mimeType: mimePayload,
        }),
      });

      const data = (await response.json()) as Partial<MatchedVoiceProfile> & { error?: string };
      if (!response.ok || !data.stylePrompt || !data.recommendedVoice) {
        throw new Error(data.error || "Could not analyze voice sample.");
      }

      onProfileMatched({
        recommendedVoice: data.recommendedVoice,
        voiceProfileName: data.voiceProfileName || "Matched Voice Style",
        stylePrompt: data.stylePrompt,
        register: data.register || "colloquial",
        recommendedLanguage: data.recommendedLanguage,
        traitsSummary: data.traitsSummary || "Matched speaking cadence and warmth",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "Microphone recording is not supported in this browser. Please upload an audio file instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsRecording(false);

        const elapsedSec = Math.max(
          1,
          Math.round((Date.now() - recordingStartRef.current) / 1000)
        );
        const mime = (recorder.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size === 0) {
          setError("Recorded sample was empty. Please try again.");
          return;
        }

        const buffer = await blob.arrayBuffer();
        const b64 = arrayBufferToBase64(buffer);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const nextUrl = URL.createObjectURL(blob);
        objectUrlRef.current = nextUrl;

        setSampleUrl(nextUrl);
        setSampleBase64(b64);
        setSampleMimeType(mime);
        setSampleName(`Recorded Sample (${elapsedSec}s)`);

        await analyzeAudioPayload(b64, mime, nextUrl);
      };

      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      recorder.start();
      setIsRecording(true);
      setRecordingSec(0);

      timerRef.current = window.setInterval(() => {
        setRecordingSec((prev) => {
          if (prev >= 29) {
            recorder.stop();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      setError("Microphone access was denied or unavailable. You can upload an audio clip instead.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (
      !file.type.startsWith("audio/") &&
      !/\.(mp3|wav|m4a|mp4|aac|webm|ogg|opus|flac)$/i.test(file.name)
    ) {
      setError("Please select an audio file (.mp3, .wav, .m4a, .aac, .webm, .ogg, or .flac).");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError("Audio sample must be under 20 MB (5–30 seconds works best).");
      return;
    }

    const resolvedMime = resolveAudioMimeType(file);
    const buffer = await file.arrayBuffer();
    const b64 = arrayBufferToBase64(buffer);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;

    setSampleUrl(nextUrl);
    setSampleBase64(b64);
    setSampleMimeType(resolvedMime);
    setSampleName(file.name);

    await analyzeAudioPayload(b64, resolvedMime, nextUrl);
  };

  return (
    <section
      id="voice-match-section"
      className="rounded-xl border border-slate-200 bg-white p-5 space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-base font-semibold text-slate-900 font-bengali">
            Voice Style Matcher (আপনার কথার ধরন ও ভঙ্গি অনুযায়ী ভয়েস ম্যাচিং)
          </h2>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed font-bengali">
            Gemini TTS হুবহু বায়োমেট্রিক ভয়েস ক্লোনিং (আসল কণ্ঠস্বর কপি) সাপোর্ট করে না। এর পরিবর্তে আপনি
            নতুন অডিও আপলোড বা রেকর্ড করলে সাথে সাথে আপনার কণ্ঠের গভীরতা (Male/Female), গতি, ভাষা এবং
            বাচনভঙ্গি বিশ্লেষণ করে সবচেয়ে কাছাকাছি স্টুডিও ভয়েস ও কাস্টম Voice Design স্টাইল সেট করে দেওয়া
            হবে।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!isRecording ? (
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => void startRecording()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5 text-blue-700" />
              Record Voice Sample
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="h-3 w-3 fill-current" />
              <span className="font-mono tabular-nums">Stop ({recordingSec}s)</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac"
            onChange={(e) => void handleFileChange(e)}
            className="hidden"
          />
          <button
            type="button"
            disabled={isRecording || isAnalyzing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload New Voice
          </button>

          {(sampleBase64 || sampleUrl) && (
            <button
              type="button"
              disabled={isAnalyzing || isRecording}
              onClick={() => void analyzeAudioPayload()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isAnalyzing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isAnalyzing ? "Analyzing Voice..." : "Re-Analyze & Apply"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {sampleUrl && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-medium text-slate-700 truncate">{sampleName}</span>
            <audio controls src={sampleUrl} className="h-8 max-w-xs" />
          </div>
          {isAnalyzing ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing new voice sample and updating studio...
            </span>
          ) : !activeProfile ? (
            <span className="text-xs text-slate-500">
              Click &ldquo;Re-Analyze &amp; Apply&rdquo; to apply your vocal traits to the studio.
            </span>
          ) : null}
        </div>
      )}

      {activeProfile && !isAnalyzing && (
        <div className="flex flex-wrap items-start justify-between gap-3 pt-3 border-t border-slate-200">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              <span>Active Matched Profile: {activeProfile.voiceProfileName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span>Base Voice: {activeProfile.recommendedVoice}</span>
              <span aria-hidden="true">·</span>
              <span>{activeProfile.traitsSummary}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClearProfile}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Reset Profile
          </button>
        </div>
      )}
    </section>
  );
}
