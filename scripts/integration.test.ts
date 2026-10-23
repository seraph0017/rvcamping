import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

test('notice station: paper workflow, retired writes, public guestbook and preserved records', async () => {
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
    const fixture = new DatabaseSync(join(dir, 'test.db'))
    const family = fixture.prepare('SELECT id,token FROM families ORDER BY id LIMIT 1').get() as { id: number; token: string }
    fixture.prepare("INSERT INTO guest_messages(family_id,name,message,created_ms) VALUES(?,?,?,?)").run(family.id, '原村民', '保留的旧留言', Date.now()-60_000)
    const oldToken = family.token
    const originalOps = fixture.prepare('SELECT COUNT(*) AS n FROM ops').get()!.n
    const home = await (await call('/?staff=1')).text()
    for (const label of ['村庄公告', '村民公约', '营地地图', '村庄地图', '营地 TIPS', '活动时间表', '留言板']) assert.ok(home.includes(label), label)
    for (const label of ['qrbox', 'checkinStatus', 'giftStatus', 'view-staff', 'data-token=', '专属二维码']) assert.ok(!home.includes(label), label)
    const oldPage = await call('/v/' + oldToken)
    assert.equal(oldPage.headers.get('location'), '/')
    assert.equal((await call('/ops')).headers.get('location'), '/')
    assert.equal((await call('/ops/login')).headers.get('location'), '/admin/login')
    assert.equal((await call('/api/ops', json([]))).status, 410)
    assert.equal((await call('/api/v/' + oldToken)).status, 410)
    const login = await call('/admin/login', { method: 'POST', body: new URLSearchParams({ pin: '987654' }) })
    assert.equal(login.headers.get('location'), '/admin')
    const setCookie = login.headers.get('set-cookie') ?? ''
    assert.ok(setCookie.includes('rv_session='))
    assert.ok(!/; Secure/i.test(setCookie), 'HTTP admin session works')
    const cookie = setCookie.split(';')[0]
    assert.equal((await call('/api/ops', json([{ token: oldToken, type: 'checkin' }], cookie))).status, 410)
    assert.equal((await call('/admin/backfill', json({}, cookie))).status, 410)
    assert.equal((await call('/api/groups/example/undo', json({}, cookie))).status, 410)
    assert.equal((await call('/api/staff/conflicts/example/resolve', json({}, cookie))).status, 410)
    const staffLogin = await call('/admin/login', { method: 'POST', body: new URLSearchParams({ pin: '1234' }) })
    assert.ok(!staffLogin.headers.has('set-cookie'), 'retired staff cannot access admin')
    const boardBefore = await (await call('/api/guestbook')).json()
    assert.equal(boardBefore.messages[0].message, '保留的旧留言')
    assert.equal((await call('/api/guestbook', json({ message: '  ' }))).status, 400)
    const message = '<img src=x onerror=alert(1)> 公告站留言'
    const added = await call('/api/guestbook', json({ name: '露营伙伴', message }))
    assert.equal(added.status, 201, 'no family card or login required')
    const visitorCookie = added.headers.get('set-cookie')!.split(';')[0]
    const entry = await added.json()
    const entries = await (await call('/api/guestbook')).json()
    assert.ok(entries.messages.some((m: { message: string }) => m.message === message))
    assert.equal(entries.messages[0].visitor_key, undefined)
    assert.equal((await call('/api/guestbook', json({ message: 'too fast' }, visitorCookie))).status, 429)
    assert.equal((await call('/api/guestbook', json({ message: 'x'.repeat(301) }))).status, 400)
    assert.equal((await call('/api/admin/guestbook/' + entry.id + '/hide', json({}))).status, 403)
    assert.ok((await call('/api/admin/guestbook/' + entry.id + '/hide', json({}, cookie))).ok)
    const admin = await (await call('/admin', { headers: { cookie } })).text()
    assert.ok(admin.includes('留言管理') && admin.includes('纸质签领表'))
    assert.ok(!admin.includes('补录') && !admin.includes('已签到'))
    const paper = await (await call('/forms/signatures')).text()
    assert.ok(paper.includes('签到签名') && paper.includes('礼品领取签名'))
    assert.equal((paper.match(/class="signature-sheet"/g) ?? []).length, 3)
    assert.equal(fixture.prepare('SELECT COUNT(*) AS n FROM ops').get()!.n, originalOps)
    assert.equal(fixture.prepare('SELECT token FROM families WHERE id=?').get(family.id)!.token, oldToken)
    assert.equal(fixture.prepare('SELECT COUNT(*) AS n FROM guest_messages').get()!.n, 1)
    assert.equal(fixture.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok')
    fixture.close()
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM')
      await new Promise<void>(resolve => child.once('close', () => resolve()))
    }
    rmSync(dir, { recursive: true, force: true })
  }
})
