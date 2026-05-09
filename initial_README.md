# Gripd. — Mobile PWA (MVP)

Short: Turn commute time into one-handed, voice-native learning games.

This workspace contains the PRD and a React/Vite prototype for the Gripd. hackathon PWA. See the product requirements in [Gripd.PRD.md](Gripd.PRD.md).

Goals (MVP)
- Save a link (ArXiv / GitHub) and index it.
- Voice Hype: live narration of saved content (Gemini live / offline TTS fallback).
- One game mode: Paper vs Paper (AI analysis + swipe UX).
- XP + streak tracking (Convex sync).
- PWA install prompt and offline caching for tunnel use.

Implemented in the client prototype
- Mobile-first commute dashboard with XP, level, and streak state.
- Save-a-link flow backed by IndexedDB, with ArXiv/GitHub/event inference.
- Voice Hype session UI using browser speech synthesis as a local demo fallback.
- Paper Swipe mode with touch/pointer swiping, tap fallback, reveal feedback, and XP rewards.
- Concept Graph mode with tappable linked concepts and node detail cards.
- Build-a-System mode with mobile drag-and-drop architecture components and AI-style scoring.
- PWA manifest, icon, and service worker static assets under `client/public`.

Still stubbed for backend/API integration
- Exa.ai indexing is represented by local metadata inference.
- Gemini Live and ElevenLabs are represented by local speech synthesis and cached-state UI.
- GPT-5.5 scoring is represented by scripted Paper vs Paper rounds.
- Convex sync is represented by IndexedDB and `localStorage` state.

Current AI/model usage
- ElevenLabs is used for podcast audio when `ELEVEN_LABS_API_KEY` or `ELEVENLABS_API_KEY` is present and the speaker voice IDs are configured.
- Browser speech synthesis is used as the fallback if ElevenLabs is not configured or the request fails.
- Exa.ai is not called yet.
- GPT/Gemini are not called yet for paper analysis, graph generation, or question generation.
- Paper questions, graph prompts, architecture scoring, and concept links are currently local demo logic.

Running Commands

```bash
# install dependencies
cd client
npm install

# start the local dev server
npm run dev
```

The dev server runs at:

```txt
http://127.0.0.1:5173/
```

Phone simulator on your laptop:

```txt
Chrome -> View -> Developer -> Developer Tools -> Toggle Device Toolbar
Device: iPhone 14 Pro, Pixel 7, or any narrow mobile viewport
Open: http://127.0.0.1:5173/
```

Real iPhone Simulator on macOS:

```bash
# 1. Install Xcode from the Mac App Store first.

# 2. Start the app.
cd client
npm run dev -- --host 0.0.0.0

# 3. Open Simulator.
open -a Simulator
```

Then inside Simulator:
- Open Safari.
- Visit `http://localhost:5173/`.
- If that does not load, use your Mac LAN IP instead: `http://YOUR_MAC_IP:5173/`.

Find your Mac LAN IP:

```bash
ipconfig getifaddr en0
```

Real iPhone on the same Wi-Fi:

```bash
cd client
npm run dev -- --host 0.0.0.0
```

Then open Safari on your iPhone and visit:

```txt
http://YOUR_MAC_IP:5173/
```

Use these commands from `client/`:

```bash
# production build
npm run build

# preview the production build locally
npm run preview

# dependency security check
npm audit --audit-level=moderate
```

If you keep API keys in the repo-root `.env`, sync the Vite-safe client variables first:

```bash
# from repo root
./scripts/sync-env.sh
cd client
npm run dev
```

Required API keys / credentials
The MVP will require credentials for several AI and backend services. Provide these as environment variables in your `.env` (or on Vercel) before running.

- Gemini Live (real-time voice): `GEMINI_API_KEY`
- GPT-5.5 (analysis / game engine): `GPT5_API_KEY` or `OPENAI_API_KEY` depending on provider
- Exa.ai (neural search / indexing): `EXA_API_KEY`
- ElevenLabs (offline TTS, pre-cache): `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`
- Convex (realtime DB / sync): `CONVEX_URL` and `CONVEX_KEY` (or project-specific envs)
- Fal.ai (3D visuals / node art): `FAL_API_KEY`
- GPT Image 2 (illustrations): `IMAGE_API_KEY` or provider-specific key
- Vercel (optional, deployment): `VERCEL_TOKEN` (for CI / deploy)

