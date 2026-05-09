import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { clearLinks, deleteLink, listLinks, saveLink, SavedLink } from './idb'
import './styles.css'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Mode = 'voice' | 'papers' | 'graph' | 'systems'
type Skill = 'systems' | 'research' | 'concepts' | 'voice'

type Progress = Record<Skill, number> & {
  xp: number
  streak: number
}

type PaperRound = {
  title: string
  left: string
  right: string
  claim: string
  winner: 'left' | 'right'
  reason: string
}

type PaperResult = {
  label: string
  tone: 'success' | 'fail'
  reason: string
} | null

type PodcastSegment = {
  speaker: string
  line: string
}

type ImportMetaEnv = {
  readonly VITE_ELEVENLABS_VOICE_ID?: string
  readonly VITE_ELEVENLABS_VOICE_ANANYA_ID?: string
  readonly VITE_ELEVENLABS_VOICE_SNEHA_ID?: string
}

declare global {
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }

  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

let sharedAudioContext: AudioContext | null = null

type GraphNode = {
  id: string
  label: string
  x: number
  y: number
  skill: Skill
  detail: string
}

type GraphChallenge = {
  prompt: string
  answerId: string
  success: string
}

type PlacedComponent = {
  id: string
  label: string
  x: number
  y: number
}

type XpBubble = {
  id: string
  amount: number
  skill: Skill
  tone: 'success' | 'fail'
  fromX: number
  fromY: number
  toX: number
  toY: number
}

type LearningPack = {
  url: string
  title: string
  summary: string
  podcastSegments: PodcastSegment[]
  paperRounds: PaperRound[]
  graphNodes: GraphNode[]
  graphEdges: string[][]
  graphChallenges: GraphChallenge[]
  systemPrompt: string
  sourceProvider?: string
  generatedBy?: string
}

const STORAGE_KEY = 'gripd-progress-v2'

const emptyLink: SavedLink = {
  url: '',
  title: 'No paper saved yet',
  description: 'Paste an ArXiv, paper, GitHub, or article link to generate your commute games.',
  kind: 'link',
  savedAt: 0,
  cached: false,
  tags: ['Empty'],
}

const paperRounds: PaperRound[] = [
  {
    title: 'RAG vs fine-tuning',
    left: 'Retrieval augmented generation',
    right: 'Fine-tune the model',
    claim: 'You saved five new papers this morning. Which approach adapts fastest without retraining?',
    winner: 'left',
    reason:
      'RAG can ingest new papers into the retrieval layer immediately. Fine-tuning is useful later, but it is slower and heavier for fresh knowledge.',
  },
  {
    title: 'MRT tunnel mode',
    left: 'Pre-cache summaries and audio',
    right: 'Fetch everything live',
    claim: 'Your train is about to enter a weak-signal tunnel. Which design keeps the podcast playing?',
    winner: 'left',
    reason:
      'Pre-caching turns saved links into local summaries, cards, and audio before the ride. Live fetching breaks when connectivity drops.',
  },
  {
    title: 'Paper battle scoring',
    left: 'Score exact answer only',
    right: 'Score reasoning quality',
    claim: 'In Hot Take Reactor, what should the AI judge when users argue about a paper?',
    winner: 'right',
    reason:
      'The PRD says reasoning matters more than picking the socially approved answer. A user can disagree and still show strong tradeoff thinking.',
  },
  {
    title: 'Architecture choice',
    left: 'One giant prompt',
    right: 'Chunk, retrieve, rerank',
    claim: 'A saved repo has a huge README, issues, and examples. Which approach gives better grounded answers?',
    winner: 'right',
    reason:
      'Chunking plus retrieval and reranking keeps answers tied to the most relevant source snippets instead of stuffing everything into one brittle prompt.',
  },
  {
    title: 'Voice learning',
    left: 'Passive podcast only',
    right: 'Podcast plus game checks',
    claim: 'Which format better fits a tired commuter who still needs to remember the paper?',
    winner: 'right',
    reason:
      'Passive listening is useful, but the game check forces retrieval practice. That is what turns the commute into actual learning.',
  },
]

const graphNodes: GraphNode[] = [
  {
    id: 'rag',
    label: 'RAG',
    x: 52,
    y: 80,
    skill: 'research',
    detail: 'Saved papers connect retrieval choices to answer quality.',
  },
  {
    id: 'rerank',
    label: 'Reranking',
    x: 232,
    y: 56,
    skill: 'research',
    detail: 'Ranks retrieved chunks before the model spends tokens.',
  },
  {
    id: 'cache',
    label: 'Offline Cache',
    x: 292,
    y: 176,
    skill: 'systems',
    detail: 'Prepares voice and cards at home before the commute.',
  },
  {
    id: 'voice',
    label: 'Voice Hype',
    x: 108,
    y: 210,
    skill: 'voice',
    detail: 'Turns saved links into spoken, opinionated commute briefs.',
  },
  {
    id: 'cost',
    label: 'Cost',
    x: 198,
    y: 310,
    skill: 'concepts',
    detail: 'Long-context answers are simple but can waste tokens.',
  },
]

const graphEdges = [
  ['rag', 'rerank'],
  ['rag', 'voice'],
  ['rerank', 'cache'],
  ['cache', 'voice'],
  ['cache', 'cost'],
  ['rerank', 'cost'],
]

