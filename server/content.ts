import { existsSync, readFileSync, statSync } from 'node:fs'
import { marked } from 'marked'

export type Doc = {
  title: string
  subtitle: string
  updated: string
  body: string
  missing: boolean
}

type CacheEntry = { mtimeMs: number; doc: Doc }
const cache = new Map<string, CacheEntry>()

marked.setOptions({ gfm: true, breaks: false })

function parseFrontMatter(src: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  if (!m) return { meta: {}, body: src }
  const meta: Record<string, string> = {}
  for (const line of m[1]!.split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return { meta, body: src.slice(m[0].length) }
}

export function readDoc(relPath: string, fallbackTitle: string): Doc {
  const path = `content/${relPath}`
  if (!existsSync(path)) {
    return {
      title: fallbackTitle,
      subtitle: '',
      updated: '',
      body: '<p class="placeholder">这份内容还在写。</p>',
      missing: true,
    }
  }
  const mtimeMs = statSync(path).mtimeMs
  const hit = cache.get(path)
  if (hit && hit.mtimeMs === mtimeMs) return hit.doc

  const { meta, body } = parseFrontMatter(readFileSync(path, 'utf8'))
  const doc: Doc = {
    title: meta.title || fallbackTitle,
    subtitle: meta.subtitle || '',
    updated: meta.updated || '',
    body: marked.parse(body) as string,
    missing: false,
  }
  cache.set(path, { mtimeMs, doc })
  return doc
}

export function readSettingsFile(): Record<string, string> {
  const path = 'content/settings.json'
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}
