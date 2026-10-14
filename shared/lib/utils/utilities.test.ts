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

    describe('stewardshipReport subtasks', () => {
        const parseStewardship = (fields: Record<string, unknown>) =>
            parseSubtasks(JSON.stringify([{ type: 'stewardshipReport', ...fields }]), 'admin')[0]

        const params = (url: string) => new URL(url).searchParams

        it('converts a project page into a plant observations query', () => {
            const { url } = parseStewardship({
                input: 'url',
                url: 'https://www.inaturalist.org/projects/stoller-vineyard-and-winery?tab=observations',
            })
            expect(new URL(url).pathname).toBe('/observations')
            expect(params(url).get('project_id')).toBe('stoller-vineyard-and-winery')
            expect(params(url).get('iconic_taxa')).toBe('Plantae')
            expect(params(url).has('tab')).toBe(false)
        })

        it('keeps the bounds of a map-area observations URL', () => {
            const { url } = parseStewardship({
                input: 'url',
                url: 'https://www.inaturalist.org/observations?nelat=44.245116635&nelng=-117.668568335&subview=map&swlat=44.180507552&swlng=-117.785828195',
            })
            expect(params(url).get('nelat')).toBe('44.245116635')
            expect(params(url).get('swlng')).toBe('-117.785828195')
            expect(params(url).get('iconic_taxa')).toBe('Plantae')
            expect(params(url).has('subview')).toBe(false)
        })

        it.each([
            'https://inaturalist.ca/projects/some-bc-vineyard',
            'https://www.naturalista.mx/projects/some-bc-vineyard',
            'https://portugal.inaturalist.org/projects/some-bc-vineyard',
        ])('accepts the iNaturalist Network partner URL %s', (partnerUrl) => {
            // Partner sites share iNaturalist's database, so the URL is
            // rewritten to the same inaturalist.org query
            const { url } = parseStewardship({ input: 'url', url: partnerUrl })
            expect(new URL(url).hostname).toBe('www.inaturalist.org')
            expect(params(url).get('project_id')).toBe('some-bc-vineyard')
        })

        it('always limits observations to plants', () => {
            const { url } = parseStewardship({
                input: 'url',
                url: 'https://www.inaturalist.org/observations?place_id=10&iconic_taxa=Insecta',
            })
            expect(params(url).getAll('iconic_taxa')).toEqual(['Plantae'])
        })

        it.each([
            ['an unscoped URL', 'https://www.inaturalist.org/observations?iconic_taxa=Plantae'],
            ['a partial map area', 'https://www.inaturalist.org/observations?nelat=44&nelng=-117'],
            ['a non-iNaturalist host', 'https://example.com/observations?place_id=10'],
            ['a lookalike host', 'https://inaturalist.org.example.com/observations?place_id=10'],
            ['a lookalike partner host', 'https://inaturalist.ca.example.com/observations?place_id=10'],
            ['a host ending in a partner domain', 'https://notinaturalist.ca/observations?place_id=10'],
            ['an unsupported page', 'https://www.inaturalist.org/taxa/47126'],
            ['a malformed URL', 'not a url'],
            ['a missing URL', undefined],
        ])('rejects %s', (_, url) => {
            expect(() => parseStewardship({ input: 'url', url })).toThrow(ValidationError)
        })

        it('rejects an unknown input type', () => {
            expect(() => parseStewardship({ input: 'selection' })).toThrow(ValidationError)
        })

        it('ignores the URL for uploads', () => {
            const subtask = parseStewardship({ input: 'upload', url: 'https://www.inaturalist.org/observations' })
            expect(subtask.url).toBeUndefined()
        })

        it.each([
            [undefined, 'Stewardship Report'],
            ['   ', 'Stewardship Report'],
            ['Stoller Vineyard', 'Stoller Vineyard'],
            ["  O'Brien   Farm  ", "O'Brien Farm"],
            ['Fields & Meadows #2 / 100%', 'Fields Meadows 2 100'],
            ['..hidden', 'hidden'],
            ['&%$', 'Stewardship Report'],
            ['a'.repeat(80), 'a'.repeat(60)],
        ])('normalizes the title %j to %j', (title, expected) => {
            expect(parseStewardship({ input: 'upload', title }).title).toBe(expected)
        })

        it('only refreshes occurrences when explicitly requested', () => {
            expect(parseStewardship({ input: 'upload', refreshOccurrences: true }).refreshOccurrences).toBe(true)
            expect(parseStewardship({ input: 'upload', refreshOccurrences: 'true' }).refreshOccurrences).toBe(false)
            expect(parseStewardship({ input: 'upload' }).refreshOccurrences).toBe(false)
        })
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