Better podcast summarisation plan
- Current prototype: local scripted podcast demo generated from the saved link metadata.
- Better hackathon version: add a backend endpoint that fetches saved URL content, asks an LLM for a two-speaker podcast script, stores the result, then sends it to TTS.
- Do not call OpenAI/Gemini/ElevenLabs directly from the browser in production; keep API keys on a server or serverless function.

Suggested podcast pipeline:

```txt
Saved URL
-> Exa.ai fetch/search/enrich
-> GPT/Gemini creates structured podcast script
-> ElevenLabs generates audio using selected voice_id
-> Cache audio URL/blob for tunnel playback
```

Voice cloning
- Yes, you can create your own voice clone with ElevenLabs.
- Use your own voice only. For professional voice clones, ElevenLabs requires verification that the voice belongs to you.
- Fast path: ElevenLabs dashboard -> Voices -> Add a new voice -> Instant Voice Clone -> upload/record clean samples -> copy the `voice_id`.
- Put the Host voice ID in `client/.env` as `VITE_ELEVENLABS_VOICE_ANANYA_ID`.
- Put the Analyst voice ID in `client/.env` as `VITE_ELEVENLABS_VOICE_SNEHA_ID`.
- Put your API key in `client/.env` as `ELEVEN_LABS_API_KEY` or `ELEVENLABS_API_KEY`. Keep this unprefixed so the browser does not receive it.

Use your cloned voice in the local app:

```bash
# client/.env
ELEVEN_LABS_API_KEY=your_elevenlabs_key_here
VITE_ELEVENLABS_VOICE_ANANYA_ID=your_host_voice_id_here
VITE_ELEVENLABS_VOICE_SNEHA_ID=your_analyst_voice_id_here
```

Restart the dev server after editing env vars:

```bash
cd client
npm run dev -- --host 0.0.0.0
```

Then open Voice -> Podcast. The app will call ElevenLabs through the local Vite dev proxy. Host lines use the Ananya voice ID and Analyst lines use the Sneha voice ID. If the key or voice IDs are missing, it falls back to browser TTS.

Good voice sample tips:
- Record in a quiet room.
- Use a real mic or wired earbuds if possible.
- Speak naturally for a few minutes.
- Avoid background music, echo, fans, or other people talking.
- Use Professional Voice Clone later if you need higher quality than instant cloning.

Notes on keys and security
- Keep all keys out of source control. Use `.env.local` for local dev and project secrets on Vercel for production.
- Some providers (Gemini Live, GPT Image 2, Fal.ai, Exa.ai) may require project registration and scoped roles. Expect to provision per-team credentials for a hackathon demo.

ElevenLabs Creative plan
- The ElevenLabs "Creative" plan is compatible with the offline pre-cache workflow. Use your ElevenLabs API key and a voice ID from the Creative plan to synthesize high-quality narration for tunnel/offline playback.
- Environment variable names: we recommend `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` (you may already have `ELEVEN_LABS_API_KEY` in an existing `.env`; normalize to the names above when wiring the app).

Example `.env` entries

```
ELEVENLABS_API_KEY=your_elevenlabs_key_here
ELEVENLABS_VOICE_ID=creative-voice-uuid
```

Implementation note
- For offline playback, pre-generate/synthesize audio files at home (on Wi‑Fi) and cache them via the service worker or IndexedDB. During the ride, the app should prefer the cached audio and fall back to real-time Gemini Live when connectivity permits.

What I did so far
- Read the PRD: [Gripd.PRD.md](Gripd.PRD.md)
- Created a concise TODO plan for the MVP using the repository task tracker.
- Added this `README.md` with required API keys and next steps.

Next engineering steps:
- Add a small API layer for Exa ingestion and metadata enrichment.
- Wire Gemini Live / ElevenLabs behind server-side endpoints so API keys stay off-device.
- Replace scripted Paper vs Paper rounds with GPT-backed analysis from saved links.
- Add Convex schema and sync XP, streaks, and saved content across devices.

Using root .env with the client
- If you keep a single `.env` in the repo root, you can sync relevant keys into the client env file.
- I added a helper script at `scripts/sync-env.sh` that copies the ElevenLabs API key as `ELEVENLABS_API_KEY` for the local Vite proxy, and copies the voice ID as `VITE_ELEVENLABS_VOICE_ID` for the browser.

Example usage:

```bash
# from repo root
./scripts/sync-env.sh
cd client
# installs and runs the dev server
npm install
npm run dev
```

The script maps common keys. Edit `scripts/sync-env.sh` if you need additional mappings.
