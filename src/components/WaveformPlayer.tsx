import { Captions, Download, Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GeneratedTake } from "../types/voiceover";
import { generateSrtFromScript, processStudioWavUrl } from "../utils/wavGain";

interface WaveformPlayerProps {
  take: GeneratedTake | null;
  isGenerating: boolean;
  volumeGain?: number;
  normalize?: boolean;
  trimSilence?: boolean;
  onDurationDetected?: (takeId: string, durationSec: number) => void;
}

const SPEED_OPTIONS = [0.85, 1, 1.15, 1.25] as const;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function WaveformPlayer({
  take,
  isGenerating,
  volumeGain = 1,
  normalize = false,
  trimSilence = false,
  onDurationDetected,
}: WaveformPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [outputAudioUrl, setOutputAudioUrl] = useState<string | null>(null);

  // Produce gain-adjusted WAV URL whenever source audio or volumeGain changes
  useEffect(() => {
    if (!take?.audioUrl) {
      setOutputAudioUrl(null);
      return;
    }

    let cancelled = false;
    let createdBlobUrl: string | null = null;

    async function buildGainedAudio(sourceUrl: string) {
      try {
        const nextUrl = await processStudioWavUrl(sourceUrl, {
          gain: volumeGain,
          normalize,
          trimSilence,
        });
        if (cancelled) {
          if (nextUrl !== sourceUrl) URL.revokeObjectURL(nextUrl);
          return;
        }
        if (nextUrl !== sourceUrl) {
          createdBlobUrl = nextUrl;
        }
        setOutputAudioUrl(nextUrl);
      } catch {
        if (!cancelled) {
          setOutputAudioUrl(sourceUrl);
        }
      }
    }

    void buildGainedAudio(take.audioUrl);
    return () => {
      cancelled = true;
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl);
      }
    };
  }, [take?.audioUrl, volumeGain, normalize, trimSilence]);

  // Decode WAV peaks for crisp interactive waveform visualization
  useEffect(() => {
    const activeUrl = outputAudioUrl;
    if (!activeUrl) {
      setPeaks([]);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      return;
    }

    let cancelled = false;
    setCurrentTime(0);
    setIsPlaying(false);

    async function extractPeaks(url: string) {
      try {
        const res = await fetch(url);
        const arrayBuffer = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        await ctx.close();

        if (cancelled) return;
        setDuration(audioBuffer.duration);
        if (take && onDurationDetected && Math.abs(take.durationSec - audioBuffer.duration) > 0.2) {
          onDurationDetected(take.id, audioBuffer.duration);
        }

        const channelData = audioBuffer.getChannelData(0);
        const barCount = 88;
        const blockSize = Math.max(1, Math.floor(channelData.length / barCount));
        const computed: number[] = [];
        for (let i = 0; i < barCount; i++) {
          const start = i * blockSize;
          let maxVal = 0;
          for (let j = 0; j < blockSize && start + j < channelData.length; j++) {
            const abs = Math.abs(channelData[start + j]);
            if (abs > maxVal) maxVal = abs;
          }
          computed.push(Math.max(0.08, Math.min(1, maxVal)));
        }
        setPeaks(computed);
      } catch {
        if (!cancelled) {
          setPeaks(Array.from({ length: 88 }, (_, i) => 0.2 + ((i * 7) % 5) * 0.1));
        }
      }
    }

    void extractPeaks(activeUrl);
    return () => {
      cancelled = true;
    };
  }, [take?.id, outputAudioUrl]);

  // Sync audio element playback rate & events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [playbackRate, outputAudioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
    };
  }, [outputAudioUrl]);

  // Draw waveform canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || peaks.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
    const totalBars = peaks.length;
    const gap = 3;
    const barWidth = Math.max(2, (width - gap * (totalBars - 1)) / totalBars);

    peaks.forEach((amp, idx) => {
      const x = idx * (barWidth + gap);
      const barHeight = Math.max(4, amp * (height - 8));
      const y = (height - barHeight) / 2;
      const barRatio = idx / totalBars;

      ctx.fillStyle = barRatio <= progress ? "#1d4ed8" : "#cbd5e1";
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 1.5);
      ctx.fill();
    });
  }, [peaks, currentTime, duration]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !take) return;
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  };

  const handleRestart = async () => {
    const audio = audioRef.current;
    if (!audio || !take) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    await audio.play();
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  const getDownloadFilename = (title: string): string => {
    const cleaned = title
      .replace(/[^\u0980-\u09FFa-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
    return `${cleaned || "kotha_voiceover"}.wav`;
  };

  const handleDownload = () => {
    if (!take) return;
    const filename = getDownloadFilename(take.title);
    const link = document.createElement("a");
    link.href = outputAudioUrl ?? take.audioUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSrt = () => {
    if (!take) return;
    const srtContent = generateSrtFromScript(take.script, duration || take.durationSec);
    if (!srtContent) return;
    const blob = new Blob([srtContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const baseName = getDownloadFilename(take.title).replace(/\.wav$/i, "");
    const link = document.createElement("a");
    link.href = url;
    link.download = `${baseName}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (isGenerating) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-slate-800">
            Synthesizing studio voiceover audio...
          </span>
          <span className="text-xs font-mono tabular-nums text-slate-500">24 kHz WAV</span>
        </div>
        <div className="h-14 w-full rounded-lg bg-slate-200/70 animate-pulse" />
      </div>
    );
  }

  if (!take) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/50 px-5 py-5">
        <div className="flex items-center justify-between text-sm text-slate-500">
          <div className="flex items-center gap-2.5">
            <Volume2 className="h-4 w-4 text-slate-400" />
            <span>Generated voiceover audio and waveform will appear here.</span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-400">24 kHz · Mono WAV</span>
        </div>
      </div>
    );
  }

  const downloadFilename = getDownloadFilename(take.title);

  return (
    <div className="border-t border-slate-200 bg-white px-5 py-5">
      <audio ref={audioRef} src={outputAudioUrl ?? take.audioUrl} preload="metadata" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate font-bengali">
            {take.title}
          </p>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              {take.mode === "dual"
                ? `${take.speakerAVoice} & ${take.speakerBVoice}`
                : take.voiceName}
            </span>
            <span aria-hidden="true">·</span>
            <span>{take.styleLabel}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{take.modelUsed}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setPlaybackRate(rate)}
                className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  playbackRate === rate
                    ? "bg-white text-slate-900 font-medium shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportSrt}
            title="Export Bengali .srt subtitles timed to audio"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Captions className="h-3.5 w-3.5" />
            Export SRT
          </button>

          <button
            type="button"
            onClick={handleDownload}
            title={`Download ${downloadFilename}`}
            aria-label={`Download ${downloadFilename}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Download WAV
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void togglePlay()}
            aria-label={isPlaying ? "Pause voiceover" : "Play voiceover"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => void handleRestart()}
            aria-label="Restart playback"
            title="Restart from beginning"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            onClick={handleWaveformClick}
            className="h-12 w-full cursor-pointer block"
            title="Click anywhere on waveform to seek"
          />
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-600 shrink-0">
          <span className="text-slate-900 font-medium">{formatTime(currentTime)}</span>
          <span className="text-slate-400"> / </span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}
