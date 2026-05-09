import { defineConfig, loadEnv, Plugin } from 'vite'
import react from '@vitejs/plugin-react'

type PaperRound = {
  title: string
  left: string
  right: string
  claim: string
  winner: 'left' | 'right'
  reason: string
}

type GraphNode = {
  id: string
  label: string
  x: number
  y: number
  skill: 'systems' | 'research' | 'concepts' | 'voice'
  detail: string
}

type GraphChallenge = {
  prompt: string
  answerId: string
  success: string
}

type SourceContent = {
  title: string
  summary: string
  authors: string[]
  sourceText: string
  provider: 'exa' | 'direct'
}

const stopWords = new Set([
  'with',
  'from',
  'that',
  'this',
  'these',
  'those',
  'using',
  'into',
  'through',
  'between',
  'about',
  'their',
  'which',
  'while',
  'where',
  'when',
  'have',
  'has',
  'been',
  'were',
  'will',
  'model',
  'models',
  'paper',
  'approach',
  'method',
  'results',
])

function textResponse(res: any, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

async function readBody(req: any) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripHtml(value: string) {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  )
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function extractArxivId(url: string) {
  return url.match(/arxiv\.org\/(?:abs|pdf)\/([^?#/]+)(?:\.pdf)?/i)?.[1]
}

function envValue(env: Record<string, string>, names: string[]) {
  for (const name of names) {
    if (env[name]) return env[name]
    const match = Object.entries(env).find(([key]) => key.trim() === name)
    if (match?.[1]) return match[1]
  }

  return undefined
}

async function fetchExaSource(url: string, exaKey: string): Promise<SourceContent> {
  const response = await fetch('https://api.exa.ai/contents', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': exaKey,
    },
    body: JSON.stringify({
      urls: [url],
      text: { maxCharacters: 12000 },
      summary: {
        query:
          'Summarize the core contribution, method, tradeoffs, and what a builder should understand after reading this paper or repository.',
      },
      highlights: {
        query: 'core method, contribution, architecture, evaluation, limitations, tradeoffs',
        numSentences: 2,
        highlightsPerUrl: 6,
      },
      livecrawl: 'fallback',
    }),
  })

  if (!response.ok) throw new Error(`Exa contents failed: ${response.status}`)

  const data = await response.json()
  const result = data.results?.[0]
  if (!result) throw new Error('Exa returned no content')

  const text = normalizeWhitespace(
    [
      result.title,
      result.summary,
      ...(Array.isArray(result.highlights) ? result.highlights : []),
      typeof result.text === 'string' ? result.text.slice(0, 12000) : '',
    ].join('\n\n')
  )

  return {
    title: decodeEntities(result.title || new URL(url).hostname),
    summary: decodeEntities(result.summary || sentenceFrom(text, 'Saved content ready for commute learning.')),
    authors: result.author ? [result.author] : [],
    sourceText: text,
    provider: 'exa',
  }
}

async function fetchDirectSource(url: string): Promise<SourceContent> {
  const arxivId = extractArxivId(url)

  if (arxivId) {
    const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`)
    const xml = await response.text()
    const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1] || xml
    const title = decodeEntities(normalizeWhitespace(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] || `ArXiv ${arxivId}`))
    const summary = decodeEntities(normalizeWhitespace(entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || ''))
    const authors = Array.from(xml.matchAll(/<name>([\s\S]*?)<\/name>/g)).map((match) => match[1])

    return {
      title: title.trim() || `ArXiv ${arxivId}`,
      summary,
      authors,
      sourceText: `${title}. ${summary}`,
      provider: 'direct',
    }
  }

  const response = await fetch(url)
  const html = await response.text()
  const title =
    normalizeWhitespace(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] || '') ||
    normalizeWhitespace(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '') ||
    new URL(url).hostname
  const description =
    normalizeWhitespace(
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || ''
    ) || stripHtml(html).slice(0, 1200)

  return {
    title,
    summary: description,
    authors: [],
    sourceText: `${title}. ${description}`,
    provider: 'direct',
  }
}

function keywordsFrom(text: string) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 4 && !stopWords.has(word))

  const counts = new Map<string, number>()
  for (const word of words) counts.set(word, (counts.get(word) || 0) + 1)

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word)
}

function labelFromKeyword(keyword: string) {
  return keyword
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function sentenceFrom(text: string, fallback: string) {
  return normalizeWhitespace(text).split(/(?<=[.!?])\s+/).find((sentence) => sentence.length > 70) || fallback
}

function normalizeLearningPack(value: any, source: SourceContent, url: string) {
  const fallback = buildHeuristicLearningPack(source, url)

  return {
    url,
    title: String(value?.title || source.title || fallback.title),
    summary: String(value?.summary || source.summary || fallback.summary),
    podcastSegments: Array.isArray(value?.podcastSegments) && value.podcastSegments.length
      ? value.podcastSegments.slice(0, 6).map((segment: any, index: number) => ({
          speaker: segment?.speaker === 'Analyst' ? 'Analyst' : index % 2 === 0 ? 'Host' : 'Analyst',
          line: String(segment?.line || '').replace(/^(Host|Analyst):\s*/i, ''),
        }))
      : fallback.podcastSegments,
    paperRounds: Array.isArray(value?.paperRounds) && value.paperRounds.length
      ? value.paperRounds.slice(0, 5).map((round: any) => ({
          title: String(round?.title || 'Understanding check'),
          left: String(round?.left || 'Option A'),
          right: String(round?.right || 'Option B'),
          claim: String(round?.claim || 'Which option best reflects the saved content?'),
          winner: round?.winner === 'right' ? 'right' : 'left',
          reason: String(round?.reason || source.summary || fallback.summary),
        }))
      : fallback.paperRounds,
    graphNodes: Array.isArray(value?.graphNodes) && value.graphNodes.length >= 4
      ? value.graphNodes.slice(0, 6).map((node: any, index: number) => ({
          id: String(node?.id || `node-${index}`).replace(/[^a-z0-9_-]/gi, '-').toLowerCase(),
          label: String(node?.label || `Concept ${index + 1}`).slice(0, 24),
          x: Number(node?.x || [62, 238, 292, 108, 198, 300][index] || 180),
          y: Number(node?.y || [82, 58, 176, 210, 310, 300][index] || 180),
          skill: ['systems', 'research', 'concepts', 'voice'].includes(node?.skill) ? node.skill : 'concepts',
          detail: String(node?.detail || 'Generated from the saved link.'),
        }))
      : fallback.graphNodes,
    graphEdges: Array.isArray(value?.graphEdges) && value.graphEdges.length ? value.graphEdges : fallback.graphEdges,
    graphChallenges:
      Array.isArray(value?.graphChallenges) && value.graphChallenges.length
        ? value.graphChallenges.slice(0, 5).map((challenge: any) => ({
            prompt: String(challenge?.prompt || 'Tap the matching concept.'),
            answerId: String(challenge?.answerId || 'main').replace(/[^a-z0-9_-]/gi, '-').toLowerCase(),
            success: String(challenge?.success || 'Correct.'),
          }))
        : fallback.graphChallenges,
    systemPrompt: String(value?.systemPrompt || fallback.systemPrompt),
    sourceProvider: source.provider,
    generatedBy: value ? 'openai' : 'heuristic',
  }
}

function extractResponseText(data: any) {
  if (typeof data.output_text === 'string') return data.output_text
  const parts = data.output
    ?.flatMap((item: any) => item.content || [])
    ?.filter((item: any) => item.type === 'output_text' && typeof item.text === 'string')
    ?.map((item: any) => item.text)
  return parts?.join('\n') || ''
}

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('OpenAI response was not JSON')
  }
}

async function generateOpenAILearningPack(source: SourceContent, url: string, apiKey: string, model: string) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions:
        'You generate mobile learning game content from a paper/repository. Return only valid JSON. Do not include markdown. Make questions specific to the supplied content, not generic AI trivia.',
      input: `Create a Gripd learning pack from this saved link.

URL: ${url}
Title: ${source.title}
Summary: ${source.summary}
Content:
${source.sourceText.slice(0, 14000)}

Return JSON with exactly:
{
  "title": string,
  "summary": string, // punchy 2-3 sentence quick summary
  "podcastSegments": [{"speaker":"Host"|"Analyst","line": string}], // 4-6 lines, no speaker labels in line
  "paperRounds": [{"title": string, "left": string, "right": string, "claim": string, "winner":"left"|"right", "reason": string}], // 4-5 swipe questions after listening
  "graphNodes": [{"id": string, "label": string, "x": number, "y": number, "skill":"systems"|"research"|"concepts"|"voice", "detail": string}], // 5 nodes, ids lowercase
  "graphEdges": [[string,string]],
  "graphChallenges": [{"prompt": string, "answerId": string, "success": string}], // use graph node ids
  "systemPrompt": string // architecture challenge based on this paper/link
}`,
    }),
  })

  if (!response.ok) throw new Error(`OpenAI failed: ${response.status}`)
  return parseJsonObject(extractResponseText(await response.json()))
}

function buildHeuristicLearningPack(source: SourceContent, url: string) {
  const keywords = keywordsFrom(source.sourceText)
  const primary = keywords[0] || 'retrieval'
  const secondary = keywords[1] || 'evaluation'
  const tertiary = keywords[2] || 'efficiency'
  const summary = sentenceFrom(
    source.summary,
    `${source.title} is saved for commute learning, podcast explanation, and game checks.`
  )

  const nodes: GraphNode[] = [
    {
      id: 'main',
      label: labelFromKeyword(primary),
      x: 62,
      y: 82,
      skill: 'research',
      detail: `${labelFromKeyword(primary)} is the central idea extracted from this saved link.`,
    },
    {
      id: 'mechanism',
      label: labelFromKeyword(secondary),
      x: 238,
      y: 58,
      skill: 'research',
      detail: `${labelFromKeyword(secondary)} describes how the paper or repo appears to get its result.`,
    },
    {
      id: 'tradeoff',
      label: labelFromKeyword(tertiary),
      x: 292,
      y: 176,
      skill: 'systems',
      detail: `${labelFromKeyword(tertiary)} is the design tradeoff to watch when building from this idea.`,
    },
    {
      id: 'voice',
      label: 'Voice Brief',
      x: 108,
      y: 210,
      skill: 'voice',
      detail: 'This node turns the saved content into a hands-free podcast explanation.',
    },
    {
      id: 'build',
      label: 'Build Check',
      x: 198,
      y: 310,
      skill: 'concepts',
      detail: 'This node checks whether you can apply the idea after listening.',
    },
  ]

  const paperRounds: PaperRound[] = [
    {
      title: `${labelFromKeyword(primary)} check`,
      left: labelFromKeyword(primary),
      right: labelFromKeyword(secondary),
      claim: `Based on the saved link, which concept is the main thing you should remember first?`,
      winner: 'left',
      reason: `${labelFromKeyword(primary)} appears most central in the saved content. ${summary}`,
    },
    {
      title: 'Apply it',
      left: 'Memorise the abstract',
      right: 'Explain the tradeoff',
      claim: 'After the podcast, what proves you actually understood the saved link?',
      winner: 'right',
      reason: `The useful learning check is whether you can explain how ${labelFromKeyword(primary)} changes a design choice.`,
    },
    {
      title: 'Build decision',
      left: 'Use it blindly',
      right: 'Test assumptions',
      claim: `Before building with ${labelFromKeyword(primary)}, what should you do?`,
      winner: 'right',
      reason: `The saved link gives an idea, but the app should push you to test assumptions around ${labelFromKeyword(tertiary)}.`,
    },
  ]

  const graphChallenges: GraphChallenge[] = [
    {
      prompt: 'Tap the main concept from the saved paper/link.',
      answerId: 'main',
      success: `${labelFromKeyword(primary)} is the headline concept extracted from your saved link.`,
    },
    {
      prompt: 'Tap the node that best describes how the idea works.',
      answerId: 'mechanism',
      success: `${labelFromKeyword(secondary)} is the mechanism to understand after the podcast.`,
    },
    {
      prompt: 'Tap the node that represents the build tradeoff.',
      answerId: 'tradeoff',
      success: `${labelFromKeyword(tertiary)} is the tradeoff you should remember before building.`,
    },
    {
      prompt: 'Tap the node that checks if you can apply the idea.',
      answerId: 'build',
      success: 'A build check proves understanding better than passive listening.',
    },
  ]

  return {
    url,
    title: source.title,
    summary,
    podcastSegments: [
      {
        speaker: 'Host',
        line: `You saved ${source.title}. The point of this ride is to turn it into one buildable idea.`,
      },
      {
        speaker: 'Analyst',
        line: `${summary}`,
      },
      {
        speaker: 'Host',
        line: `Here is the question to keep in your head: how does ${labelFromKeyword(primary)} change what you would build tonight?`,
      },
      {
        speaker: 'Analyst',
        line: `Watch the tradeoff around ${labelFromKeyword(tertiary)}. That is where the game checks whether you understood the link.`,
      },
    ],
    paperRounds,
    graphNodes: nodes,
    graphEdges: [
      ['main', 'mechanism'],
      ['main', 'voice'],
      ['mechanism', 'tradeoff'],
      ['tradeoff', 'build'],
      ['voice', 'build'],
    ],
    graphChallenges,
    systemPrompt: `Design a flow that turns ${source.title} into cached podcast audio and quiz cards for a commute.`,
    sourceProvider: source.provider,
    generatedBy: 'heuristic',
  }
}

function learningPackPlugin({
  exaKey,
  openAiKey,
  openAiModel,
}: {
  exaKey?: string
  openAiKey?: string
  openAiModel: string
}): Plugin {
  return {
    name: 'gripd-learning-pack',
    configureServer(server) {
      server.middlewares.use('/api/learning-pack', async (req, res) => {
        if (req.method !== 'POST') {
          textResponse(res, 405, { error: 'Method not allowed' })
          return
        }

        try {
          const body = await readBody(req)
          if (!body.url || typeof body.url !== 'string') {
            textResponse(res, 400, { error: 'Missing url' })
            return
          }

          let source: SourceContent

          try {
            source = exaKey ? await fetchExaSource(body.url, exaKey) : await fetchDirectSource(body.url)
          } catch {
            source = await fetchDirectSource(body.url)
          }

          if (openAiKey) {
            try {
              const generated = await generateOpenAILearningPack(source, body.url, openAiKey, openAiModel)
              textResponse(res, 200, normalizeLearningPack(generated, source, body.url))
              return
            } catch {
              textResponse(res, 200, normalizeLearningPack(null, source, body.url))
              return
            }
          }

          textResponse(res, 200, normalizeLearningPack(null, source, body.url))
        } catch (error) {
          textResponse(res, 500, {
            error: error instanceof Error ? error.message : 'Failed to generate learning pack',
          })
        }
      })
    },
  }
}

function elevenLabsProxy(key: string | undefined) {
  if (!key) return undefined

  return {
    '/elevenlabs': {
      target: 'https://api.elevenlabs.io',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(/^\/elevenlabs/, '/v1'),
      headers: {
        'xi-api-key': key,
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const elevenLabsKey = envValue(env, ['ELEVENLABS_API_KEY', 'ELEVEN_LABS_API_KEY'])
  const exaKey = envValue(env, ['EXA_API_KEY'])
  const openAiKey = envValue(env, ['OPENAI_API_KEY', 'OPEN_AI_API_KEY'])
  const openAiModel = envValue(env, ['OPENAI_MODEL', 'VITE_OPENAI_MODEL']) || 'gpt-4.1-mini'

  return {
    plugins: [react(), learningPackPlugin({ exaKey, openAiKey, openAiModel })],
    root: '.',
    server: {
      port: 5173,
      proxy: elevenLabsProxy(elevenLabsKey),
    },
  }
})
