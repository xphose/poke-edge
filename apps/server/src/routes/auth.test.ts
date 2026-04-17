import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { createApp } from '../app.js'
import { cacheInvalidateAll } from '../cache.js'
import { config } from '../config.js'
import { openMemoryDb } from '../test/helpers.js'

// Security-critical invariants around signup and role assignment.
//
// Background: an earlier version of the signup path implicitly granted 'admin'
// to whichever user was first in the `users` table at the moment of INSERT.
// That was triggered in production, silently handing admin + premium access
// to a brand-new signup. These tests exist to make sure it never happens again.
//
// Invariants enforced here:
//   1. A signup on an empty DB creates a 'free' user. Never 'admin', never 'premium'.
//   2. Any number of subsequent signups are also 'free'.
//   3. The issued JWT reflects the stored role exactly — no privilege escalation
//      in the response body or the token claims.
//   4. The ONLY way signup can produce an 'admin' is an explicit operator opt-in
//      via the BOOTSTRAP_ADMIN_EMAILS allowlist. Unrelated emails still come
//      back as 'free' even when the allowlist is populated.
//   5. The allowlist matches case-insensitively on email, because registration
//      lowercases emails before storage.
//   6. Google OAuth signup obeys the same invariants as password signup.

function readRoleFromDb(db: ReturnType<typeof openMemoryDb>, username: string): string | undefined {
  const row = db.prepare('SELECT role FROM users WHERE username = ?').get(username) as { role: string } | undefined
  return row?.role
}

describe('POST /api/auth/register — role assignment', () => {
  const originalAllowlist = config.bootstrapAdminEmails

  beforeEach(() => {
    cacheInvalidateAll()
    // Reset the allowlist to empty for every test so one test's mutation
    // cannot leak into another.
    config.bootstrapAdminEmails = []
  })

  afterEach(() => {
    config.bootstrapAdminEmails = originalAllowlist
  })

  it('first signup on an empty DB is created as a free user, not admin', async () => {
    const db = openMemoryDb()
    const app = createApp(db)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'firstuser', email: 'first@example.com', password: 'correct-horse-battery' })
      .expect(201)

    expect(res.body.user.role).toBe('free')
    expect(readRoleFromDb(db, 'firstuser')).toBe('free')
  })

  it('JWT issued on first signup does not claim admin', async () => {
    const db = openMemoryDb()
    const app = createApp(db)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'firstuser', email: 'first@example.com', password: 'correct-horse-battery' })
      .expect(201)

    // Decode the JWT payload without verifying the signature — we only care
    // that the server did not put "admin" into the claims.
    const parts = String(res.body.accessToken).split('.')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    expect(payload.role).toBe('free')
    expect(payload.role).not.toBe('admin')
    expect(payload.role).not.toBe('premium')
  })

  it('a user granted admin out-of-band does NOT cause subsequent signups to inherit admin', async () => {
    // This is the exact scenario that bit us in prod: there was an admin in
    // the table, then the table state changed, and the next signup silently
    // got admin. The invariant is that role assignment for a new signup is a
    // pure function of (allowlist, provided email) — never of existing rows.
    const db = openMemoryDb()
    db.prepare(
      "INSERT INTO users (username, email, password_hash, role) VALUES ('rootadmin', 'root@example.com', 'x', 'admin')",
    ).run()
    // Then the admin row is deleted, leaving the users table empty again.
    db.prepare('DELETE FROM users').run()

    const app = createApp(db)
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'unrelated', email: 'unrelated@example.com', password: 'correct-horse-battery' })
      .expect(201)

    expect(res.body.user.role).toBe('free')
    expect(readRoleFromDb(db, 'unrelated')).toBe('free')
  })

  it('tenth signup in a populated DB is still free', async () => {
    const db = openMemoryDb()
    const app = createApp(db)

    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: `user${i}`, email: `user${i}@example.com`, password: 'correct-horse-battery' })
        .expect(201)
      expect(res.body.user.role).toBe('free')
    }
  })

  it('never returns premium from signup even if someone requests it in the body', async () => {
    const db = openMemoryDb()
    const app = createApp(db)

    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'sneaky',
        email: 'sneaky@example.com',
        password: 'correct-horse-battery',
        role: 'premium',
        admin: true,
        is_admin: true,
      })
      .expect(201)

    expect(res.body.user.role).toBe('free')
    expect(readRoleFromDb(db, 'sneaky')).toBe('free')
  })

  it('only promotes to admin when the email is in BOOTSTRAP_ADMIN_EMAILS', async () => {
    config.bootstrapAdminEmails = ['owner@example.com']
    const db = openMemoryDb()
    const app = createApp(db)

    const allowed = await request(app)
      .post('/api/auth/register')
      .send({ username: 'owner', email: 'owner@example.com', password: 'correct-horse-battery' })
      .expect(201)
    expect(allowed.body.user.role).toBe('admin')
    expect(readRoleFromDb(db, 'owner')).toBe('admin')

    const unrelated = await request(app)
      .post('/api/auth/register')
      .send({ username: 'other', email: 'other@example.com', password: 'correct-horse-battery' })
      .expect(201)
    expect(unrelated.body.user.role).toBe('free')
    expect(readRoleFromDb(db, 'other')).toBe('free')
  })

  it('allowlist matching is case-insensitive on email', async () => {
    config.bootstrapAdminEmails = ['owner@example.com']
    const db = openMemoryDb()
    const app = createApp(db)

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'owner', email: 'OWNER@Example.COM', password: 'correct-horse-battery' })
      .expect(201)

    expect(res.body.user.role).toBe('admin')
    expect(readRoleFromDb(db, 'owner')).toBe('admin')
  })
})

