export interface WavMasteringOptions {
  gain: number;
  normalize: boolean;
  trimSilence: boolean;
}

/**
 * Processes 16-bit PCM WAV audio: optional leading/trailing silence trim,
 * optional peak normalization (-1 dB), and output volume gain scaling.
 */
export async function processStudioWavUrl(
  audioUrl: string,
  options: WavMasteringOptions
): Promise<string> {
  const { gain, normalize, trimSilence } = options;
  const needsGain = Math.abs(gain - 1) >= 0.01;
  if (!needsGain && !normalize && !trimSilence) {
    return audioUrl;
  }

  const response = await fetch(audioUrl);
  const buffer = await response.arrayBuffer();
  const view = new DataView(buffer);

  if (
    buffer.byteLength < 44 ||
    view.getUint32(0, false) !== 0x52494646 ||
    view.getUint32(8, false) !== 0x57415645
  ) {
    return audioUrl;
  }

  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    const bodyStart = offset + 8;

    if (chunkId === 0x666d7420 && chunkSize >= 16 && bodyStart + 16 <= buffer.byteLength) {
      channels = view.getUint16(bodyStart + 2, true);
      sampleRate = view.getUint32(bodyStart + 4, true);
      bitsPerSample = view.getUint16(bodyStart + 14, true);
    } else if (chunkId === 0x64617461) {
      dataOffset = bodyStart;
      dataSize = Math.min(chunkSize, buffer.byteLength - bodyStart);
      break;
    }

    offset = bodyStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || bitsPerSample !== 16 || dataSize <= 0) {
    return audioUrl;
  }

  const totalSamples = Math.floor(dataSize / 2);
  let startIdx = 0;
  let endIdx = totalSamples;

  if (trimSilence && totalSamples > sampleRate * 0.25) {
    const threshold = 260; // ~ -42 dBFS
    const padSamples = Math.round(sampleRate * 0.08) * channels;
    while (startIdx < totalSamples && Math.abs(view.getInt16(dataOffset + startIdx * 2, true)) < threshold) {
      startIdx++;
    }
    while (endIdx > startIdx && Math.abs(view.getInt16(dataOffset + (endIdx - 1) * 2, true)) < threshold) {
      endIdx--;
    }
    startIdx = Math.max(0, startIdx - padSamples);
    endIdx = Math.min(totalSamples, endIdx + padSamples);
    if (endIdx <= startIdx) {
      startIdx = 0;
      endIdx = totalSamples;
    }
  }

  const outSampleCount = endIdx - startIdx;
  let peak = 0;
  for (let i = 0; i < outSampleCount; i++) {
    const abs = Math.abs(view.getInt16(dataOffset + (startIdx + i) * 2, true));
    if (abs > peak) peak = abs;
  }

  // Peak normalize target: -1 dB (~0.891 * 32767 = 29200)
  const normFactor = normalize && peak > 200 ? 29200 / peak : 1;
  const totalGain = normFactor * gain;

  const outPcmBytes = outSampleCount * 2;
  const outBuf = new ArrayBuffer(44 + outPcmBytes);
  const outView = new DataView(outBuf);

  // Standard 44-byte WAV header
  outView.setUint32(0, 0x52494646, false); // "RIFF"
  outView.setUint32(4, 36 + outPcmBytes, true);
  outView.setUint32(8, 0x57415645, false); // "WAVE"
  outView.setUint32(12, 0x666d7420, false); // "fmt "
  outView.setUint32(16, 16, true);
  outView.setUint16(20, 1, true);
  outView.setUint16(22, channels, true);
  outView.setUint32(24, sampleRate, true);
  const byteRate = sampleRate * channels * 2;
  outView.setUint32(28, byteRate, true);
  outView.setUint16(32, channels * 2, true);
  outView.setUint16(34, 16, true);
  outView.setUint32(36, 0x64617461, false); // "data"
  outView.setUint32(40, outPcmBytes, true);

  // Apply short 5ms fade-in / fade-out to avoid boundary clicks when trimming
  const fadeSamples = trimSilence ? Math.min(Math.round(sampleRate * 0.005), Math.floor(outSampleCount / 4)) : 0;

  for (let i = 0; i < outSampleCount; i++) {
    const raw = view.getInt16(dataOffset + (startIdx + i) * 2, true);
    let env = 1;
    if (fadeSamples > 0) {
      if (i < fadeSamples) env = i / fadeSamples;
      else if (i >= outSampleCount - fadeSamples) env = (outSampleCount - 1 - i) / fadeSamples;
    }
    const scaled = Math.round(raw * totalGain * env);
    const clamped = scaled > 32767 ? 32767 : scaled < -32768 ? -32768 : scaled;
    outView.setInt16(44 + i * 2, clamped, true);
  }

  const blob = new Blob([outBuf], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

export function formatGainDb(gain: number): string {
  if (Math.abs(gain - 1) < 0.01) return "0.0 dB";
  const db = 20 * Math.log10(gain);
  const sign = db > 0 ? "+" : "";
  return `${sign}${db.toFixed(1)} dB`;
}

function formatSrtTimestamp(seconds: number): string {
  const msTotal = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(msTotal / 3600000);
  const mins = Math.floor((msTotal % 3600000) / 60000);
  const secs = Math.floor((msTotal % 60000) / 1000);
  const ms = msTotal % 1000;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

/**
 * Generates an SRT caption file proportioned cleanly across the measured WAV duration.
 */
export function generateSrtFromScript(script: string, totalDurationSec: number): string {
  const cleanScript = script.replace(/<[^>]+>/g, "").trim();
  const sentences = cleanScript
    .split(/(?<=[।?!.\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return "";
  const duration = totalDurationSec > 0 ? totalDurationSec : sentences.length * 3;
  const totalChars = sentences.reduce((acc, s) => acc + Math.max(1, s.length), 0);

  let cursor = 0;
  const blocks: string[] = [];

  sentences.forEach((sentence, idx) => {
    const weight = Math.max(1, sentence.length) / totalChars;
    const segDuration = idx === sentences.length - 1 ? duration - cursor : duration * weight;
    const start = cursor;
    const end = Math.min(duration, cursor + Math.max(0.4, segDuration));
    cursor = end;

    blocks.push(
      `${idx + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${sentence}\n`
    );
  });

  return blocks.join("\n");
}
