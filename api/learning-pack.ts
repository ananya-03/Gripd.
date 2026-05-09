type Skill = 'systems' | 'research' | 'concepts' | 'voice'

type SourceContent = {
  title: string
  summary: string
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
  'paper',
  'model',
  'models',
  'approach',
  'method',
  'results',
])

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

function sentenceFrom(text: string, fallback: string) {
  return normalizeWhitespace(text).split(/(?<=[.!?])\s+/).find((sentence) => sentence.length > 70) || fallback
}

function shortText(value: string, max = 96) {
  const normalized = normalizeWhitespace(value)
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1).trim()}...`
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
        query: 'Summarize the core contribution, method, tradeoffs, and what a builder should understand.',
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

    return {
      title: title.trim() || `ArXiv ${arxivId}`,
      summary,
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
    normalizeWhitespace(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] || '') ||
    stripHtml(html).slice(0, 1200)

  return {
    title,
    summary: description,
    sourceText: `${title}. ${description}`,
    provider: 'direct',
  }
}

function layoutGraphNodes(nodes: any[]) {
  const positions = [
    [62, 82],
    [286, 76],
    [306, 220],
    [82, 228],
    [188, 318],
    [188, 168],
  ]

  return nodes.map((node, index) => ({
    ...node,
    x: positions[index % positions.length][0],
    y: positions[index % positions.length][1],
  }))
}

function buildHeuristicLearningPack(source: SourceContent, url: string) {
  const keywords = keywordsFrom(source.sourceText)
  const primary = keywords[0] || 'retrieval'
  const secondary = keywords[1] || 'evaluation'
  const tertiary = keywords[2] || 'efficiency'
  const summary = sentenceFrom(source.summary, `${source.title} is ready for commute learning and game checks.`)

  const graphNodes = [
    {
      id: 'main',
      label: shortText(labelFromKeyword(primary), 18),
      x: 62,
      y: 82,
      skill: 'research' as Skill,
      detail: `${labelFromKeyword(primary)} is the central idea extracted from this saved link.`,
    },
    {
      id: 'mechanism',
      label: shortText(labelFromKeyword(secondary), 18),
      x: 286,
      y: 76,
      skill: 'research' as Skill,
      detail: `${labelFromKeyword(secondary)} describes how the paper appears to get its result.`,
    },
    {
      id: 'tradeoff',
      label: shortText(labelFromKeyword(tertiary), 18),
      x: 306,
      y: 220,
      skill: 'systems' as Skill,
      detail: `${labelFromKeyword(tertiary)} is the design tradeoff to watch when building from this idea.`,
    },
    {
      id: 'voice',
      label: 'Voice Brief',
      x: 82,
      y: 228,
      skill: 'voice' as Skill,
      detail: 'This node turns the saved content into a hands-free podcast explanation.',
    },
    {
      id: 'build',
      label: 'Build Check',
      x: 188,
      y: 318,
      skill: 'concepts' as Skill,
      detail: 'This node checks whether you can apply the idea after listening.',
    },
  ]

  return {
    url,
    title: source.title,
    summary,
    podcastSegments: [
      { speaker: 'Host', line: `You saved ${source.title}. The point of this ride is to turn it into one buildable idea.` },
      { speaker: 'Analyst', line: summary },
      {
        speaker: 'Host',
        line: `Keep this question in your head: how does ${labelFromKeyword(primary)} change what you would build tonight?`,
      },
      {
        speaker: 'Analyst',
        line: `Watch the tradeoff around ${labelFromKeyword(tertiary)}. That is where the game checks your understanding.`,
      },
    ],
    paperRounds: [
      {
        title: `${labelFromKeyword(primary)} check`,
        left: labelFromKeyword(primary),
        right: labelFromKeyword(secondary),
        claim: 'Which concept is the main thing you should remember first?',
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
    ],
    graphNodes,
    graphEdges: [
      ['main', 'mechanism'],
      ['main', 'voice'],
      ['mechanism', 'tradeoff'],
      ['tradeoff', 'build'],
      ['voice', 'build'],
    ],
    graphChallenges: [
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
    ],
    systemPrompt: shortText(`Build cached commute games for ${source.title}`, 86),
    sourceProvider: source.provider,
    generatedBy: 'heuristic',
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
        'Generate mobile learning game content from a paper or repository. Return only valid JSON. Questions must be specific to the supplied content.',
      input: `Create a Gripd learning pack from this saved link.

URL: ${url}
Title: ${source.title}
Summary: ${source.summary}
Content:
${source.sourceText.slice(0, 14000)}

Return JSON with exactly:
{
  "title": string,
  "summary": string,
  "podcastSegments": [{"speaker":"Host"|"Analyst","line": string}],
  "paperRounds": [{"title": string, "left": string, "right": string, "claim": string, "winner":"left"|"right", "reason": string}],
  "graphNodes": [{"id": string, "label": string, "x": number, "y": number, "skill":"systems"|"research"|"concepts"|"voice", "detail": string}],
  "graphEdges": [[string,string]],
  "graphChallenges": [{"prompt": string, "answerId": string, "success": string}],
  "systemPrompt": string
}`,
    }),
  })

  if (!response.ok) throw new Error(`OpenAI failed: ${response.status}`)
  return parseJsonObject(extractResponseText(await response.json()))
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
      ? layoutGraphNodes(value.graphNodes.slice(0, 6)).map((node: any, index: number) => ({
          id: String(node?.id || `node-${index}`).replace(/[^a-z0-9_-]/gi, '-').toLowerCase(),
          label: shortText(String(node?.label || `Concept ${index + 1}`), 18),
          x: Number(node?.x),
          y: Number(node?.y),
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
    systemPrompt: shortText(String(value?.systemPrompt || fallback.systemPrompt), 86),
    sourceProvider: source.provider,
    generatedBy: value ? 'openai' : 'heuristic',
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const url = req.body?.url
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Missing url' })
      return
    }

    let source: SourceContent
    try {
      source = process.env.EXA_API_KEY ? await fetchExaSource(url, process.env.EXA_API_KEY) : await fetchDirectSource(url)
    } catch {
      source = await fetchDirectSource(url)
    }

    const openAiKey = process.env.OPENAI_API_KEY || process.env.OPEN_AI_API_KEY
    if (openAiKey) {
      try {
        const generated = await generateOpenAILearningPack(source, url, openAiKey, process.env.OPENAI_MODEL || 'gpt-4.1-mini')
        res.status(200).json(normalizeLearningPack(generated, source, url))
        return
      } catch {
        res.status(200).json(normalizeLearningPack(null, source, url))
        return
      }
    }

    res.status(200).json(normalizeLearningPack(null, source, url))
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate learning pack' })
  }
}
