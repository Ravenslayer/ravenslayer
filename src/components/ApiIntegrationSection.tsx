import { Check, Code2, Copy, Download, ExternalLink, Loader2, Play } from "lucide-react";
import { useMemo, useState } from "react";
import type { StudioMode, VoiceEngine, VoiceLanguage } from "../types/voiceover";

interface ApiIntegrationSectionProps {
  script: string;
  mode: StudioMode;
  language: VoiceLanguage;
  engine: VoiceEngine;
  voiceName: string;
  speakerAName: string;
  speakerBName: string;
  speakerAVoice: string;
  speakerBVoice: string;
  stylePrompt: string;
  volumeGain: number;
  normalize: boolean;
  trimSilence: boolean;
}

type SnippetTab = "curl" | "javascript" | "python" | "gpt";

interface TestResult {
  clipId: string;
  filename: string;
  downloadUrl: string;
  streamUrl: string;
  byteLength: number;
  modelUsed: string;
}

export function ApiIntegrationSection({
  script,
  mode,
  language,
  engine,
  voiceName,
  speakerAName,
  speakerBName,
  speakerAVoice,
  speakerBVoice,
  stylePrompt,
  volumeGain,
  normalize,
  trimSilence,
}: ApiIntegrationSectionProps) {
  const [activeTab, setActiveTab] = useState<SnippetTab>("gpt");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-deployed-app-url";
  const openApiUrl = `${origin}/api/openapi.json`;
  const endpointUrl = `${origin}/api/v1/voiceover`;

  const samplePayload = useMemo(() => {
    const cleanScript =
      script.trim() ||
      (language === "en"
        ? "Welcome to Kotha Studio. Your external AI integration is ready."
        : "স্বাগতম কথা স্টুডিওতে। আপনার এক্সটার্নাল এআই ইন্টিগ্রেটর এখন প্রস্তুত।");

    const base: Record<string, unknown> = {
      script: cleanScript.slice(0, 260),
      mode,
      language,
      engine: mode === "dual" ? "expressive" : engine,
      volumeGain,
      normalize,
      trimSilence,
      format: "json",
    };

    if (mode === "dual") {
      base.speakerAName = speakerAName || (language === "en" ? "Alex" : "আরিফ");
      base.speakerBName = speakerBName || (language === "en" ? "Maya" : "তানিয়া");
      base.speakerAVoice = speakerAVoice;
      base.speakerBVoice = speakerBVoice;
    } else {
      base.voiceName = voiceName;
    }

    if (stylePrompt.trim()) {
      base.stylePrompt = stylePrompt.trim().slice(0, 180);
    }

    return base;
  }, [
    script,
    mode,
    language,
    engine,
    voiceName,
    speakerAName,
    speakerBName,
    speakerAVoice,
    speakerBVoice,
    stylePrompt,
    volumeGain,
    normalize,
    trimSilence,
  ]);

  const codeSnippet = useMemo(() => {
    const jsonBody = JSON.stringify(samplePayload, null, 2);

    if (activeTab === "gpt") {
      return `OpenAPI Schema URL (Paste into ChatGPT Custom GPT Actions / AI Tool):
${openApiUrl}

Copy & Paste this Instruction for your AI:
"Whenever the user asks for a Bengali or English voiceover, call generateVoiceover on ${endpointUrl}. Use 'Kore' or 'Zephyr' for female voices and 'Charon', 'Puck', or 'Fenrir' for male voices. For two speakers, set mode to 'dual' and format each line as 'SpeakerName: text'. Always return the 'downloadUrl' clearly as a clickable Download WAV link."`;
    }

    if (activeTab === "curl") {
      return `# 1) Returns JSON with direct downloadUrl for the .wav file
curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${jsonBody.replace(/'/g, "'\\''")}'

# Tip: Set "format": "wav" and add --output voiceover.wav to download the binary directly.`;
    }

    if (activeTab === "javascript") {
      return `const response = await fetch("${endpointUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${jsonBody}),
});

const data = await response.json();
// Direct downloadable .wav link you can save or return in any AI chat:
console.log("Download WAV:", data.downloadUrl);`;
    }

    return `import requests

res = requests.post(
    "${endpointUrl}",
    json=${jsonBody
      .replace(/\btrue\b/g, "True")
      .replace(/\bfalse\b/g, "False")},
)
data = res.json()
print("Download WAV:", data["downloadUrl"])

# Download the .wav file directly to disk:
wav_bytes = requests.get(data["downloadUrl"]).content
with open(data["filename"], "wb") as f:
    f.write(wav_bytes)`;
  }, [activeTab, endpointUrl, openApiUrl, samplePayload]);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((curr) => (curr === key ? null : curr)), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadOpenApi = async () => {
    try {
      const res = await fetch("/api/openapi.json");
      const json = await res.text();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kotha-studio-openapi.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      setTestError("Could not download OpenAPI schema.");
    }
  };

  const handleTestApi = async () => {
    setTestError(null);
    setIsTesting(true);
    try {
      const res = await fetch("/api/v1/voiceover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(samplePayload),
      });
      const data = (await res.json()) as Partial<TestResult> & { error?: string };
      if (!res.ok || !data.downloadUrl) {
        throw new Error(data.error || "API call failed.");
      }
      setTestResult({
        clipId: data.clipId || "",
        filename: data.filename || "kotha_voiceover.wav",
        downloadUrl: data.downloadUrl,
        streamUrl: data.streamUrl || data.downloadUrl,
        byteLength: data.byteLength || 0,
        modelUsed: data.modelUsed || "gemini-3.8-flash-tts",
      });
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Could not test external API.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section
      id="api-integration-section"
      className="rounded-xl border border-slate-200 bg-white overflow-hidden"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <Code2 className="h-4 w-4 text-blue-700" />
            <h2 className="text-base font-semibold text-slate-900 font-bengali">
              External AI &amp; GitHub API Integration (যেকোনো এআই-এর সাথে কানেক্ট ও WAV ডাউনলোড)
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed font-bengali">
            গিটহাবে পাবলিশ ও ডিপ্লয় করার পর নিচের OpenAPI লিংক বা REST API ব্যবহার করে ChatGPT Custom
            GPT, Claude, n8n, Make বা যেকোনো এআই এজেন্ট থেকেই সরাসরি ভয়েসওভার তৈরি করে `.wav` ফাইল
            ডাউনলোড লিংক পাবেন।
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void handleDownloadOpenApi()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-blue-700" />
            Download OpenAPI JSON
          </button>
          <button
            type="button"
            disabled={isTesting}
            onClick={() => void handleTestApi()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isTesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {isTesting ? "Testing API..." : "Test API & Get Download Link"}
          </button>
        </div>
      </div>

      {/* Endpoint & OpenAPI Spec Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-slate-200 bg-slate-50/50 px-5 py-3.5">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2">
          <div className="min-w-0">
            <span className="block text-[11px] font-medium text-slate-500">
              Voiceover API Endpoint (POST)
            </span>
            <code className="block truncate text-xs font-mono text-slate-900">{endpointUrl}</code>
          </div>
          <button
            type="button"
            onClick={() => void copyText("endpoint", endpointUrl)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0 cursor-pointer"
          >
            {copiedKey === "endpoint" ? (
              <Check className="h-3.5 w-3.5 text-emerald-700" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedKey === "endpoint" ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2">
          <div className="min-w-0">
            <span className="block text-[11px] font-medium text-slate-500">
              OpenAPI 3.1 Schema URL (For Any AI Tool)
            </span>
            <code className="block truncate text-xs font-mono text-slate-900">{openApiUrl}</code>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="/api/openapi.json"
              target="_blank"
              rel="noreferrer"
              title="Open OpenAPI spec"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => void copyText("openapi", openApiUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              {copiedKey === "openapi" ? (
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedKey === "openapi" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      {/* Live API Test Result with Direct WAV Download */}
      {(testError || testResult) && (
        <div className="border-b border-slate-200 px-5 py-3.5 bg-white">
          {testError ? (
            <p className="text-xs text-red-700">{testError}</p>
          ) : testResult ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-700">
                  API Response Ready · {(testResult.byteLength / 1024).toFixed(0)} KB WAV ·{" "}
                  <span className="font-mono">{testResult.modelUsed}</span>
                </p>
                <p className="text-xs font-mono text-slate-600 truncate">
                  Download URL: {testResult.downloadUrl}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <audio controls src={testResult.streamUrl} className="h-8 max-w-[220px]" />
                <a
                  href={testResult.downloadUrl}
                  download={testResult.filename}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download WAV
                </a>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Integration Code Snippets */}
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: "gpt", label: "Easy AI Connect (No Code)" },
                { id: "curl", label: "cURL" },
                { id: "javascript", label: "JavaScript" },
                { id: "python", label: "Python" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void copyText("snippet", codeSnippet)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedKey === "snippet" ? (
              <Check className="h-3.5 w-3.5 text-emerald-700" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedKey === "snippet" ? "Copied Snippet" : "Copy Snippet"}
          </button>
        </div>

        <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-xs leading-relaxed text-slate-100 font-mono">
          <code>{codeSnippet}</code>
        </pre>
      </div>
    </section>
  );
}
