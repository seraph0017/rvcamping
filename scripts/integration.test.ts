import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('client package: real sessions, shared status, QR, guestbook and permissions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rv-integration-'))
  const port = 21000 + Math.floor(Math.random() * 20000)
  const base = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', BASE_URL: 'http://village.test',
      DB_PATH: join(dir, 'test.db'), SESSION_SECRET: 'integration-only-secret', STAFF_PIN: '987654' },
    stdio: 'ignore',
  })
  const call = (path: string, options: RequestInit = {}) => fetch(base + path, { redirect: 'manual', ...options })
  const json = (body: unknown, cookie = '') => ({ method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) })
  try {
    let ready = false
    for (let n = 0; n < 80; n++) {
      try { if ((await call('/healthz')).ok) { ready = true; break } } catch {}
      await new Promise(r => setTimeout(r, 100))
    }
    assert.ok(ready, 'isolated server starts')
    const login = await call('/ops/login', { method: 'POST', body: new URLSearchParams({ pin: '987654' }) })
    const setCookie = login.headers.get('set-cookie') ?? ''
    assert.ok(setCookie.includes('rv_session='))
    assert.ok(!/; Secure/i.test(setCookie), 'HTTP production keeps its session cookie')
    const cookie = setCookie.split(';')[0]
    const snap = await (await call('/api/staff/snapshot', { headers: { cookie } })).json()
    const token = snap.families[0].token
    const token2 = snap.families[1].token
    assert.equal((await call('/api/ops', json([]))).status, 401)
    const op = { op_id: 'integration-checkin', token, type: 'checkin', client_ms: Date.now() }
    assert.equal((await (await call('/api/ops', json([op], cookie))).json()).results[0].status, 'accepted')
    assert.equal((await (await call('/api/ops', json([op], cookie))).json()).results[0].status, 'duplicate')
    const family = (await (await call('/api/v/' + token)).json()).family
    assert.ok(family.checkin_at, 'second client sees persisted checkin')
    assert.equal(family.phone, undefined)
    const card = await (await call('/v/' + token)).text()
    assert.ok(card.includes('view-card') && card.includes('/assets/village.js'))
    assert.ok(!card.includes('cdnjs') && !card.includes('localStorage'))
    assert.match(await (await call('/api/v/' + token + '/qr.svg')).text(), /<svg/)
    const home = await (await call('/?staff=1')).text()
    assert.ok(!home.includes('view-staff') && !home.includes('href="/ops'))
    assert.equal((await call('/api/guestbook', json({ message: 'anonymous' }))).status, 401)
    assert.equal((await call('/api/guestbook', json({ token, message: '  ' }))).status, 400)
    const message = '<img src=x onerror=alert(1)> hello village'
    const added = await call('/api/guestbook', json({ token, name: '一家人', message }))
    assert.equal(added.status, 201)
    const entry = await added.json()
    const entries = await (await call('/api/guestbook')).json()
    assert.equal(entries.messages[0].message, message)
    assert.equal(entries.messages[0].token, undefined)
    assert.equal((await call('/api/guestbook', json({ token, message: 'too fast' }))).status, 429)
    assert.equal((await call('/api/guestbook', json({ token: token2, message: 'x'.repeat(301) }))).status, 400)
    assert.equal((await call('/api/admin/guestbook/' + entry.id + '/hide', json({}))).status, 403)
    assert.ok((await call('/api/admin/guestbook/' + entry.id + '/hide', json({}, cookie))).ok)
    assert.equal((await (await call('/api/guestbook')).json()).messages.length, 0)
    assert.ok((await call('/api/ops/integration-checkin/undo', json({}, cookie))).ok)
    assert.equal((await (await call('/api/v/' + token)).json()).family.checkin_at, null)
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise<void>(resolve => child.once('close', () => resolve()))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
