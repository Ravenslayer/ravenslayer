import "dotenv/config";
import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function getTtsAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets."
    );
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function extractErrorDetails(err: unknown): { status: number; message: string } {
  if (err instanceof Error) {
    const anyErr = err as Error & { status?: number; statusCode?: number };
    const status =
      typeof anyErr.status === "number"
        ? anyErr.status
        : typeof anyErr.statusCode === "number"
          ? anyErr.statusCode
          : 500;
    let message = err.message || "Unexpected server error.";
    if (message.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(message) as { error?: { message?: string } };
        if (parsed.error?.message) {
          message = parsed.error.message;
        }
      } catch {
        // keep original message
      }
    }
    if (message.includes("API_KEY_INVALID") || message.includes("PERMISSION_DENIED")) {
      message =
        "Your Gemini API key appears invalid or lacks permission. Please verify it in Settings > Secrets.";
    } else if (message.includes("RESOURCE_EXHAUSTED") || status === 429) {
      message =
        "Rate limit or quota reached for the Gemini API. Please wait a moment and try again.";
    }
    return { status: status >= 400 && status < 600 ? status : 500, message };
  }
  return { status: 500, message: "Unexpected error while calling Gemini API." };
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const anyErr = err as { status?: number; statusCode?: number };
      const status = anyErr?.status ?? anyErr?.statusCode ?? 0;
      const isTransient =
        status === 503 ||
        status === 429 ||
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("high demand");
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw lastError;
}

interface DialogueTurn {
  speaker: string;
  text: string;
}

function parseDualSpeakerScript(
  rawScript: string,
  speakerA: string,
  speakerB: string
): DialogueTurn[] {
  const lines = rawScript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const turns: DialogueTurn[] = [];
  const escapedA = speakerA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedB = speakerB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixRegex = new RegExp(`^(${escapedA}|${escapedB}|Speaker\\s*1|Speaker\\s*2|A|B)\\s*[:：-]\\s*(.+)$`, "i");

  for (const line of lines) {
    const match = line.match(prefixRegex);
    if (match) {
      const label = match[1].toLowerCase();
      const body = match[2].trim();
      const isA =
        label === speakerA.toLowerCase() ||
        label === "speaker 1" ||
        label === "speaker1" ||
        label === "a";
      turns.push({
        speaker: isA ? speakerA : speakerB,
        text: body,
      });
    } else if (turns.length > 0) {
      turns[turns.length - 1].text += " " + line;
    } else {
      turns.push({ speaker: speakerA, text: line });
    }
  }

  // Ensure both speakers are represented if user wrote plain sentences without prefixes
  const distinctSpeakers = new Set(turns.map((t) => t.speaker));
  if (turns.length === 1 && distinctSpeakers.size === 1) {
    const sentences = turns[0].text
      .split(/(?<=[।?!.])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length >= 2) {
      return sentences.map((sentence, idx) => ({
        speaker: idx % 2 === 0 ? speakerA : speakerB,
        text: sentence,
      }));
    }
  }

  return turns;
}