const graphChallenges: GraphChallenge[] = [
  {
    prompt: 'Tap the concept that makes fresh papers usable without model retraining.',
    answerId: 'rag',
    success: 'RAG lets the app add new saved content through retrieval instead of retraining the model.',
  },
  {
    prompt: 'Tap the concept that lowers token cost before generation.',
    answerId: 'rerank',
    success: 'Reranking filters the context before the model spends tokens.',
  },
  {
    prompt: 'Tap the concept that keeps lessons alive when the MRT connection drops.',
    answerId: 'cache',
    success: 'Offline cache is the tunnel survival layer.',
  },
  {
    prompt: 'Tap the concept that turns passive reading into spoken commute learning.',
    answerId: 'voice',
    success: 'Voice Hype is the hands-free interaction layer.',
  },
  {
    prompt: 'Tap the concept that becomes risky when you send irrelevant chunks to a model.',
    answerId: 'cost',
    success: 'Cost rises when the app pays for useless tokens, especially with long context.',
  },
]

const palette = {
  systems: '#3c78d8',
  research: '#4fb286',
  concepts: '#efb84d',
  voice: '#ef6f4d',
}

const components = ['Client', 'API', 'Queue', 'Cache', 'Vector DB', 'Worker']
const requiredSystem = ['Client', 'API', 'Cache', 'Vector DB', 'Worker']

function readProgress(): Progress {
  const fallback: Progress = { xp: 0, streak: 0, systems: 0, research: 0, concepts: 0, voice: 0 }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...fallback, ...JSON.parse(stored) } : fallback
  } catch {
    return fallback
  }
}

function levelForXp(xp: number) {
  return Math.max(1, Math.floor(xp / 120) + 1)
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return

  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.04
  utterance.pitch = 1.05
  window.speechSynthesis.speak(utterance)
}

function speakPodcast(segments: PodcastSegment[]) {
  if (!('speechSynthesis' in window)) return

  window.speechSynthesis.cancel()
  const voices = window.speechSynthesis.getVoices()

  segments.forEach((segment, index) => {
    const utterance = new SpeechSynthesisUtterance(segment.line)
    utterance.rate = segment.speaker === 'Host' ? 1.06 : 0.98
    utterance.pitch = segment.speaker === 'Host' ? 1.08 : 0.94
    utterance.voice = voices[index % Math.max(voices.length, 1)] || null
    window.speechSynthesis.speak(utterance)
  })
}

function fallbackLearningPack(link: SavedLink): LearningPack {
  if (!link.url) return emptyLearningPack()

  return {
    url: link.url,
    title: link.title,
    summary: link.description,
    podcastSegments: makePodcast(link),
    paperRounds,
    graphNodes,
    graphEdges,
    graphChallenges,
    systemPrompt: `Design a flow that turns ${link.title} into cached podcast audio and quiz cards for a commute.`,
  }
}

function emptyLearningPack(): LearningPack {
  return {
    url: '',
    title: 'No paper saved yet',
    summary: 'Paste a link to generate a podcast, paper swipe questions, concept graph, and architecture challenge.',
    podcastSegments: [
      {
        speaker: 'Host',
        line: 'Paste a paper link first. I will turn it into a commute podcast and games.',
      },
    ],
    paperRounds: [],
    graphNodes: [],
    graphEdges: [],
    graphChallenges: [],
    systemPrompt: 'Save a paper link to generate a build challenge.',
    generatedBy: 'empty',
  }
}

async function fetchLearningPack(link: SavedLink): Promise<LearningPack> {
  const response = await fetch('/api/learning-pack', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url: link.url }),
  })

  if (!response.ok) throw new Error('Learning pack generation failed')
  return response.json()
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null

  sharedAudioContext ||= new AudioContextClass()
  if (sharedAudioContext.state === 'suspended') void sharedAudioContext.resume()
  return sharedAudioContext
}

function unlockAudio() {
  const audio = getAudioContext()
  if (!audio) return

  const gain = audio.createGain()
  const oscillator = audio.createOscillator()
  gain.gain.setValueAtTime(0.0001, audio.currentTime)
  oscillator.connect(gain)
  gain.connect(audio.destination)
  oscillator.start(audio.currentTime)
  oscillator.stop(audio.currentTime + 0.03)
}

function playResultSound(tone: 'success' | 'fail') {
  const audio = getAudioContext()
  if (!audio) return

  if ('vibrate' in navigator) {
    navigator.vibrate(tone === 'success' ? [18] : [45, 30, 45])
  }

  const gain = audio.createGain()
  gain.connect(audio.destination)
  gain.gain.setValueAtTime(0.001, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(tone === 'success' ? 0.42 : 0.36, audio.currentTime + 0.018)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.72)

  if (tone === 'success') {
    ;[620, 880, 1240, 1480].forEach((frequency, index) => {
      const oscillator = audio.createOscillator()
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime + index * 0.06)
      oscillator.connect(gain)
      oscillator.start(audio.currentTime + index * 0.06)
      oscillator.stop(audio.currentTime + 0.26 + index * 0.06)
    })
    return
  }

  ;[190, 135, 100].forEach((frequency, index) => {
    const oscillator = audio.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime + index * 0.12)
    oscillator.frequency.exponentialRampToValueAtTime(76, audio.currentTime + 0.42 + index * 0.1)
    oscillator.connect(gain)
    oscillator.start(audio.currentTime + index * 0.1)
    oscillator.stop(audio.currentTime + 0.54 + index * 0.1)
  })
}

