import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BatchItem,
  LanguageRegister,
  StudioMode,
  VoiceEngine,
  VoiceLanguage,
} from "../types/voiceover";
import { processStudioWavUrl } from "../utils/wavGain";

interface BatchProcessorProps {
  mode: StudioMode;
  language: VoiceLanguage;
  engine: VoiceEngine;
  voiceName: string;
  speakerAName: string;
  speakerBName: string;
  speakerAVoice: string;
  speakerBVoice: string;
  register: LanguageRegister;
  stylePrompt: string;
  activeStyleLabel: string;
  volumeGain: number;
  normalize: boolean;
  trimSilence: boolean;
}

type SplitMode = "blocks" | "lines";

const SAMPLE_BATCH_TEXT = `একটা প্রশ্ন দিয়ে শুরু করি। আপনি কি জানেন, দিনের শুরুতে মাত্র দশ মিনিট নীরবতা আমাদের পুরো দিনের মনোযোগ বদলে দিতে পারে?

---

গল্পের দ্বিতীয় পর্বে স্বাগতম। আজ আমরা শুনব কীভাবে ধৈর্য আর সহানুভূতি মানুষের ভেতরের শক্তিকে জাগিয়ে তোলে।

---

সবশেষে ছোট্ট একটি কথা মনে রাখবেন—বড় পরিবর্তন কখনো একদিনে আসে না, প্রতিদিন একটু একটু করেই তৈরি হয়।`;

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

function getSafeFilename(title: string, index: number): string {
  const cleaned = title
    .replace(/[^\u0980-\u09FFa-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const prefix = String(index + 1).padStart(2, "0");
  return `${prefix}_${cleaned || "batch_voiceover"}.wav`;
}

function deriveTitle(script: string, fallbackIndex: number): string {
  const clean = script
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return `Script ${fallbackIndex}`;
  return clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
}

async function measureAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.onerror = () => resolve(0);
    audio.src = url;
  });
}