describe('POST /api/auth/google — role assignment', () => {
  const originalAllowlist = config.bootstrapAdminEmails
  const originalClientId = config.googleClientId
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    cacheInvalidateAll()
    config.bootstrapAdminEmails = []
    config.googleClientId = 'test-google-client-id'
  })

  afterEach(() => {
    config.bootstrapAdminEmails = originalAllowlist
    config.googleClientId = originalClientId
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function stubGoogleTokeninfo(info: { sub: string; email: string; name?: string; aud: string }) {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => info,
    })) as unknown as typeof fetch
  }

  it('first Google signup on an empty DB creates a free user, not admin', async () => {
    stubGoogleTokeninfo({ sub: 'g-123', email: 'first@example.com', name: 'First', aud: 'test-google-client-id' })
    const db = openMemoryDb()
    const app = createApp(db)

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' })
      .expect(200)

    expect(res.body.user.role).toBe('free')
    const stored = db.prepare('SELECT role FROM users WHERE email = ?').get('first@example.com') as { role: string }
    expect(stored.role).toBe('free')
  })

  it('Google signup only promotes when email is on the allowlist', async () => {
    config.bootstrapAdminEmails = ['owner@example.com']
    stubGoogleTokeninfo({ sub: 'g-456', email: 'owner@example.com', name: 'Owner', aud: 'test-google-client-id' })
    const db = openMemoryDb()
    const app = createApp(db)

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' })
      .expect(200)

    expect(res.body.user.role).toBe('admin')
  })

  it('existing Google user keeps their stored role and is never escalated', async () => {
    // Prior-existing free user — a later Google login must not bump them to admin
    // just because their email happens to match the allowlist today.
    config.bootstrapAdminEmails = ['owner@example.com']
    const db = openMemoryDb()
    db.prepare(
      "INSERT INTO users (username, email, password_hash, role) VALUES ('owner', 'owner@example.com', 'x', 'free')",
    ).run()

    stubGoogleTokeninfo({ sub: 'g-789', email: 'owner@example.com', name: 'Owner', aud: 'test-google-client-id' })
    const app = createApp(db)

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-id-token' })
      .expect(200)

    expect(res.body.user.role).toBe('free')
    const stored = db.prepare('SELECT role FROM users WHERE email = ?').get('owner@example.com') as { role: string }
    expect(stored.role).toBe('free')
  })
})
