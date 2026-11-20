import { Download, Play, RotateCcw, Trash2 } from "lucide-react";
import type { GeneratedTake } from "../types/voiceover";
import { processStudioWavUrl } from "../utils/wavGain";

interface TakeHistoryProps {
  takes: GeneratedTake[];
  activeTakeId: string | null;
  volumeGain: number;
  normalize: boolean;
  trimSilence: boolean;
  onSelectTake: (take: GeneratedTake) => void;
  onLoadScript: (take: GeneratedTake) => void;
  onDeleteTake: (id: string) => void;
  onFocusEditor: () => void;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  return `${sec.toFixed(1)}s`;
}

export function TakeHistory({
  takes,
  activeTakeId,
  volumeGain,
  normalize,
  trimSilence,
  onSelectTake,
  onLoadScript,
  onDeleteTake,
  onFocusEditor,
}: TakeHistoryProps) {
  const handleDownload = async (take: GeneratedTake) => {
    const masteredUrl = await processStudioWavUrl(take.audioUrl, {
      gain: volumeGain,
      normalize,
      trimSilence,
    });
    const link = document.createElement("a");
    link.href = masteredUrl;
    const safeTitle = take.title.replace(/[^\u0980-\u09FFa-zA-Z0-9_-]+/g, "_").slice(0, 32);
    link.download = `${safeTitle || "kotha_voiceover"}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (masteredUrl !== take.audioUrl) {
      window.setTimeout(() => URL.revokeObjectURL(masteredUrl), 1000);
    }
  };

  return (
    <section
      id="takes-section"
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Recorded Takes</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Session takes ready for instant replay, script reuse, or WAV export.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-slate-500">
          {takes.length} {takes.length === 1 ? "take" : "takes"}
        </span>
      </div>

      {takes.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">No voiceover takes generated yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Write Bengali, Banglish, or English text in the studio editor above and generate your
            first natural Bangla voiceover.
          </p>
          <button
            type="button"
            onClick={onFocusEditor}
            className="mt-4 inline-flex items-center px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Write First Script
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 pl-5 pr-3">Script Excerpt</th>
                <th className="py-2.5 px-3">Voice Cast</th>
                <th className="py-2.5 px-3">Style</th>
                <th className="py-2.5 px-3 text-right">Duration</th>
                <th className="py-2.5 px-3 text-right">Time</th>
                <th className="py-2.5 pl-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {takes.map((take) => {
                const isActive = take.id === activeTakeId;
                return (
                  <tr
                    key={take.id}
                    className={`h-11 transition-colors ${
                      isActive ? "bg-blue-50/40" : "hover:bg-slate-50/80"
                    }`}
                  >
                    <td className="py-2.5 pl-5 pr-3 max-w-xs">
                      <p className="truncate font-medium text-slate-900 font-bengali">
                        {take.title}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap">
                      {take.mode === "dual"
                        ? `${take.speakerAVoice} + ${take.speakerBVoice}`
                        : take.voiceName}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 whitespace-nowrap font-bengali">
                      {take.styleLabel}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-slate-700 text-right whitespace-nowrap">
                      {formatDuration(take.durationSec)}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-mono tabular-nums text-slate-500 text-right whitespace-nowrap">
                      {take.createdAt}
                    </td>
                    <td className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectTake(take)}
                          title="Load in player"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-blue-700 transition-colors cursor-pointer"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onLoadScript(take)}
                          title="Restore script into editor"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(take)}
                          title="Download WAV"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTake(take.id)}
                          title="Remove take"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
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
      )}
    </section>
  );
}
