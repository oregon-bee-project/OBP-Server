import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.mock() replaces a module for every import in this file — including the
// import inside auth.js itself. The factory returns the fake module's exports.
// Here we stand in for the config module, so this suite controls the JWT
// secret directly instead of reading environment variables. (Contrast with
// utilities.test.ts, which uses the real config module and gets its values
// from test/setupEnv.ts — both approaches are fine; mock when you want the
// test to be explicit about a value it depends on.)
vi.mock('../config/environment.js', () => ({
    auth: { jwtSecret: 'a-secret-known-only-to-this-test' },
}))

import { hashPassword, comparePasswordToHash, generateAuthToken, verifyJWT } from './auth.js'

describe('hashPassword / comparePasswordToHash', () => {
    it('round-trips a password', () => {
        const hash = hashPassword('correct horse battery staple')
        expect(comparePasswordToHash('correct horse battery staple', hash)).toBe(true)
    })

    it('rejects a wrong password', () => {
        const hash = hashPassword('correct horse battery staple')
        expect(comparePasswordToHash('Tr0ub4dor&3', hash)).toBe(false)
    })

    it('never stores the password itself', () => {
        expect(hashPassword('hunter2')).not.toContain('hunter2')
    })
})

describe('generateAuthToken / verifyJWT', () => {
    it('round-trips the admin ID in the token payload', () => {
        const token = generateAuthToken('64ff0a2b7c1e4d5a6b7c8d9e')
        const payload = verifyJWT(token)
        expect(payload).toMatchObject({ sub: '64ff0a2b7c1e4d5a6b7c8d9e' })
    })

    it('returns undefined for a tampered token', () => {
        const token = generateAuthToken('64ff0a2b7c1e4d5a6b7c8d9e')
        const [header, , signature] = token.split('.')
        const forgedPayload = Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url')
        expect(verifyJWT(`${header}.${forgedPayload}.${signature}`)).toBeUndefined()
    })

    // Time-dependent behavior is tested with fake timers: vi.setSystemTime()
    // controls what Date.now() returns, so we can "wait" 24 hours instantly.
    describe('expiry', () => {
        beforeEach(() => {
            vi.useFakeTimers()
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('accepts a token younger than 24 hours', () => {
            vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))
            const token = generateAuthToken('some-admin')

            vi.setSystemTime(new Date('2026-07-01T23:59:00Z'))
            expect(verifyJWT(token)).toMatchObject({ sub: 'some-admin' })
        })

        it('rejects a token older than 24 hours', () => {
            vi.setSystemTime(new Date('2026-07-01T00:00:00Z'))
            const token = generateAuthToken('some-admin')

            vi.setSystemTime(new Date('2026-07-02T00:01:00Z'))
            expect(verifyJWT(token)).toBeUndefined()
        })
    })
})
