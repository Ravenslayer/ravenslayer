# Kotha Studio — Bilingual Bengali & English Voiceover Workbench

A full-stack React + Express + Gemini Speech studio for generating natural Bengali (`বাংলা`), English, and Bilingual voiceovers with Male & Female voices, dual-speaker dialogues, WAV mastering, `.srt` subtitle export, and an OpenAPI-documented REST API for integrating with external AI agents (ChatGPT Custom GPTs, Claude, n8n, Make, Zapier, or custom scripts).

## Features

- **Single Narrator & Dual-Speaker Dialogue:** 5 studio voices (`Kore` & `Zephyr` Female; `Puck`, `Charon`, `Fenrir` Male) across Bengali, English, and Bilingual modes.
- **Long-Script Chunking & Stitching:** Automatically splits scripts up to 15,000 characters and stitches seamless 24 kHz mono `.wav` audio.
- **Script Naturalizer:** Converts rough Banglish, English, or notes into natural spoken Bangla or English.
- **Voice Style Matcher:** Upload or record a 5–20s voice clip to match cadence, gender, language, and style prompt.
- **Studio Mastering & Export:** Live `0.25x–2.00x` volume gain, `-1 dB` peak normalization, leading/trailing silence trim, batch processing, and `.srt` subtitle export.
- **External AI Integration API:** Ready-to-use `/api/v1/voiceover`, `/api/v1/download/:clipId.wav`, `/api/v1/voices`, and `/api/openapi.json` (OpenAPI 3.1) with CORS enabled.

## Deploy After Publishing to GitHub

1. Set `GEMINI_API_KEY` in your hosting environment (and optionally `APP_URL` and `STUDIO_API_TOKEN`).
2. Install, build, and start:

```bash
npm install
npm run build
npm start
```

## Integrating With Any External AI

Once deployed, point your AI tool or workflow to:
- **OpenAPI 3.1 Spec:** `https://YOUR_DOMAIN/api/openapi.json`
- **Voiceover Endpoint:** `POST https://YOUR_DOMAIN/api/v1/voiceover`
- **Voice List:** `GET https://YOUR_DOMAIN/api/v1/voices`

### Example cURL Request (Returns JSON + Direct WAV Download URL)

```bash
curl -X POST "https://YOUR_DOMAIN/api/v1/voiceover" \
  -H "Content-Type: application/json" \
  -d '{
    "script": "স্বাগতম আজকের বাংলা ভয়েসওভার সেশনে।",
    "mode": "single",
    "language": "bn",
    "voiceName": "Charon",
    "normalize": true,
    "trimSilence": true
  }'
```

To download the `.wav` binary directly in one request, pass `"format": "wav"` in the JSON body or fetch the returned `downloadUrl`.