function playCuteChime() {
  const audio = getAudioContext()
  if (!audio) return

  const gain = audio.createGain()
  gain.connect(audio.destination)
  gain.gain.setValueAtTime(0.001, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.7)

  ;[660, 880, 1320].forEach((frequency, index) => {
    const oscillator = audio.createOscillator()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime + index * 0.08)
    oscillator.connect(gain)
    oscillator.start(audio.currentTime + index * 0.08)
    oscillator.stop(audio.currentTime + 0.24 + index * 0.08)
  })
}

function playBubbleSound() {
  const audio = getAudioContext()
  if (!audio) return

  const gain = audio.createGain()
  gain.connect(audio.destination)
  gain.gain.setValueAtTime(0.001, audio.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.22, audio.currentTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.55)

  ;[300, 420, 560, 740].forEach((frequency, index) => {
    const oscillator = audio.createOscillator()
    oscillator.type = 'sine'
    const start = audio.currentTime + index * 0.075
    oscillator.frequency.setValueAtTime(frequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.45, start + 0.12)
    oscillator.connect(gain)
    oscillator.start(start)
    oscillator.stop(start + 0.16)
  })
}

function makePodcast(link: SavedLink): PodcastSegment[] {
  const angle =
    link.kind === 'repo'
      ? 'what this repo lets you build tonight'
      : link.kind === 'paper'
        ? 'what this paper changes about your architecture choices'
        : 'why this link matters before the next stop'

  return [
    {
      speaker: 'Host',
      line: `Welcome back to Gripd. You saved ${link.title}, and this is not homework. It is a build prompt.`,
    },
    {
      speaker: 'Analyst',
      line: `The angle is ${angle}. Do not memorise the page. Extract one decision you can use.`,
    },
    {
      speaker: 'Host',
      line: `The punchline: ${link.description} That is the part worth arguing about on the train.`,
    },
    {
      speaker: 'Analyst',
      line: 'Connect it to retrieval, caching, cost, or reliability. That is how a passive read becomes a game round.',
    },
  ]
}

