import { describe, it, expect, vi, afterEach } from 'vitest'

// OccurrenceService is a singleton, and importing it constructs an
// OccurrenceRepository -- but BaseRepository only stores the collection *name*
// and resolves the real collection lazily through a getter, so nothing here
// touches Mongo. That is what makes these pure helpers testable in isolation.
import OccurrenceService from './OccurrenceService.js'
import { fieldNames, requiredFields, coordinateSources } from '../utils/constants.js'

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

describe('requiredFields', () => {
    it('carries the location fields, and no privacy field', () => {
        // Privacy does not gate a label; a location does. A record whose true
        // location was withheld has no coordinates and no locality, so these
        // three keep it off labels without any privacy field being consulted.
        expect(requiredFields).toContain(fieldNames.latitude)
        expect(requiredFields).toContain(fieldNames.longitude)
        expect(requiredFields).toContain(fieldNames.locality)

        // getPrintableOccurrences queries for required fields being non-empty, so
        // a privacy field listed here would select exactly the obscured records
        // instead of excluding them.
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

    it('records no location at all when there is no private access', () => {
        // The public geojson here is a point up to ~27km from the specimen. It is
        // not a coarser location, it is a different place, and stored it would be
        // indistinguishable from a real one.
        const { private_geojson, private_place_guess, private_place_ids, ...withheld } = obscuredObservation
        const location = OccurrenceService.getObservationLocation(withheld)

        expect(location.latitude).toBe('')
        expect(location.longitude).toBe('')
        expect(location.locality).toBe('')
        expect(location.placeIds).toEqual([])
        expect(location.coordinateSource).toBe('')
    })

    it('keeps the public location for a record nobody obscured', () => {
        // With no geoprivacy of either kind, the public point is the true one
        const open = { geojson: obscuredObservation.geojson, place_guess: 'Sweet Home, Oregon, US', place_ids: [1, 10] }
        const location = OccurrenceService.getObservationLocation(open)

        expect(location.latitude).toBe('44.7491')
        expect(location.locality).toBe('Sweet Home')
        expect(location.coordinateSource).toBe(coordinateSources.public)
    })

    it('takes no locality from the public side when the coordinates are private', () => {
        // An observation can carry a private point and no private place guess. The
        // public guess describes the shifted point, so pairing it with the true
        // coordinates would put a locality in the record that names somewhere else.
        const { private_place_guess, private_place_ids, ...partial } = obscuredObservation
        const location = OccurrenceService.getObservationLocation(partial)

        expect(location.latitude).toBe('44.6252')
        expect(location.coordinateSource).toBe(coordinateSources.private)
        expect(location.locality).toBe('')
        expect(location.placeIds).toEqual([])
    })

    it('uses the private location when the taxon is obscured too', () => {
        // Whichever kind of obscuring put the true point behind a grant, being
        // granted it is what decides. Coarsening this record for the species it
        // protects is a question for whoever exports it onward, and the
        // taxon_geoprivacy flag it keeps is what marks it for them.
        const taxonObscured = { ...obscuredObservation, taxon_geoprivacy: 'obscured' }
        const location = OccurrenceService.getObservationLocation(taxonObscured)

        expect(location.latitude).toBe('44.6252')
        expect(location.longitude).toBe('-122.7695')
        expect(location.locality).toBe('Sweet Home')
        expect(location.placeIds).toEqual([1, 10, 20])
        expect(location.coordinateSource).toBe(coordinateSources.private)
    })

    it('records no location for a taxon-obscured record without private access', () => {
        const { private_geojson, private_place_guess, private_place_ids, ...withheld } = obscuredObservation
        const location = OccurrenceService.getObservationLocation({
            ...withheld, geoprivacy: null, taxon_geoprivacy: 'obscured'
        })

        expect(location.latitude).toBe('')
        expect(location.coordinateSource).toBe('')
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

    it('passes on a privacy flag alone', () => {
        // Neither privacy field gates a label. A record whose true location was
        // withheld is stopped by its empty coordinates, which arrive here as flags
        // on latitude, longitude and locality; one whose location we do hold has
        // nothing to be stopped for.
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'geoprivacy' })).toBe(false)
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'taxon_geoprivacy' })).toBe(false)
    })

    it('blocks a record whose location was withheld', () => {
        // The shape updateErrorFlags actually produces for such a record
        expect(OccurrenceService.hasBlockingErrorFlags({
            [fieldNames.errorFlags]: 'locality;latitude;longitude;geoprivacy'
        })).toBe(true)
    })

    it('finds a blocking flag anywhere in the semicolon-separated list', () => {
        expect(OccurrenceService.hasBlockingErrorFlags({ [fieldNames.errorFlags]: 'county;locality;phylumPlant' })).toBe(true)
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

    it('stores no location, and no locality, when access was withheld', () => {
        const { private_geojson, private_place_guess, private_place_ids, ...withheld } = observation
        const occurrence = OccurrenceService.createOccurrenceFromObservation(withheld, {})!

        expect(occurrence[fieldNames.latitude]).toBe('')
        expect(occurrence[fieldNames.longitude]).toBe('')
        expect(occurrence[fieldNames.locality]).toBe('')
        expect(occurrence[fieldNames.coordinateSource]).toBe('')

        // and it is the empty location, not the geoprivacy, that stops the label
        expect(OccurrenceService.hasBlockingErrorFlags(occurrence)).toBe(true)
    })
})

