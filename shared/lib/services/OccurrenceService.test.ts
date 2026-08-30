import { describe, it, expect } from 'vitest'

// OccurrenceService is a singleton, and importing it constructs an
// OccurrenceRepository -- but BaseRepository only stores the collection *name*
// and resolves the real collection lazily through a getter, so nothing here
// touches Mongo. That is what makes these pure helpers testable in isolation.
import OccurrenceService from './OccurrenceService.js'
import { fieldNames, requiredFields, blockingFields } from '../utils/constants.js'

describe('blockingFields', () => {
    it('covers every required field', () => {
        // A missing required value is itself reported as an error flag, so
        // everything that must be present must also be unflagged.
        expect(blockingFields).toEqual(expect.arrayContaining([...requiredFields]))
    })

    it('adds the privacy fields, which are not required fields', () => {
        expect(blockingFields).toContain(fieldNames.geoprivacy)
        expect(blockingFields).toContain(fieldNames.taxon_geoprivacy)

        // These deliberately stay out of requiredFields: getPrintableOccurrences
        // queries for required fields being non-empty, so listing them there
        // would select *only* obscured records instead of excluding them.
        expect(requiredFields).not.toContain(fieldNames.geoprivacy)
        expect(requiredFields).not.toContain(fieldNames.taxon_geoprivacy)
    })
})

describe('hasBlockingErrorFlags', () => {
    it('passes an occurrence with no flags', () => {
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: '' })).toBe(false)
    })

    it('passes an occurrence flagged only on fields a label does not use', () => {
        // county is flagged when empty but never printed on a label
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'county' })).toBe(false)
    })

    it('blocks an occurrence missing a required field', () => {
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'locality' })).toBe(true)
    })

    it('blocks an obscured occurrence', () => {
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'geoprivacy' })).toBe(true)
    })

    it('blocks an occurrence obscured by its taxon', () => {
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'taxon_geoprivacy' })).toBe(true)
    })

    it('finds a blocking flag anywhere in the semicolon-separated list', () => {
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'county;geoprivacy;phylumPlant' })).toBe(true)
    })

    it('does not match on a partial field name', () => {
        // Splitting on ';' rather than substring-matching keeps 'geoprivacyNotes'
        // from reading as 'geoprivacy'
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'geoprivacyNotes' })).toBe(false)
    })

    it('passes an occurrence with no errorFlags field at all', () => {
        expect(OccurrenceService.hasBlockingErrorFlags({})).toBe(false)
        expect(OccurrenceService.hasBlockingErrorFlags(undefined)).toBe(false)
    })
})

describe('updateErrorFlags', () => {
    // A minimally valid occurrence: every field that must be non-empty has a
    // value, so any flag raised below comes from the rule under test.
    const validOccurrence = {
        [fieldNames.firstName]: 'Jane',
        [fieldNames.firstNameInitial]: 'J.',
        [fieldNames.lastName]: 'Melitta',
        [fieldNames.sampleId]: '3',
        [fieldNames.specimenId]: '1',
        [fieldNames.day]: '14',
        [fieldNames.month]: '6',
        [fieldNames.year]: '2026',
        [fieldNames.country]: 'US',
        [fieldNames.stateProvince]: 'OR',
        [fieldNames.county]: 'Benton',
        [fieldNames.locality]: 'Corvallis',
        [fieldNames.latitude]: '44.5646',
        [fieldNames.longitude]: '-123.2620',
        [fieldNames.samplingProtocol]: 'aerial net'
    }

    const flagsOf = (occurrence: Record<string, string>) =>
        OccurrenceService.updateErrorFlags(occurrence)[fieldNames.errorFlags].split(';').filter(Boolean)

    it('raises no flags for a complete, open record', () => {
        expect(flagsOf(validOccurrence)).toEqual([])
    })

    it('flags an obscured record', () => {
        expect(flagsOf({ ...validOccurrence, [fieldNames.geoprivacy]: 'obscured' }))
            .toContain(fieldNames.geoprivacy)
    })

    it('flags a record obscured by its taxon', () => {
        expect(flagsOf({ ...validOccurrence, [fieldNames.taxon_geoprivacy]: 'obscured' }))
            .toContain(fieldNames.taxon_geoprivacy)
    })

    it('keeps an obscured record off a label', () => {
        // The point of the whole exercise: flagged by updateErrorFlags, and that
        // flag is one hasBlockingErrorFlags refuses to print.
        const obscured = OccurrenceService.updateErrorFlags({
            ...validOccurrence,
            [fieldNames.geoprivacy]: 'obscured'
        })

        expect(OccurrenceService.hasBlockingErrorFlags(obscured)).toBe(true)
    })
})