async function playElevenLabsPodcast(segments: PodcastSegment[]) {
  const hostVoiceId = import.meta.env.VITE_ELEVENLABS_VOICE_ANANYA_ID || import.meta.env.VITE_ELEVENLABS_VOICE_ID
  const analystVoiceId = import.meta.env.VITE_ELEVENLABS_VOICE_SNEHA_ID || hostVoiceId

  if (!hostVoiceId || !analystVoiceId) return false

  for (const segment of segments) {
    const voiceId = segment.speaker === 'Host' ? hostVoiceId : analystVoiceId
    const response = await fetch(`/api/elevenlabs/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: segment.line,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.82,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) return false

    const blob = await response.blob()
    const audio = new Audio(URL.createObjectURL(blob))
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Audio playback failed'))
      audio.play().catch(reject)
    })
  }
  return true
}

function getClientPoint(event: PointerEvent<HTMLElement>) {
  return { x: event.clientX, y: event.clientY }
}

export default function App() {
  const [url, setUrl] = useState('')
  const [links, setLinks] = useState<SavedLink[]>([])
  const [progress, setProgress] = useState<Progress>(() => readProgress())
  const [activeMode, setActiveMode] = useState<Mode>('voice')
  const [activeLink, setActiveLink] = useState<SavedLink | null>(null)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [message, setMessage] = useState('Commute session ready.')
  const [paperIndex, setPaperIndex] = useState(0)
  const [cardOffset, setCardOffset] = useState(0)
  const [paperResult, setPaperResult] = useState<PaperResult>(null)
  const [podcastSegments, setPodcastSegments] = useState<PodcastSegment[]>(() => emptyLearningPack().podcastSegments)
  const [learningPack, setLearningPack] = useState<LearningPack>(() => emptyLearningPack())
  const [learningPacks, setLearningPacks] = useState<Record<string, LearningPack>>({})
  const [packLoading, setPackLoading] = useState(false)
  const [loadingLinkTitle, setLoadingLinkTitle] = useState('')
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [graphChallengeIndex, setGraphChallengeIndex] = useState(0)
  const [graphNodeStates, setGraphNodeStates] = useState<Record<string, 'success' | 'fail'>>({})
  const [graphFeedback, setGraphFeedback] = useState('Find the concept that answers the prompt.')
  const [xpBubbles, setXpBubbles] = useState<XpBubble[]>([])
  const [progressReceiving, setProgressReceiving] = useState(false)
  const [placed, setPlaced] = useState<PlacedComponent[]>([
    { id: 'seed-client', label: 'Client', x: 14, y: 38 },
    { id: 'seed-api', label: 'API', x: 42, y: 38 },
  ])
  const [draggingComponent, setDraggingComponent] = useState<string | null>(null)
  const [draggingPlacedId, setDraggingPlacedId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<{ label: string; x: number; y: number } | null>(null)
  const [systemFeedback, setSystemFeedback] = useState('Drag components onto the canvas, then score the design.')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLElement | null>(null)
  const startXRef = useRef(0)

  const availableLinks = links
  const hasLearningPack = Boolean(learningPack.url)
  const currentPaperRounds = learningPack.paperRounds.length ? learningPack.paperRounds : paperRounds
  const currentGraphNodes = learningPack.graphNodes.length ? learningPack.graphNodes : graphNodes
  const currentGraphEdges = learningPack.graphEdges.length ? learningPack.graphEdges : graphEdges
  const currentGraphChallenges = learningPack.graphChallenges.length ? learningPack.graphChallenges : graphChallenges
  const currentPaper = currentPaperRounds[paperIndex % Math.max(currentPaperRounds.length, 1)]
  const level = levelForXp(progress.xp)
  const nextLevelXp = level * 120
  const levelProgress = Math.min(100, Math.round(((progress.xp % 120) / 120) * 100))

  const voiceScript = useMemo(() => {
    return learningPack.summary || `Turn this saved link into one decision before your next stop.`
  }, [learningPack])

  useEffect(() => {
    const nextLink = activeLink
    if (!nextLink) return
    loadLearningPack(nextLink)
  }, [activeLink])

  useEffect(() => {
    refresh()

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }

    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  }, [progress])

  async function refresh() {
    const all = await listLinks()
    setLinks(all)
    setActiveLink((current) => current || all[0] || null)
  }

  async function loadLearningPack(link: SavedLink) {
    const cached = learningPacks[link.url]
    if (cached) {
      setLearningPack(cached)
      setPodcastSegments(cached.podcastSegments)
      setSelectedNode(cached.graphNodes[0] || null)
      setPaperIndex(0)
      setGraphChallengeIndex(0)
      setGraphNodeStates({})
      setGraphFeedback('Find the concept that answers the prompt.')
      return
    }

    setPackLoading(true)
    setLoadingLinkTitle(link.title || link.url)
    playCuteChime()
    const fallback = fallbackLearningPack(link)

    try {
      const generated = await fetchLearningPack(link)
      setLearningPacks((current) => ({ ...current, [link.url]: generated }))
      setLearningPack(generated)
      setPodcastSegments(generated.podcastSegments)
      setSelectedNode(generated.graphNodes[0] || null)
      setMessage(`Generated from ${generated.sourceProvider || 'source'} with ${generated.generatedBy || 'local'} content.`)
    } catch {
      setLearningPack(fallback)
      setPodcastSegments(fallback.podcastSegments)
      setSelectedNode(fallback.graphNodes[0] || null)
      setMessage('Could not fetch the link, using local fallback questions.')
    } finally {
      setPaperIndex(0)
      setGraphChallengeIndex(0)
      setGraphNodeStates({})
      setGraphFeedback('Find the concept that answers the prompt.')
      setPackLoading(false)
      setLoadingLinkTitle('')
    }
  }

  function addXp(amount: number, skill: Skill) {
    setProgress((current) => ({
      ...current,
      xp: current.xp + amount,
      streak: Math.max(current.streak, 4),
      [skill]: current[skill] + 1,
    }))
  }

  function animateGraphXp(node: GraphNode, amount: number, skill: Skill, tone: 'success' | 'fail') {
    const shellRect = document.querySelector('.phone-shell')?.getBoundingClientRect()
    const stageRect = document.querySelector('.graph-stage')?.getBoundingClientRect()
    const progressRect = progressRef.current?.getBoundingClientRect()

    if (!shellRect || !stageRect || !progressRect) {
      addXp(amount, skill)
      return
    }

    const bubble: XpBubble = {
      id: `${node.id}-${Date.now()}`,
      amount,
      skill,
      tone,
      fromX: stageRect.left - shellRect.left + (node.x / 360) * stageRect.width,
      fromY: stageRect.top - shellRect.top + (node.y / 360) * stageRect.height,
      toX: progressRect.left - shellRect.left + progressRect.width / 2,
      toY: progressRect.top - shellRect.top + progressRect.height / 2,
    }

    setXpBubbles((current) => [...current, bubble])
    playBubbleSound()
    window.setTimeout(() => {
      addXp(amount, skill)
      setProgressReceiving(true)
      setXpBubbles((current) => current.filter((item) => item.id !== bubble.id))
      window.setTimeout(() => setProgressReceiving(false), 320)
    }, 1450)
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!url.trim()) return

    await saveLink(url)
    const savedUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
    const inferredLink = {
      url: savedUrl,
      title: savedUrl,
      description: 'Generating commute learning pack from this saved link.',
      kind: 'link',
      savedAt: Date.now(),
      cached: true,
      tags: ['Learning'],
    } satisfies SavedLink
    setUrl('')
    const empty = emptyLearningPack()
    setLearningPack(empty)
    setPodcastSegments(empty.podcastSegments)
    setPaperResult(null)
    setGraphNodeStates({})
    setSelectedNode(null)
    setLoadingLinkTitle(savedUrl)
    setMessage('Saved. Generating podcast, questions, graph, and build checks from the link.')
    addXp(8, 'concepts')
    setActiveLink(inferredLink)
    await loadLearningPack(inferredLink)
    await refresh()
  }

  async function onDelete(linkUrl: string) {
    await deleteLink(linkUrl)
    setMessage('Removed from tomorrow ride queue.')
    await refresh()
  }

  async function resetDemoState() {
    await clearLinks()
    localStorage.removeItem(STORAGE_KEY)
    const empty = emptyLearningPack()
    setLinks([])
    setActiveLink(null)
    setProgress({ xp: 0, streak: 0, systems: 0, research: 0, concepts: 0, voice: 0 })
    setLearningPack(empty)
    setPodcastSegments(empty.podcastSegments)
    setLearningPacks({})
    setSelectedNode(null)
    setGraphNodeStates({})
    setGraphFeedback('Find the concept that answers the prompt.')
    setMessage('Reset complete. Paste a link to begin.')
  }

  async function startVoiceHype() {
    setMessage('Generating cloned-voice podcast if ElevenLabs is configured.')
    try {
      const playedClone = await playElevenLabsPodcast(podcastSegments)
      if (playedClone) {
        setMessage('Playing podcast with your ElevenLabs voice clone.')
        addXp(15, 'voice')
        return
      }
    } catch {
      setMessage('ElevenLabs failed, falling back to browser TTS.')
    }

    speakPodcast(podcastSegments)
    setMessage('Podcast briefing running with browser TTS fallback.')
    addXp(15, 'voice')
  }

  function playQuickBrief() {
    setMessage('Quick brief running.')
    speak(voiceScript)
    addXp(8, 'voice')
  }

  function stopVoiceHype() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setMessage('Voice Hype paused.')
  }

  function answerPaper(choice: 'left' | 'right') {
    if (paperResult) return
    const correct = choice === currentPaper.winner
    const tone = correct ? 'success' : 'fail'
    setPaperResult({
      label: correct ? 'Correct' : 'Booo',
      tone,
      reason: currentPaper.reason,
    })
    playResultSound(tone)
    addXp(correct ? 30 : 12, 'research')
  }

  function nextPaper() {
    setPaperIndex((current) => (current + 1) % currentPaperRounds.length)
    setPaperResult(null)
    setCardOffset(0)
  }

  function onPaperPointerDown(event: PointerEvent<HTMLElement>) {
    unlockAudio()
    startXRef.current = getClientPoint(event).x
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPaperPointerMove(event: PointerEvent<HTMLElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    setCardOffset(getClientPoint(event).x - startXRef.current)
  }

  function onPaperPointerUp(event: PointerEvent<HTMLElement>) {
    if (paperResult) {
      if (Math.abs(cardOffset) > 60) nextPaper()
      setCardOffset(0)
      event.currentTarget.releasePointerCapture(event.pointerId)
      return
    }

    if (Math.abs(cardOffset) > 80) {
      answerPaper(cardOffset > 0 ? 'right' : 'left')
    }

    setCardOffset(0)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function selectNode(node: GraphNode) {
    setSelectedNode(node)
    const challenge = currentGraphChallenges[graphChallengeIndex % currentGraphChallenges.length]
    const correct = node.id === challenge.answerId

    setGraphNodeStates((current) => ({
      ...current,
      [node.id]: correct ? 'success' : 'fail',
    }))

    if (correct) {
      setGraphFeedback(challenge.success)
      setGraphChallengeIndex((current) => (current + 1) % currentGraphChallenges.length)
      animateGraphXp(node, 18, 'concepts', 'success')
      return
    }

    setGraphFeedback(`${node.label} is connected, but not the answer for this prompt.`)
    animateGraphXp(node, -6, 'concepts', 'fail')
  }

  function placeComponent(label: string, clientX: number, clientY: number, existingId?: string) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = Math.min(82, Math.max(4, ((clientX - rect.left) / rect.width) * 100 - 10))
    const y = Math.min(82, Math.max(6, ((clientY - rect.top) / rect.height) * 100 - 6))

    setPlaced((current) => {
      if (existingId) {
        return current.map((item) => (item.id === existingId ? { ...item, x, y } : item))
      }

      return [...current, { id: `${label}-${Date.now()}`, label, x, y }]
    })
  }

  function onPalettePointerDown(label: string, event: PointerEvent<HTMLButtonElement>) {
    setDraggingComponent(label)
    setDragPreview({ label, x: event.clientX, y: event.clientY })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPalettePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (!draggingComponent) return
    setDragPreview({ label: draggingComponent, x: event.clientX, y: event.clientY })
  }

  function onPalettePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (draggingComponent) {
      placeComponent(draggingComponent, event.clientX, event.clientY)
      setDraggingComponent(null)
      setDragPreview(null)
    }

    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function onPlacedPointerDown(id: string, event: PointerEvent<HTMLButtonElement>) {
    setDraggingPlacedId(id)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPlacedPointerMove(item: PlacedComponent, event: PointerEvent<HTMLButtonElement>) {
    if (draggingPlacedId !== item.id) return
    placeComponent(item.label, event.clientX, event.clientY, item.id)
  }

  function onPlacedPointerUp(item: PlacedComponent, event: PointerEvent<HTMLButtonElement>) {
    placeComponent(item.label, event.clientX, event.clientY, item.id)
    setDraggingPlacedId(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function scoreSystem() {
    const labels = new Set(placed.map((item) => item.label))
    const missing = requiredSystem.filter((item) => !labels.has(item))

    if (!missing.length) {
      setSystemFeedback('Strong design. You covered request path, retrieval, cache, and async workers.')
      addXp(40, 'systems')
      return
    }

    setSystemFeedback(`Missing: ${missing.join(', ')}. Add them before the next stop.`)
    addXp(10, 'systems')
  }

  function resetSystem() {
    setPlaced([])
    setSystemFeedback('Canvas reset. Build the path from user request to generated brief.')
  }

  async function installApp() {
    if (!installPrompt) return

    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return (
    <main className="phone-shell" onPointerDownCapture={unlockAudio}>
      <header className="app-header">
        <div>
          <span className="brand">Gripd.</span>
          <h1>{modeTitle(activeMode)}</h1>
        </div>
        <div className="header-actions">
          <span>{isOnline ? 'Live' : 'Tunnel'}</span>
          <button className="mini-button" onClick={resetDemoState}>Reset</button>
          {installPrompt && <button onClick={installApp}>Install</button>}
        </div>
      </header>

      <section
        className={`progress-strip ${progressReceiving ? 'receiving' : ''}`}
        aria-label="Progress"
        ref={progressRef}
      >
        <div>
          <span>Lvl {level}</span>
          <strong>{progress.xp} XP</strong>
        </div>
        <div className="level-track" aria-label={`${levelProgress}% to next level`}>
          <i style={{ width: `${levelProgress}%` }} />
        </div>
        <div>
          <span>{progress.streak} streak</span>
          <strong>{nextLevelXp - progress.xp} next</strong>
        </div>
      </section>

      <form className="save-bar" onSubmit={onSave}>
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          inputMode="url"
          placeholder="Paste ArXiv, GitHub, event"
        />
        <button type="submit">Save</button>
      </form>

      <section className="mode-tabs" aria-label="Modes">
        {(['voice', 'papers', 'graph', 'systems'] as Mode[]).map((mode) => (
          <button
            key={mode}
            className={activeMode === mode ? 'active' : ''}
            onClick={() => setActiveMode(mode)}
          >
            {modeLabel(mode)}
          </button>
        ))}
      </section>

      <section className="mode-surface">
        {packLoading ? (
          <LoadingMascot title={loadingLinkTitle} />
        ) : activeMode === 'voice' && (
          <VoiceMode
            activeLink={activeLink || emptyLink}
            links={availableLinks}
            message={message}
            script={voiceScript}
            podcastSegments={podcastSegments}
            onDelete={onDelete}
            onLinkSelect={setActiveLink}
            onStart={startVoiceHype}
            onQuickBrief={playQuickBrief}
            onStop={stopVoiceHype}
            loading={packLoading}
            hasLearningPack={hasLearningPack}
          />
        )}

        {!packLoading && activeMode === 'papers' && (
          hasLearningPack ? (
            <PaperMode
              paper={currentPaper}
              paperIndex={paperIndex}
              total={currentPaperRounds.length}
              result={paperResult}
              cardOffset={cardOffset}
              onNext={nextPaper}
              onPointerDown={onPaperPointerDown}
              onPointerMove={onPaperPointerMove}
              onPointerUp={onPaperPointerUp}
              onAnswer={answerPaper}
            />
          ) : (
            <EmptyMode title="No paper questions yet" body="Save a paper link to generate swipe questions from its content." />
          )
        )}

        {!packLoading && activeMode === 'graph' && (
          hasLearningPack && selectedNode ? (
            <GraphMode
              selectedNode={selectedNode}
              nodes={currentGraphNodes}
              edges={currentGraphEdges}
              challenge={currentGraphChallenges[graphChallengeIndex % currentGraphChallenges.length]}
              nodeStates={graphNodeStates}
              feedback={graphFeedback}
              onSelectNode={selectNode}
            />
          ) : (
            <EmptyMode title="No concept graph yet" body="Save a paper link and Gripd will generate graph nodes from the content." />
          )
        )}

        {!packLoading && activeMode === 'systems' && (
          <SystemMode
            placed={placed}
            feedback={systemFeedback}
            canvasRef={canvasRef}
            draggingComponent={draggingComponent}
            draggingPlacedId={draggingPlacedId}
            dragPreview={dragPreview}
            onPalettePointerDown={onPalettePointerDown}
            onPalettePointerMove={onPalettePointerMove}
            onPalettePointerUp={onPalettePointerUp}
            onPlacedPointerDown={onPlacedPointerDown}
            onPlacedPointerMove={onPlacedPointerMove}
            onPlacedPointerUp={onPlacedPointerUp}
            onScore={scoreSystem}
            onReset={resetSystem}
            prompt={learningPack.systemPrompt}
            hasLearningPack={hasLearningPack}
          />
        )}
      </section>

      <nav className="bottom-nav" aria-label="Primary modes">
        {(['voice', 'papers', 'graph', 'systems'] as Mode[]).map((mode) => (
          <button
            key={mode}
            className={activeMode === mode ? 'active' : ''}
            onClick={() => setActiveMode(mode)}
            aria-label={modeTitle(mode)}
          >
            <span>{modeIcon(mode)}</span>
            {modeLabel(mode)}
          </button>
        ))}
      </nav>
      {xpBubbles.map((bubble) => (
        <span
          key={bubble.id}
          className={`xp-bubble ${bubble.tone}`}
          style={{
            '--from-x': `${bubble.fromX}px`,
            '--from-y': `${bubble.fromY}px`,
            '--to-x': `${bubble.toX}px`,
            '--to-y': `${bubble.toY}px`,
          } as React.CSSProperties}
        >
          {bubble.amount > 0 ? '+' : ''}{bubble.amount} XP
        </span>
      ))}
    </main>
  )
}

function LoadingMascot({ title }: { title: string }) {
  return (
    <article className="loading-mascot-card" aria-live="polite">
      <div className="mascot-scene" aria-hidden="true">
        <img className="mascot-image" src="/mascot.png" alt="" />
        <span className="fetch-orbit one">Exa</span>
        <span className="fetch-orbit two">AI</span>
        <span className="fetch-orbit three">XP</span>
      </div>
      <span className="eyebrow">Fetching paper details</span>
      <h2>Nerdy study buddy is reading it for you</h2>
      <p>{title ? `Building a podcast, questions, graph, and system challenge from ${title}.` : 'Building your commute session.'}</p>
      <div className="loading-steps">
        <span>Exa fetch</span>
        <span>OpenAI summary</span>
        <span>Games</span>
      </div>
    </article>
  )
}

function VoiceMode({
  activeLink,
  links,
  message,
  script,
  podcastSegments,
  onDelete,
  onLinkSelect,
  onStart,
  onQuickBrief,
  onStop,
  loading,
  hasLearningPack,
}: {
  activeLink: SavedLink
  links: SavedLink[]
  message: string
  script: string
  podcastSegments: PodcastSegment[]
  onDelete: (url: string) => void
  onLinkSelect: (link: SavedLink) => void
  onStart: () => void
  onQuickBrief: () => void
  onStop: () => void
  loading: boolean
  hasLearningPack: boolean
}) {
  return (
    <div className="mode-stack">
      <article className="voice-card">
        <div className="wave-orb" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div>
          <span className="eyebrow">Now briefing</span>
          <h2>{activeLink.title}</h2>
          <p>{script}</p>
        </div>
      </article>

      <div className="control-row">
        <button onClick={onStart} disabled={!hasLearningPack}>Podcast</button>
        <button className="secondary" onClick={onQuickBrief} disabled={!hasLearningPack}>Quick brief</button>
      </div>
      <div className="control-row one">
        <button className="secondary" onClick={onStop}>Pause</button>
      </div>
      <p className="system-message">{message}</p>

      <article className="podcast-card">
        <span className="eyebrow">{loading ? 'Generating from saved link' : 'Generated podcast script'}</span>
        {podcastSegments.map((segment) => (
          <p key={`${segment.speaker}-${segment.line}`}>
            <strong>{segment.speaker}</strong> {segment.line}
          </p>
        ))}
      </article>

      <div className="queue-list">
        {links.length ? links.map((link) => (
          <article className="queue-item" key={link.url} onClick={() => onLinkSelect(link)}>
            <div>
              <span>{link.kind}</span>
              <strong>{link.title}</strong>
              <p>{link.cached ? 'Cached for tunnel mode' : 'Needs network'}</p>
            </div>
            <button
              className="text-button"
              onClick={(event) => {
                event.stopPropagation()
                onDelete(link.url)
              }}
            >
              Remove
            </button>
          </article>
        )) : (
          <article className="queue-item">
            <div>
              <span>empty</span>
              <strong>No saved links</strong>
              <p>Paste a paper link above to generate your commute session.</p>
            </div>
          </article>
        )}
      </div>
    </div>
  )
}

function EmptyMode({ title, body }: { title: string; body: string }) {
  return (
    <article className="empty-mode">
      <span className="eyebrow">Start here</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  )
}

function PaperMode({
  paper,
  paperIndex,
  total,
  result,
  cardOffset,
  onNext,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onAnswer,
}: {
  paper: PaperRound
  paperIndex: number
  total: number
  result: PaperResult
  cardOffset: number
  onNext: () => void
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onPointerMove: (event: PointerEvent<HTMLElement>) => void
  onPointerUp: (event: PointerEvent<HTMLElement>) => void
  onAnswer: (choice: 'left' | 'right') => void
}) {
  const cardLabel = result ? 'Swipe any direction for next' : 'Swipe left or right'

  return (
    <div className="paper-mode">
      <div className="round-header">
        <div>
          <span className="eyebrow">Paper swipe</span>
          <h2>{paper.title}</h2>
        </div>
        <span>{paperIndex + 1}/{total}</span>
      </div>

      <article
        className={`swipe-card ${result?.tone || ''} ${result ? 'feedback-swipe-card' : ''}`}
        style={{ transform: `translateX(${cardOffset}px) rotate(${cardOffset / 18}deg)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="card-kicker">{cardLabel}</span>
        {!result ? (
          <>
            <h3>{paper.claim}</h3>
            <div className="paper-options">
              <div>
                <span>Left</span>
                <strong>{paper.left}</strong>
              </div>
              <div>
                <span>Right</span>
                <strong>{paper.right}</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="feedback-card-body">
            <span className={`result-pill ${result.tone}`}>
              {result.tone === 'success' ? 'Correct' : 'Wrong'}
            </span>
            <h3>{result.tone === 'success' ? 'You read the tradeoff.' : 'Not this round.'}</h3>
            <p>{result.reason}</p>
            <strong>Swipe to continue</strong>
          </div>
        )}
      </article>

      {!result && (
        <div className="swipe-hint" aria-label="Swipe directions">
          <span>← {paper.left}</span>
          <span>{paper.right} →</span>
        </div>
      )}
    </div>
  )
}

function GraphMode({
  selectedNode,
  nodes,
  edges,
  challenge,
  nodeStates,
  feedback,
  onSelectNode,
}: {
  selectedNode: GraphNode
  nodes: GraphNode[]
  edges: string[][]
  challenge: GraphChallenge
  nodeStates: Record<string, 'success' | 'fail'>
  feedback: string
  onSelectNode: (node: GraphNode) => void
}) {
  return (
    <div className="graph-mode">
      <div className="round-header">
        <div>
          <span className="eyebrow">Concept galaxy</span>
          <h2>{challenge.prompt}</h2>
        </div>
        <span>{nodes.length} nodes</span>
      </div>

      <div className="graph-stage">
        <svg viewBox="0 0 360 360" aria-hidden="true">
          {edges.map(([from, to]) => {
            const a = nodes.find((node) => node.id === from)
            const b = nodes.find((node) => node.id === to)
            if (!a || !b) return null
            return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          })}
        </svg>
        {nodes.map((node) => (
          <button
            key={node.id}
            className={`graph-node ${selectedNode.id === node.id ? 'active' : ''} ${nodeStates[node.id] || ''}`}
            style={{
              left: `${(node.x / 360) * 100}%`,
              top: `${(node.y / 360) * 100}%`,
              borderColor: palette[node.skill],
            }}
            onClick={() => onSelectNode(node)}
          >
            {node.label}
            {nodeStates[node.id] === 'success' && <i>✓</i>}
            {nodeStates[node.id] === 'fail' && <i>×</i>}
          </button>
        ))}
      </div>

      <article className={`feedback-card ${nodeStates[selectedNode.id] || ''}`}>
        <span className="eyebrow" style={{ color: palette[selectedNode.skill] }}>{selectedNode.skill}</span>
        <strong>{selectedNode.label}</strong>
        <p>{selectedNode.detail}</p>
        <p>{feedback}</p>
      </article>
    </div>
  )
}

function SystemMode({
  prompt,
  placed,
  feedback,
  canvasRef,
  draggingComponent,
  draggingPlacedId,
  dragPreview,
  onPalettePointerDown,
  onPalettePointerMove,
  onPalettePointerUp,
  onPlacedPointerDown,
  onPlacedPointerMove,
  onPlacedPointerUp,
  onScore,
  onReset,
  hasLearningPack,
}: {
  prompt: string
  placed: PlacedComponent[]
  feedback: string
  canvasRef: React.RefObject<HTMLDivElement>
  draggingComponent: string | null
  draggingPlacedId: string | null
  dragPreview: { label: string; x: number; y: number } | null
  onPalettePointerDown: (label: string, event: PointerEvent<HTMLButtonElement>) => void
  onPalettePointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPalettePointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPlacedPointerDown: (id: string, event: PointerEvent<HTMLButtonElement>) => void
  onPlacedPointerMove: (item: PlacedComponent, event: PointerEvent<HTMLButtonElement>) => void
  onPlacedPointerUp: (item: PlacedComponent, event: PointerEvent<HTMLButtonElement>) => void
  onScore: () => void
  onReset: () => void
  hasLearningPack: boolean
}) {
  return (
    <div className="system-mode">
      <div className="round-header">
        <div>
          <span className="eyebrow">Build-a-system</span>
          <h2>{prompt}</h2>
        </div>
      </div>

      <div className="component-palette">
        {components.map((component) => (
          <button
            key={component}
            className={draggingComponent === component ? 'dragging' : ''}
            onPointerDown={(event) => onPalettePointerDown(component, event)}
            onPointerMove={onPalettePointerMove}
            onPointerUp={onPalettePointerUp}
          >
            {component}
          </button>
        ))}
      </div>

      <div className="system-canvas" ref={canvasRef}>
        <span className="lane-label">User request</span>
        <span className="lane-label right">Generated commute brief</span>
        {placed.map((item) => (
          <button
            key={item.id}
            className={`placed-component ${draggingPlacedId === item.id ? 'dragging' : ''}`}
            style={{ left: `${item.x}%`, top: `${item.y}%` }}
            onPointerDown={(event) => onPlacedPointerDown(item.id, event)}
            onPointerMove={(event) => onPlacedPointerMove(item, event)}
            onPointerUp={(event) => onPlacedPointerUp(item, event)}
          >
            {item.label}
          </button>
        ))}
        {dragPreview && (
          <div
            className="drag-preview"
            style={{
              left: dragPreview.x,
              top: dragPreview.y,
            }}
          >
            {dragPreview.label}
          </div>
        )}
      </div>

      <div className="control-row">
        <button onClick={onScore}>Score design</button>
        <button className="secondary" onClick={onReset}>Reset</button>
      </div>
      <article className="feedback-card">
        <strong>AI evaluator</strong>
        <p>{hasLearningPack ? feedback : 'Save a paper link first. The architecture challenge will be generated from that paper.'}</p>
      </article>
    </div>
  )
}

function modeTitle(mode: Mode) {
  if (mode === 'voice') return 'Voice Hype'
  if (mode === 'papers') return 'Paper Swipe'
  if (mode === 'graph') return 'Concept Graph'
  return 'Architecture'
}

function modeLabel(mode: Mode) {
  if (mode === 'voice') return 'Voice'
  if (mode === 'papers') return 'Papers'
  if (mode === 'graph') return 'Graph'
  return 'Build'
}

function modeIcon(mode: Mode) {
  if (mode === 'voice') return '▶'
  if (mode === 'papers') return '↔'
  if (mode === 'graph') return '◎'
  return '▦'
}
