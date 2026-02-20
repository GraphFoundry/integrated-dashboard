import crypto from 'crypto'

function toEpochMs(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const asInt = Number.parseInt(trimmed, 10)
  if (!Number.isNaN(asInt)) {
    // Support both epoch seconds and epoch milliseconds.
    if (asInt > 9_999_999_999) return asInt
    return asInt * 1000
  }

  const parsed = Date.parse(trimmed)
  if (Number.isNaN(parsed)) return null
  return parsed
}

export function signPayloadWithTimestamp(
  rawBody: Buffer,
  timestampHeader: string,
  secret: string
): string {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(timestampHeader)
  hmac.update('.')
  hmac.update(rawBody)
  return hmac.digest('hex')
}

export function verifyTimestampedSignature(
  rawBody: Buffer,
  signatureHeader: string,
  timestampHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !timestampHeader || !secret) return false
  const parts = signatureHeader.split('=')
  if (parts.length !== 2 || parts[0] !== 'sha256' || !parts[1]) return false

  const expectedHex = signPayloadWithTimestamp(rawBody, timestampHeader, secret)
  const actual = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(actual, expected)
}

export function isReplayAllowed(
  timestampHeader: string,
  replayWindowSec: number
): { ok: true } | { ok: false; reason: string } {
  const tsMs = toEpochMs(timestampHeader)
  if (tsMs === null) {
    return { ok: false, reason: 'invalid timestamp format' }
  }

  const maxSkewMs = Math.max(1, replayWindowSec) * 1000
  const skew = Math.abs(Date.now() - tsMs)
  if (skew > maxSkewMs) {
    return { ok: false, reason: 'timestamp outside replay window' }
  }
  return { ok: true }
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
}

export function getPayloadLogicalTimestampMs(payload: unknown): number | null {
  const payloadRecord = asRecord(payload)
  if (!payloadRecord) return null

  const sentAt = payloadRecord.sent_at
  if (typeof sentAt === 'string') {
    const ts = toEpochMs(sentAt)
    if (ts !== null) return ts
  }

  const timestamp = payloadRecord.timestamp
  if (typeof timestamp === 'string') {
    const ts = toEpochMs(timestamp)
    if (ts !== null) return ts
  }

  const data = asRecord(payloadRecord.data)
  const metricsSnapshot = data ? asRecord(data.metricsSnapshot) : null
  const metricsTimestamp = metricsSnapshot ? metricsSnapshot.timestamp : null
  if (typeof metricsTimestamp === 'string') {
    return toEpochMs(metricsTimestamp)
  }

  return null
}

export function hashBody(rawBody: Buffer): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex')
}
