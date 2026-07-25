import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
    includesIllegalSuffix,
    getDayOfYear,
    getOFV,
    parseQueryParameters,
    parseSubtasks,
    encryptObject,
    decryptObject,
} from './utilities.js'
import { InvalidArgumentError, ValidationError } from './errors.js'

describe('includesIllegalSuffix', () => {
    it.each([
        '123 Oak Road',
        '456 Main St',
        'NW Harrison Blvd, Corvallis',
    ])('detects the street suffix in %j', (address) => {
        expect(includesIllegalSuffix(address)).toBe(true)
    })

    it.each([
        'Corvallis, Oregon',       // no suffix at all
        'Straw Hill',              // "St" only counts as a whole word
        'Stone Creek Meadow',
    ])('accepts %j', (place) => {
        expect(includesIllegalSuffix(place)).toBe(false)
    })

    it('tolerates non-string input', () => {
        expect(includesIllegalSuffix(undefined)).toBe(false)
    })
})

describe('getDayOfYear', () => {
    it('starts at 1 on January 1st', () => {
        expect(getDayOfYear(new Date(2026, 0, 1))).toBe(1)
    })

    it('accounts for leap years', () => {
        expect(getDayOfYear(new Date(2025, 11, 31))).toBe(365)
        expect(getDayOfYear(new Date(2024, 11, 31))).toBe(366)
    })

    it('returns undefined for an invalid date', () => {
        expect(getDayOfYear(new Date('not a date'))).toBeUndefined()
    })
})

describe('getOFV', () => {
    const ofvs = [{ name: 'Sample ID.', value: '12' }]

    it('looks up an observation field by name', () => {
        expect(getOFV(ofvs, 'Sample ID.')).toBe('12')
    })

    it('returns an empty string when the field is absent', () => {
        expect(getOFV(ofvs, 'Specimen ID.')).toBe('')
        expect(getOFV(undefined, 'Sample ID.')).toBe('')
    })
})

describe('parseQueryParameters', () => {
    // parseQueryParameters currently console.logs its result. vi.spyOn() wraps
    // an existing method so the test can silence and/or inspect calls to it;
    // mockRestore() puts the original back so other tests are unaffected.
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
        logSpy.mockRestore()
    })

    const ADMIN_ID = '64ff0a2b7c1e4d5a6b7c8d9e'

    const parse = parseQueryParameters

    it('applies default pagination', () => {
        const params = parse({}, ADMIN_ID)
        expect(params.page).toBe(1)
        expect(params.pageSize).toBe(50)
        expect(params.error).toBeUndefined()
    })

    it('caps per_page at 5000', () => {
        const params = parse({ per_page: '999999' }, ADMIN_ID)
        expect(params.pageSize).toBe(5000)
    })

    it('rejects unauthenticated queries that do not name a single userLogin', () => {
        expect(parse({}).error?.status).toBe(401)
        expect(parse({ userLogin: 'a,b' }).error?.status).toBe(401)
        expect(parse({ userLogin: 'some-volunteer' }).error).toBeUndefined()
    })

    it('rejects a start_date after the end_date', () => {
        const params = parse(
            { start_date: '2026-06-01', end_date: '2026-05-01' },
            ADMIN_ID
        )
        expect(params.error?.status).toBe(400)
    })

    it("translates the reserved '(empty)' value into a null-or-empty filter", () => {
        const params = parse({ county: '(empty)' }, ADMIN_ID)
        expect(params.filter.county).toEqual({ $in: [null, ''] })
    })
})

describe('parseSubtasks', () => {
    it('rejects missing input', () => {
        expect(() => parseSubtasks(undefined, 'admin')).toThrow(InvalidArgumentError)
    })

    it('rejects malformed JSON', () => {
        // parseSubtasks means to convert this into a ValidationError('Invalid
        // JSON in subtasks'), but its catch block looks for 'JSON.parse' in the
        // error message and modern SyntaxError messages don't contain that — so
        // the raw SyntaxError escapes. Asserting the loose current behavior
        // until that's fixed.
        expect(() => parseSubtasks('not json', 'admin')).toThrow(SyntaxError)
    })

    it('rejects unknown subtask types', () => {
        const json = JSON.stringify([{ type: 'terraform' }])
        expect(() => parseSubtasks(json, 'admin')).toThrow("Invalid subtask type 'terraform'")
    })

    it('formats observations subtask dates as YYYY-MM-DD', () => {
        const json = JSON.stringify([{
            type: 'observations',
            sources: '18521,166376',
            minDate: 'June 1, 2026',
            maxDate: 'June 30, 2026',
        }])
        const [subtask] = parseSubtasks(json, 'admin')
        expect(subtask.sources).toEqual(['18521', '166376'])
        expect(subtask.minDate).toBe('2026-06-01')
        expect(subtask.maxDate).toBe('2026-06-30')
    })
})

describe('encryptObject / decryptObject', () => {
    // The encryption key is derived from TOKEN_ENCRYPTION_SECRET/_SALT, which
    // test/setupEnv.ts provides — no mocking needed here.
    const secret = { accessToken: 'abc123', owner: 'some-volunteer' }

    it('round-trips an object', () => {
        expect(decryptObject(encryptObject(secret))).toEqual(secret)
    })

    it('uses a fresh IV each time, so ciphertexts never repeat', () => {
        expect(encryptObject(secret).data).not.toEqual(encryptObject(secret).data)
    })

    it('returns undefined for missing or incomplete input', () => {
        expect(decryptObject(undefined)).toBeUndefined()
        expect(decryptObject({ iv: 'only-an-iv' })).toBeUndefined()
    })
})
