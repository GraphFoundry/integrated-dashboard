import fs from 'fs'
import path from 'path'

interface PersistedPayload {
  version: 1
  entries: Record<string, number>
}

export class WebhookDedupeStore {
  private readonly entries = new Map<string, number>()
  private readonly windowMs: number

  constructor(
    private readonly filePath: string,
    windowSec: number
  ) {
    this.windowMs = Math.max(1, windowSec) * 1000
    this.ensureDir()
    this.load()
    this.prune(Date.now())
  }

  register(eventId: string, seenAtMs: number): { duplicate: boolean } {
    this.prune(seenAtMs)
    if (this.entries.has(eventId)) {
      return { duplicate: true }
    }
    this.entries.set(eventId, seenAtMs)
    this.persist()
    return { duplicate: false }
  }

  size(): number {
    return this.entries.size
  }

  close(): void {
    this.persist()
  }

  private ensureDir(): void {
    const dir = path.dirname(this.filePath)
    fs.mkdirSync(dir, { recursive: true })
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8')
      if (!raw.trim()) return
      const parsed = JSON.parse(raw) as PersistedPayload
      const entries = parsed.entries || {}
      for (const [key, value] of Object.entries(entries)) {
        if (Number.isFinite(value)) {
          this.entries.set(key, value)
        }
      }
    } catch (error) {
      console.warn('[Graph Webhook] Failed to load dedupe store:', error)
    }
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs
    let changed = false
    for (const [eventId, seenAt] of this.entries.entries()) {
      if (seenAt < cutoff) {
        this.entries.delete(eventId)
        changed = true
      }
    }
    if (changed) this.persist()
  }

  private persist(): void {
    const payload: PersistedPayload = {
      version: 1,
      entries: Object.fromEntries(this.entries.entries()),
    }
    const tempPath = `${this.filePath}.tmp`
    fs.writeFileSync(tempPath, JSON.stringify(payload), 'utf8')
    fs.renameSync(tempPath, this.filePath)
  }
}
