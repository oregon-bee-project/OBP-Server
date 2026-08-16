import { describe, it, expect } from 'vitest'

// OccurrenceService is a singleton, and importing it constructs an
// OccurrenceRepository -- but BaseRepository only stores the collection *name*
// and resolves the real collection lazily through a getter, so nothing here
// touches Mongo. That is what makes these pure helpers testable in isolation.
import OccurrenceService from './OccurrenceService.js'
import { fieldNames, requiredFields, blockingFields, coordinateSources } from '../utils/constants.js'

// An obscured observation as iNaturalist returns it to a viewer the observer
// trusts: the public `geojson` is shifted by up to ~27km and the true point
// arrives beside it. Note `positional_accuracy` describes the true location in
// both cases -- it is not privacy-gated, which is why it cannot be used to tell
// obscured records apart.
const obscuredObservation = {
    geoprivacy: 'obscured',
    positional_accuracy: 4,
    geojson: { type: 'Point', coordinates: [-122.7652, 44.7491] },
    place_guess: 'Oregon, US',
    place_ids: [1, 10],
    private_geojson: { type: 'Point', coordinates: [-122.7695, 44.6252] },
    private_place_guess: 'Sweet Home, Oregon, US',
    private_place_ids: [1, 10, 20]
}

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

describe('getObservationLocation', () => {
    it('prefers the private coordinates when the observer trusts us', () => {
        const location = OccurrenceService.getObservationLocation(obscuredObservation)

        expect(location.latitude).toBe('44.6252')
        expect(location.longitude).toBe('-122.7695')
        expect(location.coordinateSource).toBe(coordinateSources.private)
    })

    it('takes locality and place IDs from the private fields too', () => {
        const location = OccurrenceService.getObservationLocation(obscuredObservation)

        // 'Sweet Home, Oregon, US' is a three-part place guess, so it parses to a
        // usable locality; the public 'Oregon, US' would not
        expect(location.locality).toBe('Sweet Home')
        expect(location.placeIds).toEqual([1, 10, 20])
    })

    it('falls back to the public fields when there is no private access', () => {
        const { private_geojson, private_place_guess, private_place_ids, ...withheld } = obscuredObservation
        const location = OccurrenceService.getObservationLocation(withheld)

        expect(location.latitude).toBe('44.7491')
        expect(location.longitude).toBe('-122.7652')
        expect(location.placeIds).toEqual([1, 10])
        expect(location.coordinateSource).toBe(coordinateSources.public)
    })

    it('falls back per field when only the coordinates are private', () => {
        // An observation can carry a private point with no private place guess.
        // Falling back all-or-nothing would drop the locality entirely, and
        // parseLocalityFromPlaceGuess turns undefined into bare quote characters.
        const { private_place_guess, private_place_ids, ...partial } = obscuredObservation
        const location = OccurrenceService.getObservationLocation(partial)

        expect(location.latitude).toBe('44.6252')
        expect(location.coordinateSource).toBe(coordinateSources.private)
        expect(location.locality).toBe('"Oregon, US""')
        expect(location.placeIds).toEqual([1, 10])
    })

    it('reports no source when the observation has no coordinates at all', () => {
        // Records with geoprivacy 'private' arrive with no public geojson, so an
        // empty source distinguishes "no location" from "public location"
        expect(OccurrenceService.getObservationLocation({}).coordinateSource).toBe('')
        expect(OccurrenceService.getObservationLocation(undefined).coordinateSource).toBe('')
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

describe('createOccurrenceFromObservation', () => {
    const observation = {
        ...obscuredObservation,
        observed_on: '2026-06-14',
        uri: 'https://www.inaturalist.org/observations/1',
        user: { id: 1, login: 'a-volunteer' }
    }

    it('builds the occurrence from the private location', () => {
        // The trailing `!` tells TypeScript we know this is defined:
        // createOccurrenceFromObservation returns undefined only when handed no
        // observation at all, and we always hand it one.
        const occurrence = OccurrenceService.createOccurrenceFromObservation(observation, {})!

        expect(occurrence[fieldNames.latitude]).toBe('44.6252')
        expect(occurrence[fieldNames.longitude]).toBe('-122.7695')
        expect(occurrence[fieldNames.locality]).toBe('Sweet Home')
        expect(occurrence[fieldNames.coordinateSource]).toBe(coordinateSources.private)
    })

    it('falls back to the public location, and says so', () => {
        const { private_geojson, private_place_guess, private_place_ids, ...withheld } = observation
        const occurrence = OccurrenceService.createOccurrenceFromObservation(withheld, {})!

        expect(occurrence[fieldNames.latitude]).toBe('44.7491')
        expect(occurrence[fieldNames.coordinateSource]).toBe(coordinateSources.public)
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

    it('does not flag an obscured record whose private coordinates we hold', () => {
        const flags = flagsOf({
            ...validOccurrence,
            [fieldNames.geoprivacy]: 'obscured',
            [fieldNames.taxon_geoprivacy]: 'obscured',
            [fieldNames.coordinateSource]: coordinateSources.private
        })

        expect(flags).not.toContain(fieldNames.geoprivacy)
        expect(flags).not.toContain(fieldNames.taxon_geoprivacy)
    })

    it('checks locality normally once we hold the private coordinates', () => {
        // #42 stopped flagging locality on obscured records because their
        // locality is coarse. With private access it is precise again, so the
        // ordinary rules apply -- here, a comma
        const flags = flagsOf({
            ...validOccurrence,
            [fieldNames.geoprivacy]: 'obscured',
            [fieldNames.coordinateSource]: coordinateSources.private,
            [fieldNames.locality]: 'Corvallis, OR'
        })

        expect(flags).toContain(fieldNames.locality)
    })

    it('still skips the locality check when the location is withheld', () => {
        const flags = flagsOf({
            ...validOccurrence,
            [fieldNames.geoprivacy]: 'obscured',
            [fieldNames.coordinateSource]: coordinateSources.public,
            [fieldNames.locality]: '"Oregon, US""'
        })

        expect(flags).not.toContain(fieldNames.locality)
        expect(flags).toContain(fieldNames.geoprivacy)
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
