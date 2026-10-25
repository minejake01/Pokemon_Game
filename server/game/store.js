// Where saves live.
// - Upstash Redis (REST API) when its env vars are set. Required for serverless hosts such as Vercel,
//   whose disk is read-only and not shared between requests.
// - Otherwise JSON files in server/saves/ (local dev and `npm start`), or /tmp on Vercel as a
//   last resort (saves can disappear there, so set up Redis).
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
const ON_VERCEL = !!process.env.VERCEL

export const STORE_KIND = REDIS_URL && REDIS_TOKEN ? 'redis' : ON_VERCEL ? 'tmp' : 'files'
// Files are only touched by this process, so they can be cached in memory; Redis is shared by
// many function instances, so it's always read fresh.
export const CACHEABLE = STORE_KIND !== 'redis'

if (STORE_KIND === 'tmp') {
  console.warn('[saves] No Upstash Redis configured: saving to /tmp, which Vercel can wipe at any time.')
}

const key = (id) => `save:${id}`

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) throw new Error(`Redis ${command[0]} failed: ${data.error ?? res.status}`)
  return data.result
}

const DIR = STORE_KIND === 'tmp' ? '/tmp/poke-saves/' : new URL('../saves/', import.meta.url)
const file = (id) => (typeof DIR === 'string' ? `${DIR}${id}.json` : new URL(`${id}.json`, DIR))
let dirReady = null

// Returns the parsed save, or null when there is none.
export async function readSave(id) {
  if (STORE_KIND === 'redis') {
    const raw = await redis(['GET', key(id)])
    return raw ? JSON.parse(raw) : null
  }
  try {
    return JSON.parse(await readFile(file(id), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

export async function writeSave(id, data) {
  const json = JSON.stringify(data)
  if (STORE_KIND === 'redis') return void (await redis(['SET', key(id), json]))
  dirReady ??= mkdir(DIR, { recursive: true })
  await dirReady
  await writeFile(file(id), json)
}