function splitScriptIntoChunks(text: string, maxChars = 900): string[] {
  const cleaned = text.trim();
  if (cleaned.length <= maxChars) return [cleaned];

  const sentences = cleaned
    .split(/(?<=[।?!.\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      // Split overly long sentence on commas/spaces
      const words = sentence.split(/\s+/);
      let sub = "";
      for (const word of words) {
        if ((sub + " " + word).trim().length > maxChars && sub) {
          chunks.push(sub.trim());
          sub = word;
        } else {
          sub = sub ? `${sub} ${word}` : word;
        }
      }
      if (sub.trim()) chunks.push(sub.trim());
      continue;
    }

    if ((current + " " + sentence).trim().length > maxChars && current) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [cleaned];
}

function extractWavPcmData(wavBuf: Buffer): {
  header: Buffer;
  pcm: Buffer;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
} {
  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;

  while (offset + 8 <= wavBuf.length) {
    const id = wavBuf.toString("ascii", offset, offset + 4);
    const size = wavBuf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (id === "fmt " && size >= 16 && bodyStart + 16 <= wavBuf.length) {
      channels = wavBuf.readUInt16LE(bodyStart + 2);
      sampleRate = wavBuf.readUInt32LE(bodyStart + 4);
      bitsPerSample = wavBuf.readUInt16LE(bodyStart + 14);
    } else if (id === "data") {
      const pcmEnd = Math.min(bodyStart + size, wavBuf.length);
      return {
        header: wavBuf.subarray(0, 44),
        pcm: wavBuf.subarray(bodyStart, pcmEnd),
        sampleRate,
        channels,
        bitsPerSample,
      };
    }
    offset = bodyStart + size + (size % 2);
  }

  return {
    header: wavBuf.subarray(0, 44),
    pcm: wavBuf.subarray(44),
    sampleRate,
    channels,
    bitsPerSample,
  };
}

function concatenateWavBuffers(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 1) return wavBuffers[0];

  const extracted = wavBuffers.map(extractWavPcmData);
  const { sampleRate, channels, bitsPerSample } = extracted[0];
  const bytesPerSample = Math.max(1, bitsPerSample / 8) * channels;
  // 160ms subtle pause between stitched chunks
  const pauseBytes = Math.round(sampleRate * 0.16) * bytesPerSample;
  const silenceGap = Buffer.alloc(pauseBytes);

  const pcmParts: Buffer[] = [];
  extracted.forEach((part, idx) => {
    pcmParts.push(part.pcm);
    if (idx < extracted.length - 1) {
      pcmParts.push(silenceGap);
    }
  });

  const mergedPcm = Buffer.concat(pcmParts);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + mergedPcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(mergedPcm.length, 40);

  return Buffer.concat([header, mergedPcm]);
}

function masterWavBuffer(
  wavBuf: Buffer,
  options: { gain?: number; normalize?: boolean; trimSilence?: boolean }
): Buffer {
  const gain = Number.isFinite(options.gain) ? Math.max(0.1, Math.min(3, Number(options.gain))) : 1;
  const normalize = Boolean(options.normalize);
  const trimSilence = Boolean(options.trimSilence);
  if (Math.abs(gain - 1) < 0.01 && !normalize && !trimSilence) {
    return wavBuf;
  }

  const { pcm, sampleRate, channels, bitsPerSample } = extractWavPcmData(wavBuf);
  if (bitsPerSample !== 16 || pcm.length < 4) {
    return wavBuf;
  }

  const totalSamples = Math.floor(pcm.length / 2);
  let startIdx = 0;
  let endIdx = totalSamples;

  if (trimSilence && totalSamples > sampleRate * 0.25) {
    const threshold = 260;
    const padSamples = Math.round(sampleRate * 0.08) * channels;
    while (startIdx < totalSamples && Math.abs(pcm.readInt16LE(startIdx * 2)) < threshold) {
      startIdx++;
    }
    while (endIdx > startIdx && Math.abs(pcm.readInt16LE((endIdx - 1) * 2)) < threshold) {
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
    const abs = Math.abs(pcm.readInt16LE((startIdx + i) * 2));
    if (abs > peak) peak = abs;
  }

  const normFactor = normalize && peak > 200 ? 29200 / peak : 1;
  const totalGain = normFactor * gain;
  const outPcmBytes = outSampleCount * 2;
  const outBuf = Buffer.alloc(44 + outPcmBytes);
  const byteRate = sampleRate * channels * 2;

  outBuf.write("RIFF", 0, "ascii");
  outBuf.writeUInt32LE(36 + outPcmBytes, 4);
  outBuf.write("WAVE", 8, "ascii");
  outBuf.write("fmt ", 12, "ascii");
  outBuf.writeUInt32LE(16, 16);
  outBuf.writeUInt16LE(1, 20);
  outBuf.writeUInt16LE(channels, 22);
  outBuf.writeUInt32LE(sampleRate, 24);
  outBuf.writeUInt32LE(byteRate, 28);
  outBuf.writeUInt16LE(channels * 2, 32);
  outBuf.writeUInt16LE(16, 34);
  outBuf.write("data", 36, "ascii");
  outBuf.writeUInt32LE(outPcmBytes, 40);

  const fadeSamples = trimSilence
    ? Math.min(Math.round(sampleRate * 0.005), Math.floor(outSampleCount / 4))
    : 0;

  for (let i = 0; i < outSampleCount; i++) {
    const raw = pcm.readInt16LE((startIdx + i) * 2);
    let env = 1;
    if (fadeSamples > 0) {
      if (i < fadeSamples) env = i / fadeSamples;
      else if (i >= outSampleCount - fadeSamples) env = (outSampleCount - 1 - i) / fadeSamples;
    }
    const scaled = Math.round(raw * totalGain * env);
    const clamped = scaled > 32767 ? 32767 : scaled < -32768 ? -32768 : scaled;
    outBuf.writeInt16LE(clamped, 44 + i * 2);
  }

  return outBuf;
}

interface StoredClip {
  id: string;
  buffer: Buffer;
  filename: string;
  createdAt: number;
}

const generatedClipsStore = new Map<string, StoredClip>();
const MAX_STORED_CLIPS = 40;

function saveGeneratedClip(buffer: Buffer, baseTitle: string): StoredClip {
  const id = crypto.randomBytes(10).toString("hex");
  const safeBase =
    baseTitle
      .replace(/<[^>]+>/g, "")
      .replace(/[^\u0980-\u09FFa-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 42) || "kotha_voiceover";
  const clip: StoredClip = {
    id,
    buffer,
    filename: `${safeBase}.wav`,
    createdAt: Date.now(),
  };
  generatedClipsStore.set(id, clip);
  while (generatedClipsStore.size > MAX_STORED_CLIPS) {
    const oldestKey = generatedClipsStore.keys().next().value;
    if (!oldestKey) break;
    generatedClipsStore.delete(oldestKey);
  }
  return clip;
}

function resolvePublicBaseUrl(req: express.Request): string {
  const host = req.get("x-forwarded-host") || req.get("host");
  if (host) {
    const proto = req.get("x-forwarded-proto") || req.protocol || "https";
    return `${proto}://${host}`;
  }
  if (process.env.APP_URL && process.env.APP_URL !== "MY_APP_URL") {
    return process.env.APP_URL.replace(/\/+$/, "");
  }
  return `http://localhost:${PORT}`;
}

interface VoiceoverParams {
  script: string;
  mode: "single" | "dual";
  language: "bn" | "en" | "bilingual";
  engine: "expressive" | "fast";
  voiceName: string;
  speakerAVoice: string;
  speakerBVoice: string;
  speakerAName: string;
  speakerBName: string;
  stylePrompt: string;
}

async function synthesizeVoiceoverWav(params: VoiceoverParams): Promise<{
  wavBuffer: Buffer;
  modelUsed: string;
  chunkCount: number;
}> {
  const {
    script,
    mode,
    language,
    engine,
    voiceName,
    speakerAVoice,
    speakerBVoice,
    speakerAName,
    speakerBName,
    stylePrompt,
  } = params;

  const trimmedScript = script.trim();
  const languageDirection =
    language === "en"
      ? "Speak in natural, fluent native English with authentic conversational pronunciation, realistic breathing pauses, and organic human cadence."
      : language === "bilingual"
        ? "Speak naturally in fluent bilingual Bengali (Bangla) and English, transitioning seamlessly with authentic pronunciation and organic conversational rhythm."
        : "Speak in natural, fluent Bengali (Bangla) with authentic native pronunciation, realistic breathing pauses, and organic cadence.";

  const ai = getTtsAiClient();

  if (mode === "dual") {
    const turns = parseDualSpeakerScript(trimmedScript, speakerAName, speakerBName);
    if (turns.length === 0) {
      throw Object.assign(new Error("Could not parse dialogue lines for dual-speaker mode."), {
        status: 400,
      });
    }

    const turnBatches: DialogueTurn[][] = [];
    let currentBatch: DialogueTurn[] = [];
    let currentLen = 0;

    for (const turn of turns) {
      const turnLen = turn.speaker.length + turn.text.length + 2;
      if (currentBatch.length > 0 && currentLen + turnLen > 900) {
        turnBatches.push(currentBatch);
        currentBatch = [turn];
        currentLen = turnLen;
      } else {
        currentBatch.push(turn);
        currentLen += turnLen;
      }
    }
    if (currentBatch.length > 0) {
      turnBatches.push(currentBatch);
    }

    const wavBuffers: Buffer[] = [];
    for (const batch of turnBatches) {
      const parts = batch.map((turn) => ({
        text: `${turn.speaker}: ${turn.text}`,
        speechMetadata: {
          speaker: turn.speaker,
          style: `${languageDirection} ${stylePrompt}`,
        },
      }));

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.8-flash-tts",
          contents: [{ role: "user", parts }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: speakerAName,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerAVoice } },
                  },
                  {
                    speaker: speakerBName,
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: speakerBVoice } },
                  },
                ],
              },
            },
          },
        })
      );

      const batchBase64 = response.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data
      )?.inlineData?.data;

      if (!batchBase64) {
        throw Object.assign(
          new Error("No audio data was returned by the speech model. Please adjust the script and try again."),
          { status: 502 }
        );
      }

      wavBuffers.push(Buffer.from(batchBase64, "base64"));
    }

    return {
      wavBuffer: concatenateWavBuffers(wavBuffers),
      modelUsed: "gemini-3.8-flash-tts",
      chunkCount: turnBatches.length,
    };
  }

  const modelUsed = engine === "fast" ? "gemini-3.8-flash-lite-tts" : "gemini-3.8-flash-tts";
  const chunks = splitScriptIntoChunks(trimmedScript, 900);
  const wavBuffers: Buffer[] = [];

  for (const chunkText of chunks) {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: modelUsed,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: chunkText,
                speechMetadata: {
                  style: `${languageDirection} ${stylePrompt}`,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      })
    );

    const chunkBase64 = response.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData?.data
    )?.inlineData?.data;

    if (!chunkBase64) {
      throw Object.assign(
        new Error("No audio data was returned by the speech model. Please try again."),
        { status: 502 }
      );
    }

    wavBuffers.push(Buffer.from(chunkBase64, "base64"));
  }

  return {
    wavBuffer: concatenateWavBuffers(wavBuffers),
    modelUsed,
    chunkCount: chunks.length,
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "30mb" }));

  // Enable CORS on all API routes so external AI tools and apps can integrate freely
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/naturalize", async (req, res) => {
    try {
      const {
        text,
        mode = "single",
        language = "bn",
        styleLabel = "Natural Conversational",
        register = "colloquial",
        speakerAName = "আরিফ",
        speakerBName = "তানিয়া",
        allowExpressiveTags = true,
      } = req.body as {
        text?: string;
        mode?: "single" | "dual";
        language?: "bn" | "en" | "bilingual";
        styleLabel?: string;
        register?: "colloquial" | "standard" | "warm";
        speakerAName?: string;
        speakerBName?: string;
        allowExpressiveTags?: boolean;
      };

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        res.status(400).json({ error: "Please enter some text to naturalize." });
        return;
      }

      const registerGuide =
        language === "en"
          ? register === "standard"
            ? "Crisp, clear, articulate standard English suitable for broadcasts, explainers, and documentaries."
            : register === "warm"
              ? "Warm, reflective, literary spoken English with rich storytelling cadence and gentle pauses."
              : "Natural, everyday conversational English with organic phrasing, relaxed contractions, and human rhythm."
          : register === "standard"
            ? "Standard, polished broadcast Bengali (প্রমিত ও পরিশীলিত বাংলা), clear and authoritative without sounding stiff."
            : register === "warm"
              ? "Warm, literary and evocative Bengali (আবেগপূর্ণ ও সাবলীল কথ্য বাংলা), rich in rhythm and natural pauses."
              : "Natural everyday spoken Bengali (স্বাভাবিক চলিত বাংলা), just like how an articulate native Bangladeshi or Bengali speaker talks naturally.";

      const formatInstruction =
        mode === "dual"
          ? `Format the output as a natural back-and-forth two-speaker dialogue between "${speakerAName}" and "${speakerBName}". Every line MUST start with either "${speakerAName}: " or "${speakerBName}: ". Keep turns crisp, responsive, and realistic.`
          : language === "en"
            ? `Format the output as a cohesive single-narrator spoken English script.`
            : `Format the output as a cohesive single-narrator spoken Bengali script.`;

      const tagInstruction = allowExpressiveTags
        ? `You may sparingly include subtle vocal cues like <breath> or <laugh> only where a human narrator would genuinely pause to breathe or chuckle—never overuse them.`
        : `Do not include angle-bracket tags like <breath> or <laugh>.`;

      const languageSystemRules =
        language === "en"
          ? [
              "You are an expert English voiceover scriptwriter and dialogue director.",
              "Take the input text (whether rough English, Banglish, or Bengali) and craft a 100% natural spoken English voiceover script that sounds effortless and human when read aloud by a voice actor.",
              `Target delivery style: ${styleLabel}.`,
              `Tone & register: ${registerGuide}`,
              formatInstruction,
              tagInstruction,
              "Use natural contractions (don't, it's, we're) when conversational, clean punctuation (commas, periods, em-dashes) for breath pacing, and avoid stiff robotic phrasing.",
            ].join(" ")
          : language === "bilingual"
            ? [
                "You are an expert bilingual Bengali and English voiceover scriptwriter and dialogue director.",
                "Polish the input into a natural spoken bilingual script combining fluent Dhaka spoken Bangla and natural English phrases/sentences wherever appropriate, sounding effortless when read aloud.",
                `Target delivery style: ${styleLabel}.`,
                `Language register: ${registerGuide}`,
                formatInstruction,
                tagInstruction,
                "Keep Bengali parts in clean Unicode Bengali script with proper দাঁড়ি (।) and keep intended English phrases/sentences in crisp English spelling.",
              ].join(" ")
            : [
                "You are an expert Bengali voiceover scriptwriter and dialogue director.",
                "Your job is to take input written in Bengali script, Banglish (Romanized Bengali), or English, and produce a spoken Bengali script in Unicode Bengali script that sounds 100% natural when read aloud by a voice actor.",
                `Target delivery style: ${styleLabel}.`,
                `Language register: ${registerGuide}`,
                formatInstruction,
                tagInstruction,
                "Transliterate common English loanwords (e.g., ভিডিও, পডকাস্ট, স্টুডিও, ইন্টারনেট, মোবাইল) cleanly into Bengali script when they belong naturally in spoken Bangla, so the speech synthesizer pronounces them smoothly inside the Bengali sentence.",
                "Use proper Bengali punctuation (দাঁড়ি ।, কমা ,, প্রশ্নবোধক ?, বিস্ময়সূচক !) to guide natural rhythm and breathing pauses.",
              ].join(" ");

      const promptPrefix =
        language === "en"
          ? "Convert and polish the following input text into a natural spoken English voiceover script."
          : language === "bilingual"
            ? "Polish the following input text into a natural spoken bilingual (Bengali + English) voiceover script."
            : "Convert and polish the following input text into a natural spoken Bengali (বাংলা) voiceover script.";

      const ai = getAiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: `${promptPrefix}\n\nInput text:\n${text.trim()}`,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            systemInstruction: languageSystemRules,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                script: {
                  type: Type.STRING,
                  description: "The polished spoken voiceover script.",
                },
                detectedInput: {
                  type: Type.STRING,
                  description:
                    "Brief label of detected input type, e.g., 'Banglish', 'Bengali', 'English', or 'Mixed Bangla-English'.",
                },
                coachingNote: {
                  type: Type.STRING,
                  description:
                    "One short sentence explaining how the phrasing or rhythm was adapted for natural voiceover.",
                },
              },
              required: ["script", "detectedInput", "coachingNote"],
            },
          },
        })
      );

      const rawJson = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawJson) as {
        script?: string;
        detectedInput?: string;
        coachingNote?: string;
      };

      if (!parsed.script) {
        res.status(502).json({ error: "Model did not return a script. Please try again." });
        return;
      }

      res.json({
        script: parsed.script,
        detectedInput: parsed.detectedInput || "Bengali",
        coachingNote:
          parsed.coachingNote || "Adapted phrasing and punctuation for natural spoken cadence.",
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/analyze-voice", async (req, res) => {
    const startedAt = Date.now();
    try {
      const { audioBase64, mimeType } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };

      if (!audioBase64 || typeof audioBase64 !== "string") {
        res.status(400).json({ error: "Please record or upload a voice sample first." });
        return;
      }

      const cleanBase64 = audioBase64.includes(",")
        ? audioBase64.split(",").pop()!.trim()
        : audioBase64.trim();

      if (!cleanBase64) {
        res.status(400).json({ error: "The uploaded audio data was empty." });
        return;
      }

      const rawMime = typeof mimeType === "string" ? mimeType.split(";")[0].trim().toLowerCase() : "";
      const mimeMap: Record<string, string> = {
        "audio/mp3": "audio/mpeg",
        "audio/x-mpeg": "audio/mpeg",
        "audio/x-wav": "audio/wav",
        "audio/wave": "audio/wav",
        "audio/vnd.wave": "audio/wav",
        "audio/x-m4a": "audio/mp4",
        "audio/m4a": "audio/mp4",
        "video/mp4": "audio/mp4",
        "video/webm": "audio/webm",
        "audio/x-aac": "audio/aac",
      };
      const safeMimeType =
        mimeMap[rawMime] ||
        (rawMime.startsWith("audio/") ? rawMime : "audio/mpeg");

      console.log(
        `[analyze-voice] start mime=${safeMimeType} b64_chars=${cleanBase64.length}`
      );

      const ai = getAiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: safeMimeType,
                    data: cleanBase64,
                  },
                },
                {
                  text: [
                    "Listen carefully to this speaker's voice sample.",
                    "Analyze the speaker's gender/vocal register, pitch range, timbre/warmth, speaking tempo, articulation, pause habits, emotional energy, and primary language (Bengali, English, or bilingual Bangla-English).",
                    "Select the closest matching studio base voice from ONLY these 5 options (respecting the speaker's gender and timbre):",
                    "- Kore (warm, articulate mid-bright female voice)",
                    "- Zephyr (calm, soft, soothing female voice)",
                    "- Puck (upbeat, conversational bright male voice)",
                    "- Charon (deep, grounded baritone male narrator)",
                    "- Fenrir (crisp, expressive, punchy male voice)",
                    "Then craft a concise, actionable Voice Design direction prompt so Gemini TTS mirrors this speaker's delivery style, pace, energy, and cadence.",
                  ].join(" "),
                },
              ],
            },
          ],
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                recommendedVoice: {
                  type: Type.STRING,
                  description: "Must be exactly one of: Kore, Puck, Charon, Fenrir, Zephyr",
                },
                voiceProfileName: {
                  type: Type.STRING,
                  description:
                    "Short 3-5 word profile label describing the vocal persona, e.g. 'Warm Mid-Baritone Storyteller' or 'Articulate Bengali Female Narrator'.",
                },
                stylePrompt: {
                  type: Type.STRING,
                  description:
                    "Detailed Voice Design direction (2-3 sentences) describing pitch, tempo, warmth, pauses, and accent/cadence to replicate this speaking style.",
                },
                register: {
                  type: Type.STRING,
                  description: "Must be one of: colloquial, standard, warm",
                },
                recommendedLanguage: {
                  type: Type.STRING,
                  description: "Detected primary language of the voice sample: bn, en, or bilingual",
                },
                traitsSummary: {
                  type: Type.STRING,
                  description:
                    "Brief unboxed summary of heard vocal traits separated by middle dots, e.g. 'Female · calm pace · warm mid-bright timbre · Dhaka Bangla'.",
                },
              },
              required: [
                "recommendedVoice",
                "voiceProfileName",
                "stylePrompt",
                "register",
                "recommendedLanguage",
                "traitsSummary",
              ],
            },
          },
        })
      );

      console.log(`[analyze-voice] done in ${Date.now() - startedAt}ms`);

      const rawJson = (response.text ?? "{}").trim();
      const parsed = JSON.parse(rawJson) as {
        recommendedVoice?: string;
        voiceProfileName?: string;
        stylePrompt?: string;
        register?: string;
        recommendedLanguage?: string;
        traitsSummary?: string;
      };

      const validVoices = new Set(["Kore", "Puck", "Charon", "Fenrir", "Zephyr"]);
      const validRegisters = new Set(["colloquial", "standard", "warm"]);
      const validLanguages = new Set(["bn", "en", "bilingual"]);

      const recommendedVoice = validVoices.has(parsed.recommendedVoice ?? "")
        ? parsed.recommendedVoice!
        : "Kore";
      const register = validRegisters.has(parsed.register ?? "")
        ? parsed.register!
        : "colloquial";
      const recommendedLanguage = validLanguages.has(parsed.recommendedLanguage ?? "")
        ? parsed.recommendedLanguage!
        : "bn";

      if (!parsed.stylePrompt) {
        res.status(502).json({
          error: "Could not extract voice style traits from the audio sample. Please try a clearer recording.",
        });
        return;
      }

      res.json({
        recommendedVoice,
        voiceProfileName: parsed.voiceProfileName || "Matched Custom Voice Style",
        stylePrompt: parsed.stylePrompt,
        register,
        recommendedLanguage,
        traitsSummary:
          parsed.traitsSummary || "Natural conversational pacing · matched vocal warmth",
      });
    } catch (err) {
      console.error(`[analyze-voice] error after ${Date.now() - startedAt}ms:`, err);
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.post("/api/voiceover", async (req, res) => {
    try {
      const {
        script,
        mode = "single",
        language = "bn",
        engine = "expressive",
        voiceName = "Kore",
        speakerAVoice = "Puck",
        speakerBVoice = "Kore",
        speakerAName = "আরিফ",
        speakerBName = "তানিয়া",
        stylePrompt = "Warm, natural narrator with expressive intonation",
      } = req.body as Partial<VoiceoverParams>;

      if (!script || typeof script !== "string" || script.trim().length === 0) {
        res.status(400).json({ error: "Please enter a script before generating audio." });
        return;
      }

      if (script.trim().length > 15000) {
        res.status(400).json({
          error: "Script exceeds maximum length of 15,000 characters.",
        });
        return;
      }

      const result = await synthesizeVoiceoverWav({
        script,
        mode,
        language,
        engine,
        voiceName,
        speakerAVoice,
        speakerBVoice,
        speakerAName,
        speakerBName,
        stylePrompt,
      });

      res.json({
        audioBase64: result.wavBuffer.toString("base64"),
        mimeType: "audio/wav",
        modelUsed: result.modelUsed,
        chunkCount: result.chunkCount,
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  // --- Public External AI Integration API (/api/v1/* & OpenAPI 3.1) ---

  const requireOptionalApiToken: express.RequestHandler = (req, res, next) => {
    const requiredToken = process.env.STUDIO_API_TOKEN?.trim();
    if (!requiredToken) {
      next();
      return;
    }
    const authHeader = req.get("authorization") || "";
    const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (provided !== requiredToken) {
      res.status(401).json({
        error: "Unauthorized. Provide a valid Authorization: Bearer <STUDIO_API_TOKEN> header.",
      });
      return;
    }
    next();
  };

  app.get("/api/v1/voices", requireOptionalApiToken, (_req, res) => {
    res.json({
      voices: [
        { id: "Kore", gender: "female", tone: "Warm, articulate female narrator" },
        { id: "Zephyr", gender: "female", tone: "Calm, soothing female narrator" },
        { id: "Puck", gender: "male", tone: "Upbeat, conversational male voice" },
        { id: "Charon", gender: "male", tone: "Deep, grounded baritone male narrator" },
        { id: "Fenrir", gender: "male", tone: "Crisp, expressive male voice" },
      ],
      languages: ["bn", "en", "bilingual"],
      modes: ["single", "dual"],
      engines: ["expressive", "fast"],
    });
  });

  app.post("/api/v1/voiceover", requireOptionalApiToken, async (req, res) => {
    try {
      const {
        script,
        mode = "single",
        language = "bn",
        engine = "expressive",
        voiceName = "Charon",
        speakerAVoice = "Puck",
        speakerBVoice = "Kore",
        speakerAName = language === "en" ? "Alex" : "আরিফ",
        speakerBName = language === "en" ? "Maya" : "তানিয়া",
        stylePrompt = "Warm, natural narrator with expressive intonation",
        format = "json",
        includeBase64 = false,
        title,
        volumeGain = 1,
        normalize = true,
        trimSilence = true,
      } = req.body as Partial<VoiceoverParams> & {
        format?: "json" | "wav";
        includeBase64?: boolean;
        title?: string;
        volumeGain?: number;
        normalize?: boolean;
        trimSilence?: boolean;
      };

      if (!script || typeof script !== "string" || script.trim().length === 0) {
        res.status(400).json({ error: "Please provide a non-empty 'script' string." });
        return;
      }

      if (script.trim().length > 15000) {
        res.status(400).json({ error: "Script exceeds maximum length of 15,000 characters." });
        return;
      }

      const validVoices = new Set(["Kore", "Zephyr", "Puck", "Charon", "Fenrir"]);
      const safeVoice = validVoices.has(voiceName) ? voiceName : "Charon";
      const safeVoiceA = validVoices.has(speakerAVoice) ? speakerAVoice : "Puck";
      const safeVoiceB = validVoices.has(speakerBVoice) ? speakerBVoice : "Kore";

      const result = await synthesizeVoiceoverWav({
        script,
        mode: mode === "dual" ? "dual" : "single",
        language: language === "en" || language === "bilingual" ? language : "bn",
        engine: engine === "fast" ? "fast" : "expressive",
        voiceName: safeVoice,
        speakerAVoice: safeVoiceA,
        speakerBVoice: safeVoiceB,
        speakerAName,
        speakerBName,
        stylePrompt,
      });

      const masteredBuffer = masterWavBuffer(result.wavBuffer, {
        gain: volumeGain,
        normalize,
        trimSilence,
      });

      const clipTitle = (title || script.trim().slice(0, 40)).trim();
      const clip = saveGeneratedClip(masteredBuffer, clipTitle);

      if (format === "wav") {
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Content-Length", String(masteredBuffer.length));
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(clip.filename)}"`
        );
        res.send(masteredBuffer);
        return;
      }

      const baseUrl = resolvePublicBaseUrl(req);
      const downloadUrl = `${baseUrl}/api/v1/download/${clip.id}.wav`;
      const streamUrl = `${baseUrl}/api/v1/download/${clip.id}.wav?inline=1`;

      res.json({
        ok: true,
        clipId: clip.id,
        filename: clip.filename,
        downloadUrl,
        streamUrl,
        mimeType: "audio/wav",
        byteLength: masteredBuffer.length,
        modelUsed: result.modelUsed,
        chunkCount: result.chunkCount,
        ...(includeBase64 ? { audioBase64: masteredBuffer.toString("base64") } : {}),
      });
    } catch (err) {
      const { status, message } = extractErrorDetails(err);
      res.status(status).json({ error: message });
    }
  });

  app.get("/api/v1/download/:clipParam", (req, res) => {
    const rawParam = req.params.clipParam || "";
    const clipId = rawParam.replace(/\.wav$/i, "");
    const clip = generatedClipsStore.get(clipId);
    if (!clip) {
      res.status(404).json({
        error: "Audio clip not found or expired from temporary cache. Please generate again.",
      });
      return;
    }

    const isInline = req.query.inline === "1" || req.query.inline === "true";
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Length", String(clip.buffer.length));
    res.setHeader(
      "Content-Disposition",
      `${isInline ? "inline" : "attachment"}; filename="${encodeURIComponent(clip.filename)}"`
    );
    res.send(clip.buffer);
  });

  app.get("/api/openapi.json", (req, res) => {
    const baseUrl = resolvePublicBaseUrl(req);
    const hasAuth = Boolean(process.env.STUDIO_API_TOKEN?.trim());

    res.json({
      openapi: "3.1.0",
      info: {
        title: "Kotha Studio Voiceover API",
        version: "1.0.0",
        description:
          "Generate natural Bengali, English, and Bilingual voiceovers (Male & Female single narrator or dual-speaker dialogues) and get direct downloadable .wav links.",
      },
      servers: [{ url: baseUrl }],
      ...(hasAuth
        ? {
            components: {
              securitySchemes: {
                bearerAuth: { type: "http", scheme: "bearer" },
              },
            },
            security: [{ bearerAuth: [] }],
          }
        : {}),
      paths: {
        "/api/v1/voices": {
          get: {
            operationId: "listVoices",
            summary: "List available Male & Female voices and supported languages",
            responses: {
              "200": {
                description: "Available voice personas and options",
              },
            },
          },
        },
        "/api/v1/voiceover": {
          post: {
            operationId: "generateVoiceover",
            summary: "Generate a Bengali or English voiceover and return a downloadable WAV URL",
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["script"],
                    properties: {
                      script: {
                        type: "string",
                        description:
                          "Narration text (or Speaker: line format for dual mode). Up to 15,000 chars.",
                      },
                      mode: { type: "string", enum: ["single", "dual"], default: "single" },
                      language: {
                        type: "string",
                        enum: ["bn", "en", "bilingual"],
                        default: "bn",
                      },
                      engine: {
                        type: "string",
                        enum: ["expressive", "fast"],
                        default: "expressive",
                      },
                      voiceName: {
                        type: "string",
                        enum: ["Kore", "Zephyr", "Puck", "Charon", "Fenrir"],
                        default: "Charon",
                      },
                      speakerAName: { type: "string", default: "আরিফ" },
                      speakerBName: { type: "string", default: "তানিয়া" },
                      speakerAVoice: {
                        type: "string",
                        enum: ["Kore", "Zephyr", "Puck", "Charon", "Fenrir"],
                        default: "Puck",
                      },
                      speakerBVoice: {
                        type: "string",
                        enum: ["Kore", "Zephyr", "Puck", "Charon", "Fenrir"],
                        default: "Kore",
                      },
                      stylePrompt: { type: "string" },
                      volumeGain: { type: "number", default: 1 },
                      normalize: { type: "boolean", default: true },
                      trimSilence: { type: "boolean", default: true },
                      format: { type: "string", enum: ["json", "wav"], default: "json" },
                    },
                  },
                },
              },
            },
            responses: {
              "200": {
                description:
                  "Voiceover generated successfully; returns downloadUrl for direct .wav download",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        ok: { type: "boolean" },
                        clipId: { type: "string" },
                        filename: { type: "string" },
                        downloadUrl: { type: "string" },
                        streamUrl: { type: "string" },
                        byteLength: { type: "number" },
                        modelUsed: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        "/api/v1/download/{clipId}.wav": {
          get: {
            operationId: "downloadVoiceoverWav",
            summary: "Download a generated WAV file",
            parameters: [
              {
                name: "clipId",
                in: "path",
                required: true,
                schema: { type: "string" },
              },
            ],
            responses: {
              "200": {
                description: "24 kHz Mono WAV audio file",
                content: { "audio/wav": {} },
              },
            },
          },
        },
      },
    });
  });

  const isProduction = process.env.NODE_ENV === "production";
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*all", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Kotha Studio running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
