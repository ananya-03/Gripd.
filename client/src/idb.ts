export type SavedLink = {
  url: string
  title: string
  description: string
  kind: 'paper' | 'repo' | 'event' | 'link'
  savedAt: number
  cached: boolean
  tags: string[]
}

const DB_NAME = 'gripd-db'
const DB_VERSION = 2
const STORE_LINKS = 'links'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result

      if (!db.objectStoreNames.contains(STORE_LINKS)) {
        const store = db.createObjectStore(STORE_LINKS, { keyPath: 'url' })
        store.createIndex('savedAt', 'savedAt')
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function inferKind(url: string): SavedLink['kind'] {
  const lower = url.toLowerCase()

  if (lower.includes('arxiv.org') || lower.endsWith('.pdf')) return 'paper'
  if (lower.includes('github.com')) return 'repo'
  if (lower.includes('lu.ma') || lower.includes('eventbrite') || lower.includes('meetup')) return 'event'

  return 'link'
}

function inferTitle(url: string) {
  try {
    const parsed = new URL(url)
    const cleanPath = parsed.pathname.replace(/^\/+|\/+$/g, '').replaceAll('-', ' ')
    const host = parsed.hostname.replace(/^www\./, '')

    if (host.includes('arxiv.org')) {
      const id = parsed.pathname.split('/').filter(Boolean).at(-1)
      return id ? `ArXiv paper ${id}` : 'Saved AI paper'
    }

    if (host.includes('github.com')) {
      const [owner, repo] = parsed.pathname.split('/').filter(Boolean)
      return owner && repo ? `${owner}/${repo}` : 'Saved GitHub repo'
    }

    return cleanPath ? `${host} / ${cleanPath}` : host
  } catch {
    return 'Saved learning link'
  }
}

function inferTags(kind: SavedLink['kind']) {
  if (kind === 'paper') return ['ML', 'Research']
  if (kind === 'repo') return ['Build', 'Code']
  if (kind === 'event') return ['Event', 'Prep']
  return ['Learning']
}

function normalizeUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return ''

  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export async function saveLink(rawUrl: string) {
  const url = normalizeUrl(rawUrl)
  if (!url) return

  const kind = inferKind(url)
  const link: SavedLink = {
    url,
    kind,
    title: inferTitle(url),
    description:
      kind === 'repo'
        ? 'Queued for Exa discovery and a one-thumb build challenge.'
        : 'Queued for Exa indexing, Voice Hype narration, and commute games.',
    savedAt: Date.now(),
    cached: true,
    tags: inferTags(kind),
  }

  const db = await openDB()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_LINKS, 'readwrite')
    const store = tx.objectStore(STORE_LINKS)
    store.put(link)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function listLinks(): Promise<SavedLink[]> {
  const db = await openDB()

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LINKS, 'readonly')
    const store = tx.objectStore(STORE_LINKS)
    const req = store.getAll()

    req.onsuccess = () => {
      const links = (req.result || [])
        .map((item: Partial<SavedLink> & { url: string }) => {
          const kind = item.kind || inferKind(item.url)

          return {
            url: item.url,
            title: item.title || inferTitle(item.url),
            description:
              item.description || 'Queued for narration, offline cache, and game generation.',
            kind,
            savedAt: item.savedAt || Date.now(),
            cached: item.cached ?? true,
            tags: item.tags || inferTags(kind),
          }
        })
        .sort((a: SavedLink, b: SavedLink) => b.savedAt - a.savedAt)

      resolve(links)
    }

    req.onerror = () => reject(req.error)
  })
}

export async function deleteLink(url: string) {
  const db = await openDB()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_LINKS, 'readwrite')
    const store = tx.objectStore(STORE_LINKS)
    store.delete(url)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function updateMetadata(
  url: string,
  metadata: Partial<Omit<SavedLink, 'url' | 'savedAt'>>
) {
  const db = await openDB()

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_LINKS, 'readwrite')
    const store = tx.objectStore(STORE_LINKS)
    const req = store.get(url)

    req.onsuccess = () => {
      const kind = metadata.kind || inferKind(url)
      const value: SavedLink = {
        url,
        title: inferTitle(url),
        description: 'Queued for narration, offline cache, and game generation.',
        kind,
        savedAt: Date.now(),
        cached: true,
        tags: inferTags(kind),
        ...req.result,
        ...metadata,
      }

      store.put(value)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