export function BatchProcessor({
  mode,
  language,
  engine,
  voiceName,
  speakerAName,
  speakerBName,
  speakerAVoice,
  speakerBVoice,
  register,
  stylePrompt,
  activeStyleLabel,
  volumeGain,
  normalize,
  trimSilence,
}: BatchProcessorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const itemsRef = useRef<BatchItem[]>([]);

  const [items, setItems] = useState<BatchItem[]>([]);
  itemsRef.current = items;

  const [pasteInput, setPasteInput] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("blocks");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isNaturalizingBatch, setIsNaturalizingBatch] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      itemsRef.current.forEach((item) => {
        if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      });
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleEnded = () => setPlayingId(null);
    const handlePause = () => setPlayingId(null);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
    };
  }, []);

  const summary = useMemo(() => {
    const total = items.length;
    const ready = items.filter((i) => i.status === "ready").length;
    const generating = items.filter((i) => i.status === "generating").length;
    const queued = items.filter((i) => i.status === "queued").length;
    const failed = items.filter((i) => i.status === "error").length;
    return { total, ready, generating, queued, failed };
  }, [items]);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setBatchError(null);
    const fileList = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (fileList.length === 0) return;

    const loaded: BatchItem[] = [];
    for (const file of fileList) {
      const text = (await file.text()).trim();
      if (!text) continue;
      const baseName = file.name.replace(/\.[^.]+$/, "");
      loaded.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: baseName || deriveTitle(text, items.length + loaded.length + 1),
        script: text,
        status: "queued",
      });
    }

    if (loaded.length === 0) {
      setBatchError("Selected text files were empty. Please choose non-empty .txt or .md files.");
      return;
    }

    setItems((prev) => [...prev, ...loaded]);
  };

  const handleAddPastedScripts = () => {
    setBatchError(null);
    const raw = pasteInput.trim();
    if (!raw) {
      setBatchError("Paste one or more scripts before adding to the batch queue.");
      return;
    }

    const chunks =
      splitMode === "lines"
        ? raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : raw
            .split(/(?:\r?\n\s*---+\s*\r?\n|\r?\n\s*\r?\n)/)
            .map((block) => block.trim())
            .filter(Boolean);

    if (chunks.length === 0) {
      setBatchError("Could not detect any scripts from the pasted text.");
      return;
    }

    const added: BatchItem[] = chunks.map((chunk, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      title: deriveTitle(chunk, items.length + idx + 1),
      script: chunk,
      status: "queued",
    }));

    setItems((prev) => [...prev, ...added]);
    setPasteInput("");
  };

  const processSingleItem = async (
    item: BatchItem,
    signal: AbortSignal
  ): Promise<void> => {
    setItems((prev) =>
      prev.map((entry) =>
        entry.id === item.id ? { ...entry, status: "generating", error: undefined } : entry
      )
    );

    try {
      const response = await fetch("/api/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          script: item.script,
          mode,
          language,
          engine,
          voiceName,
          speakerAVoice,
          speakerBVoice,
          speakerAName: speakerAName.trim() || "আরিফ",
          speakerBName: speakerBName.trim() || "তানিয়া",
          stylePrompt,
        }),
      });

      const data = (await response.json()) as {
        audioBase64?: string;
        modelUsed?: string;
        error?: string;
      };

      if (!response.ok || !data.audioBase64) {
        throw new Error(data.error || "Failed to generate audio.");
      }

      const rawAudioUrl = base64ToWavUrl(data.audioBase64);
      const audioUrl = await processStudioWavUrl(rawAudioUrl, {
        gain: volumeGain,
        normalize,
        trimSilence,
      });
      if (audioUrl !== rawAudioUrl) {
        URL.revokeObjectURL(rawAudioUrl);
      }
      const durationSec = await measureAudioDuration(audioUrl);

      setItems((prev) =>
        prev.map((entry) => {
          if (entry.id !== item.id) return entry;
          if (entry.audioUrl) URL.revokeObjectURL(entry.audioUrl);
          return {
            ...entry,
            status: "ready",
            audioUrl,
            durationSec,
            modelUsed: data.modelUsed || "gemini-3.8-flash-tts",
            error: undefined,
          };
        })
      );
    } catch (err) {
      if (signal.aborted) {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, status: "queued", error: undefined } : entry
          )
        );
        return;
      }
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                status: "error",
                error: err instanceof Error ? err.message : "Synthesis failed.",
              }
            : entry
        )
      );
    }
  };

  const runBatch = async (targetIds?: string[]) => {
    const candidates = itemsRef.current.filter((item) =>
      targetIds
        ? targetIds.includes(item.id)
        : item.status === "queued" || item.status === "error"
    );

    if (candidates.length === 0) return;

    setBatchError(null);
    setIsProcessing(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Controlled concurrency of 2 workers to respect API rate limits smoothly
    let cursor = 0;
    const workerCount = Math.min(2, candidates.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < candidates.length && !controller.signal.aborted) {
        const nextItem = candidates[cursor++];
        if (nextItem) {
          await processSingleItem(nextItem, controller.signal);
        }
      }
    });

    await Promise.all(workers);
    abortRef.current = null;
    setIsProcessing(false);
  };

  const handleStopBatch = () => {
    abortRef.current?.abort();
  };

  const handleNaturalizeAll = async () => {
    const candidates = itemsRef.current.filter(
      (item) => item.status === "queued" || item.status === "error"
    );
    if (candidates.length === 0) return;

    setBatchError(null);
    setIsNaturalizingBatch(true);

    try {
      for (const item of candidates) {
        const res = await fetch("/api/naturalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: item.script,
            mode,
            language,
            styleLabel: activeStyleLabel,
            register,
            speakerAName: speakerAName.trim() || "আরিফ",
            speakerBName: speakerBName.trim() || "তানিয়া",
            allowExpressiveTags: mode === "dual" || engine === "expressive",
          }),
        });
        const data = (await res.json()) as { script?: string; error?: string };
        if (!res.ok || !data.script) {
          throw new Error(data.error || "Could not naturalize batch item.");
        }
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  script: data.script!,
                  title: deriveTitle(data.script!, 1),
                  status: "queued",
                  error: undefined,
                }
              : entry
          )
        );
      }
    } catch (err) {
      setBatchError(
        err instanceof Error ? err.message : "Failed to naturalize queued scripts."
      );
    } finally {
      setIsNaturalizingBatch(false);
    }
  };

  const handleTogglePlay = async (item: BatchItem) => {
    const audio = audioRef.current;
    if (!audio || !item.audioUrl) return;

    if (playingId === item.id && !audio.paused) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    audio.src = item.audioUrl;
    audio.currentTime = 0;
    setPlayingId(item.id);
    try {
      await audio.play();
    } catch {
      setPlayingId(null);
    }
  };

  const handleDownloadItem = (item: BatchItem, index: number) => {
    if (!item.audioUrl) return;
    const link = document.createElement("a");
    link.href = item.audioUrl;
    link.download = getSafeFilename(item.title, index);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    const readyItems = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.status === "ready" && Boolean(item.audioUrl));

    readyItems.forEach(({ item, idx }, offset) => {
      window.setTimeout(() => {
        handleDownloadItem(item, idx);
      }, offset * 220);
    });
  };

  const handleRemoveItem = (id: string) => {
    if (playingId === id) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target?.audioUrl) URL.revokeObjectURL(target.audioUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const handleClearQueue = () => {
    abortRef.current?.abort();
    audioRef.current?.pause();
    setPlayingId(null);
    itemsRef.current.forEach((item) => {
      if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
    });
    setItems([]);
    setBatchError(null);
  };

  return (
    <section
      id="batch-section"
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      <audio ref={audioRef} className="hidden" />

      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Batch Voiceover Processing
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Upload multiple text files or paste a list of scripts</span>
            <span aria-hidden="true">·</span>
            <span>
              Using{" "}
              {mode === "dual"
                ? `${speakerAVoice} & ${speakerBVoice}`
                : voiceName}{" "}
              ({activeStyleLabel})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.csv,text/plain"
            onChange={(e) => void handleFilesSelected(e)}
            className="hidden"
          />
          <button
            type="button"
            disabled={isProcessing || isNaturalizingBatch}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-blue-700" />
            Upload Text Files
          </button>

          {summary.queued + summary.failed > 0 && !isProcessing && (
            <button
              type="button"
              disabled={isNaturalizingBatch}
              onClick={() => void handleNaturalizeAll()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isNaturalizingBatch ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-700" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-blue-700" />
              )}
              {isNaturalizingBatch ? "Polishing..." : "Naturalize All"}
            </button>
          )}

          {summary.ready > 0 && (
            <button
              type="button"
              onClick={handleDownloadAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Download All ({summary.ready})
            </button>
          )}

          {isProcessing ? (
            <button
              type="button"
              onClick={handleStopBatch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop Batch
            </button>
          ) : (
            <button
              type="button"
              disabled={summary.queued + summary.failed === 0 || isNaturalizingBatch}
              onClick={() => void runBatch()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              Generate All ({summary.queued + summary.failed})
            </button>
          )}
        </div>
      </div>

      {/* Paste List Input Area */}
      <div className="border-b border-slate-200 bg-slate-50/50 px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="batch-paste-input"
              className="text-xs font-semibold text-slate-700"
            >
              Paste Script List
            </label>
            <button
              type="button"
              onClick={() => {
                setSplitMode("blocks");
                setPasteInput(SAMPLE_BATCH_TEXT);
              }}
              className="text-xs text-blue-700 hover:text-blue-800 font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Load Sample Batch
            </button>
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setSplitMode("blocks")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                splitMode === "blocks"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Split by Blank Line / ---
            </button>
            <button
              type="button"
              onClick={() => setSplitMode("lines")}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                splitMode === "lines"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              One Script Per Line
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <textarea
            id="batch-paste-input"
            rows={3}
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            placeholder={
              splitMode === "blocks"
                ? "Paste multiple scripts separated by blank lines or --- ..."
                : "Paste one script per line..."
            }
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 font-bengali placeholder:text-slate-400 focus:border-blue-700 focus:outline-none resize-y"
          />
          <button
            type="button"
            onClick={handleAddPastedScripts}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Add to Queue
          </button>
        </div>

        {batchError && (
          <div className="flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{batchError}</span>
          </div>
        )}
      </div>

      {/* Queue Status Strip & Table */}
      {items.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <FileText className="h-5 w-5 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-800">Batch queue is empty</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Upload `.txt` / `.md` script files or paste a list of Bengali scripts above to
            synthesize multiple voiceovers in one batch.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/40 px-5 py-2.5 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-mono tabular-nums">
              <span>Total: {summary.total}</span>
              <span aria-hidden="true">·</span>
              <span>Ready: {summary.ready}</span>
              <span aria-hidden="true">·</span>
              <span>Queued: {summary.queued}</span>
              {summary.failed > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-700">Failed: {summary.failed}</span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleClearQueue}
              className="text-xs text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clear Queue
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="py-2.5 pl-5 pr-2 w-12">#</th>
                  <th className="py-2.5 px-3">Script</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Duration</th>
                  <th className="py-2.5 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {items.map((item, idx) => {
                  const isPlayingThis = playingId === item.id;
                  return (
                    <tr key={item.id} className="h-11 hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 pl-5 pr-2 text-xs font-mono tabular-nums text-slate-500">
                        {String(idx + 1).padStart(2, "0")}
                      </td>
                      <td className="py-2 px-3 max-w-md">
                        <p
                          title={item.script}
                          className="truncate font-medium text-slate-900 font-bengali"
                        >
                          {item.title}
                        </p>
                        {item.error && (
                          <p className="text-xs text-red-600 truncate mt-0.5">{item.error}</p>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs whitespace-nowrap">
                        {item.status === "queued" && (
                          <span className="text-slate-500">Queued</span>
                        )}
                        {item.status === "generating" && (
                          <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Generating...
                          </span>
                        )}
                        {item.status === "ready" && (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Ready
                          </span>
                        )}
                        {item.status === "error" && (
                          <span className="inline-flex items-center gap-1.5 text-red-700 font-medium">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs font-mono tabular-nums text-slate-700 text-right whitespace-nowrap">
                        {item.durationSec && item.durationSec > 0
                          ? `${item.durationSec.toFixed(1)}s`
                          : "—"}
                      </td>
                      <td className="py-2 pl-3 pr-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {item.status === "ready" && item.audioUrl && (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleTogglePlay(item)}
                                title={isPlayingThis ? "Pause" : "Play"}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 hover:text-blue-700 transition-colors cursor-pointer"
                              >
                                {isPlayingThis ? (
                                  <Pause className="h-3.5 w-3.5" />
                                ) : (
                                  <Play className="h-3.5 w-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDownloadItem(item, idx)}
                                title="Download WAV"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {item.status === "error" && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void runBatch([item.id])}
                              title="Retry item"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 hover:text-blue-700 disabled:opacity-40 transition-colors cursor-pointer"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={item.status === "generating"}
                            onClick={() => handleRemoveItem(item.id)}
                            title="Remove from queue"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
