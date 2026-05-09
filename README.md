# Gripd.

<p align="center">
  <img src="./mascot.png" alt="Gripd mascot" width="260" />
</p>

<p align="center">
  A mobile-first learning game that turns saved AI papers into a podcast, swipe cards, concept graphs, and tiny system-design challenges for your commute.
</p>

---

## Problem Statement

Learning has a timing problem.

You save AI papers, GitHub repos, and hackathon ideas all day. Then life happens: dinner, friends, the MRT ride home, tired brain, unread tabs, guilt. Sitting down later to read a dense paper is technically possible, but emotionally impossible.

Gripd. is built for that exact gap: one hand on the train pole, noisy environment, no keyboard, ten minutes between stops. The app turns a paper link into an active, voice-led learning session that feels more like a game than homework.

## Why I Created It

I wanted an app that understands how builders actually live.

Gripd. does not ask you to become a perfect productivity person. You paste a paper link when you find it, then the app makes it commute-friendly:

- listen to the paper as a short AI podcast
- swipe through research tradeoff questions
- tap concept graph nodes to test understanding
- drag architecture pieces into a tiny system design
- earn XP only after interacting, not just passively saving links

The goal is simple: leave the train wanting to build something.

## What The App Does

### Voice Hype

Paste a paper link and Gripd. generates a two-speaker podcast script. The host and analyst can use separate ElevenLabs cloned voices, so the explanation sounds closer to a real briefing than a robotic summary.

### Paper Swipe

The app generates swipe questions from the paper. Swipe left or right to choose the better claim, then the feedback card explains the reasoning. Correct swipes get a pop sound; wrong swipes get a "booo" style sound.

### Concept Graph

Gripd. builds a small concept map from the paper. Tap the node that answers the prompt. Correct nodes turn green, wrong nodes turn red, and XP bubbles float from the graph node into the level bar.

### Build-A-System

The app creates a shorter paper-related architecture prompt. Drag components into the canvas and check whether the design covers the main system ideas.

### Mobile PWA Feel

The UI is designed around phone screens, iPhone simulator testing, one-thumb controls, offline-friendly local storage, and installable PWA behavior.

## Services And Tools Used

| Service / Tool | Used For | Current App Status |
|---|---|---|
| Exa.ai | Fetching/enriching paper content from pasted links | Wired through the local Vite API when `EXA_API_KEY` is set |
| OpenAI / GPT | Quick summary, podcast script, swipe questions, graph data, build prompt | Wired through the local Vite API when `OPENAI_API_KEY` or `OPEN_AI_API_KEY` is set |
| ElevenLabs | Host and analyst voice playback with cloned voices | Wired through the local Vite proxy when `ELEVENLABS_API_KEY` or `ELEVEN_LABS_API_KEY` is set |
| Gemini | Mascot image generation, plus voice-agent direction from the PRD and future live conversation mode | Mascot used in the app / live voice planned |
| Codex | Repo implementation, iteration, debugging, README, and mobile polish | Used during development |
| React + Vite | Mobile PWA frontend and local API middleware | Current app shell |
| IndexedDB | Saved links and local commute state | Current local persistence |
| Web Audio API | Swipe feedback, chime, and graph XP bubble sounds | Current browser audio layer |

## Environment Variables

Create or update `client/.env`.

```bash
# Exa paper fetch/enrichment
EXA_API_KEY=your_exa_key_here

# OpenAI learning-pack generation
OPENAI_API_KEY=your_openai_key_here
# or, if you already use this name:
OPEN_AI_API_KEY=your_openai_key_here

# Optional model override
OPENAI_MODEL=gpt-4.1-mini

# ElevenLabs voice generation
ELEVENLABS_API_KEY=your_elevenlabs_key_here
# or, if you already use this name:
ELEVEN_LABS_API_KEY=your_elevenlabs_key_here

# Speaker-specific cloned voice IDs
VITE_ELEVENLABS_VOICE_ANANYA_ID=your_host_voice_id_here
VITE_ELEVENLABS_VOICE_SNEHA_ID=your_analyst_voice_id_here
```

Keep API keys unprefixed unless the app explicitly needs them in the browser. `VITE_ELEVENLABS_VOICE_*` is safe because it is only a voice ID; the ElevenLabs API key stays server-side in the local Vite proxy.

## Run On Mac

```bash
cd client
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

Build check:

```bash
cd client
npm run build
```

Preview production build:

```bash
cd client
npm run preview
```

## Run On iPhone Simulator

Start the app so Safari inside Simulator can reach it:

```bash
cd client
npm run dev -- --host 0.0.0.0
```

Open Simulator:

```bash
open -a Simulator
```

Then in Simulator:

1. Open Safari.
2. Visit `http://localhost:5173/`.
3. If that does not load, use your Mac IP instead.

Find your Mac IP:

```bash
ipconfig getifaddr en0
```

Then open:

```txt
http://YOUR_MAC_IP:5173/
```

## Run On A Real iPhone

Make sure the Mac and iPhone are on the same Wi-Fi.

```bash
cd client
npm run dev -- --host 0.0.0.0
```

Find your Mac IP:

```bash
ipconfig getifaddr en0
```

Open Safari on the iPhone:

```txt
http://YOUR_MAC_IP:5173/
```

If audio does not play on iPhone Safari, tap once anywhere in the app before swiping. iOS requires a user gesture before browser audio can start.

## Demo Flow

1. Paste an ArXiv or paper URL.
2. Wait for the mascot loading screen while Gripd. fetches and generates the learning pack.
3. Open `Voice` and play the podcast.
4. Open `Papers` and swipe through the generated questions.
5. Open `Graph` and tap the correct concept nodes.
6. Open `Build` and drag system pieces into the canvas.
7. Watch XP update as you interact.

## Notes

- The app starts empty by design. It should generate content only after you paste a link.
- If old demo data appears, press `Reset` in the app or clear Safari site data for localhost.
- For the best phone demo, use iPhone 13 or iPhone 14 dimensions in Simulator.
- The mascot image was generated with Gemini and is used as the cute loading companion.
- Do not commit real API keys.

---

Built for the MRT. Made for tired builders who still want to learn.
