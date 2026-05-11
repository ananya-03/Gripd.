declare const process: {
  env: Record<string, string | undefined>
}

declare const Buffer: {
  from(input: ArrayBuffer): unknown
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const key = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY
  const voiceId = req.query.voiceId

  if (!key) {
    res.status(500).json({ error: 'Missing ELEVENLABS_API_KEY' })
    return
  }

  if (!voiceId || Array.isArray(voiceId)) {
    res.status(400).json({ error: 'Missing voiceId' })
    return
  }

  const outputFormat =
    typeof req.query.output_format === 'string' ? req.query.output_format : 'mp3_44100_128'

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': key,
      },
      body: JSON.stringify(req.body || {}),
    }
  )

  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  res.status(response.status)
  res.setHeader('Content-Type', contentType)

  if (!response.ok) {
    res.send(await response.text())
    return
  }

  const audio = Buffer.from(await response.arrayBuffer())
  res.send(audio)
}