describe('updateOccurrenceFromObservation', () => {
    // This method is the only part of the re-pull path that writes to Mongo, so
    // stubbing the repository's updateById lets us inspect exactly what a re-pull
    // would save without standing up a database.
    const captureUpdate = () => vi.spyOn(OccurrenceService.repository, 'updateById').mockResolvedValue(undefined)

    afterEach(() => vi.restoreAllMocks())

    const existingOccurrence = {
        _id: 'an-id',
        [fieldNames.iNaturalistUrl]: 'https://www.inaturalist.org/observations/1',
        [fieldNames.latitude]: '44.5646',
        [fieldNames.longitude]: '-123.2620',
        [fieldNames.locality]: 'Corvallis',
        // Built back when the observation was still open, so no privacy values
        [fieldNames.geoprivacy]: '',
        [fieldNames.taxon_geoprivacy]: ''
    }

    it('picks up geoprivacy an observer added after the occurrence was created', async () => {
        const updateById = captureUpdate()

        await OccurrenceService.updateOccurrenceFromObservation(
            existingOccurrence,
            { uri: existingOccurrence[fieldNames.iNaturalistUrl], geoprivacy: 'obscured' },
            {}
        )

        const [, updateDocument] = updateById.mock.calls[0] as [unknown, Record<string, string>]
        expect(updateDocument[fieldNames.geoprivacy]).toBe('obscured')
        expect(updateDocument[fieldNames.errorFlags].split(';')).toContain(fieldNames.geoprivacy)
    })

    it('withdraws coordinates when an observer revokes access', async () => {
        const updateById = captureUpdate()

        // The occurrence holds true coordinates granted earlier; the observation now
        // comes back obscured with no private_geojson, meaning access is gone
        await OccurrenceService.updateOccurrenceFromObservation(
            {
                ...existingOccurrence,
                [fieldNames.latitude]: '44.6252',
                [fieldNames.longitude]: '-122.7695',
                [fieldNames.coordinateSource]: coordinateSources.private
            },
            {
                uri: existingOccurrence[fieldNames.iNaturalistUrl],
                geoprivacy: 'obscured',
                geojson: obscuredObservation.geojson,
                place_guess: obscuredObservation.place_guess
            },
            {}
        )

        const [, updateDocument] = updateById.mock.calls[0] as [unknown, Record<string, string>]
        // Coordinates we may no longer hold are cleared rather than replaced by the
        // obscured ones, and the clearing is total -- a locality or elevation left
        // behind would still describe a location this record no longer has
        expect(updateDocument[fieldNames.latitude]).toBe('')
        expect(updateDocument[fieldNames.longitude]).toBe('')
        expect(updateDocument[fieldNames.locality]).toBe('')
        expect(updateDocument[fieldNames.elevation]).toBe('')
        expect(updateDocument[fieldNames.coordinateSource]).toBe('')
        // The record says why it has no location, and cannot reach another label
        expect(updateDocument[fieldNames.errorFlags].split(';')).toContain(fieldNames.geoprivacy)
        expect(OccurrenceService.hasBlockingErrorFlags(updateDocument)).toBe(true)
    })

    it('takes up the true coordinates when an observer grants access', async () => {
        const updateById = captureUpdate()

        await OccurrenceService.updateOccurrenceFromObservation(
            {
                ...existingOccurrence,
                [fieldNames.latitude]: '44.7491',
                [fieldNames.longitude]: '-122.7652',
                [fieldNames.geoprivacy]: 'obscured',
                [fieldNames.coordinateSource]: coordinateSources.public
            },
            { uri: existingOccurrence[fieldNames.iNaturalistUrl], ...obscuredObservation },
            {}
        )

        const [, updateDocument] = updateById.mock.calls[0] as [unknown, Record<string, string>]
        expect(updateDocument[fieldNames.latitude]).toBe('44.6252')
        expect(updateDocument[fieldNames.coordinateSource]).toBe(coordinateSources.private)
        expect(updateDocument[fieldNames.errorFlags].split(';')).not.toContain(fieldNames.geoprivacy)
    })

    it('leaves records predating coordinateSource alone', async () => {
        const updateById = captureUpdate()

        // 380k occurrences carry no coordinateSource. Re-pulling must not rewrite
        // their locations wholesale -- only flag them, if the observation says so.
        await OccurrenceService.updateOccurrenceFromObservation(
            existingOccurrence,
            {
                uri: existingOccurrence[fieldNames.iNaturalistUrl],
                geojson: obscuredObservation.geojson,
                place_guess: obscuredObservation.place_guess
            },
            {}
        )

        const [, updateDocument] = updateById.mock.calls[0] as [unknown, Record<string, string>]
        expect(updateDocument[fieldNames.latitude]).toBe('44.5646')
        expect(updateDocument[fieldNames.locality]).toBe('Corvallis')
    })

    it('clears geoprivacy an observer has since removed', async () => {
        const updateById = captureUpdate()

        await OccurrenceService.updateOccurrenceFromObservation(
            { ...existingOccurrence, [fieldNames.geoprivacy]: 'obscured' },
            { uri: existingOccurrence[fieldNames.iNaturalistUrl] },
            {}
        )

        const [, updateDocument] = updateById.mock.calls[0] as [unknown, Record<string, string>]
        expect(updateDocument[fieldNames.geoprivacy]).toBe('')
        expect(updateDocument[fieldNames.errorFlags].split(';')).not.toContain(fieldNames.geoprivacy)
    })

    it('keeps the stored locality when the observation has no place guess at all', async () => {
        const updateById = captureUpdate()

        // Gaining access to the true coordinates runs the location block. This
        // observation carries no place guess of either kind, and
        // parseLocalityFromPlaceGuess turns that into bare quote characters, which
        // are truthy -- so an unguarded fallback overwrites a good stored locality
        // with punctuation. The elevation is supplied so no GeoTIFF is read.
        await OccurrenceService.updateOccurrenceFromObservation(
            existingOccurrence,
            {
                uri: existingOccurrence[fieldNames.iNaturalistUrl],
                geoprivacy: 'obscured',
                private_geojson: { type: 'Point', coordinates: [ -123.0, 44.0 ] }
            },
            { '44.0000,-123.0000': '100' }
        )

        const [, updateDocument] = updateById.mock.calls[0] as [unknown, Record<string, string>]
        expect(updateDocument[fieldNames.coordinateSource]).toBe(coordinateSources.private)
        expect(updateDocument[fieldNames.locality]).toBe('Corvallis')
    })

    it('picks up taxon_geoprivacy iNaturalist applied on its own', async () => {
        const updateById = captureUpdate()

        await OccurrenceService.updateOccurrenceFromObservation(
            existingOccurrence,
            { uri: existingOccurrence[fieldNames.iNaturalistUrl], taxon_geoprivacy: 'obscured' },
            {}
        )

        const [, updateDocument] = updateById.mock.calls[0] as [unknown, Record<string, string>]
        expect(updateDocument[fieldNames.taxon_geoprivacy]).toBe('obscured')
        expect(updateDocument[fieldNames.errorFlags].split(';')).toContain(fieldNames.taxon_geoprivacy)
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

    it('does not flag an observer-obscured record whose private coordinates we hold', () => {
        // Only observer geoprivacy can reach coordinateSource 'private': a
        // taxon-obscured record keeps the public location, so it keeps its flag
        // and stays off printed labels.
        const flags = flagsOf({
            ...validOccurrence,
            [fieldNames.geoprivacy]: 'obscured',
            [fieldNames.coordinateSource]: coordinateSources.private
        })

        expect(flags).not.toContain(fieldNames.geoprivacy)
    })

    it('flags a taxon-obscured record even if it claims private coordinates', () => {
        // An occurrence built from an observation cannot reach this state, but an
        // uploaded CSV supplies its own coordinateSource. A record obscured to
        // protect a species must not become printable because a spreadsheet said so.
        const flags = flagsOf({
            ...validOccurrence,
            [fieldNames.taxon_geoprivacy]: 'obscured',
            [fieldNames.coordinateSource]: coordinateSources.private
        })

        expect(flags).toContain(fieldNames.taxon_geoprivacy)
    })

    it('checks every locality it is given, whatever its source', () => {
        // #42 held these checks back for obscured records, whose locality was
        // iNaturalist's coarse place guess rather than anything the observer could
        // fix. There is no such locality left to protect: a withheld location now
        // stores none at all, so a locality in the field describes the true place
        // whichever source it came from, and faces the ordinary rules -- here, a
        // comma.
        for (const source of [ coordinateSources.private, coordinateSources.public ]) {
            const flags = flagsOf({
                ...validOccurrence,
                [fieldNames.geoprivacy]: 'obscured',
                [fieldNames.coordinateSource]: source,
                [fieldNames.locality]: 'Corvallis, OR'
            })

            expect(flags).toContain(fieldNames.locality)
        }
    })

    it('keeps a record whose location was withheld off a label', () => {
        // The point of the whole exercise, and it turns on the empty location
        // rather than on the geoprivacy: the flags that stop it are the missing
        // coordinate fields.
        const withheld = OccurrenceService.updateErrorFlags({
            ...validOccurrence,
            [fieldNames.geoprivacy]: 'obscured',
            [fieldNames.latitude]: '',
            [fieldNames.longitude]: '',
            [fieldNames.locality]: ''
        })

        expect(withheld[fieldNames.errorFlags].split(';')).toEqual(
            expect.arrayContaining([fieldNames.latitude, fieldNames.longitude, fieldNames.locality])
        )
        expect(OccurrenceService.hasBlockingErrorFlags(withheld)).toBe(true)
    })
})
