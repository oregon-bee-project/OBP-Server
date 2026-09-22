import Crypto from 'node:crypto'

import { OccurrenceRepository } from '../repositories/index.js'
import { fieldNames, template, nonEmptyFields, markerFields, ofvs, abbreviations, determinations, requiredFields, coordinateSources } from '../utils/constants.js'
import { includesIllegalSuffix, getDayOfYear, getOFV } from '../utils/utilities.js'
import ElevationService from './ElevationService.js'
import PlacesService from './PlacesService.js'
import PlantTaxaService from './PlantTaxaService.js'
import UsernamesService from './UsernamesService.js'
import FileManager from '../utils/FileManager.js'


class OccurrenceService {
    constructor() {
        this.repository = new OccurrenceRepository()
    }

    /* Helper Methods */
    
    /*
     * updateErrorFlags()
     * Checks a given occurrence for errors and updates the errorFlags field
     */
    updateErrorFlags(occurrence) {
        const updatedOccurrence = { ...occurrence }

        // A list of fields to flag in addition to the non-empty fields
        let errorFields = []

        // Flag a record whose true location was withheld from us. For a new record
        //  this says why its coordinate fields are empty -- getObservationLocation
        //  stores no obscured point -- and it is what the geoprivacy email list is
        //  built from. It is not what keeps a record off a label; hasTrueLocation is.
        const usingPrivateCoordinates = updatedOccurrence[fieldNames.coordinateSource] === coordinateSources.private
        if (!usingPrivateCoordinates && updatedOccurrence[fieldNames.geoprivacy]) {
            errorFields.push(fieldNames.geoprivacy)
        }
        // Taxon geoprivacy flags whether or not we hold the true coordinates, because
        //  it is not about what we hold: it marks a record whose location must be
        //  coarsened on its way out to another system, and taxonomists work from it.
        if (updatedOccurrence[fieldNames.taxon_geoprivacy]) {
            errorFields.push(fieldNames.taxon_geoprivacy)
        }

        // Flag country and state if they are too long (unabbreviated)
        if (updatedOccurrence[fieldNames.country]?.length > 3) { errorFields.push(fieldNames.country) }
        if (updatedOccurrence[fieldNames.stateProvince]?.length > 2) { errorFields.push(fieldNames.stateProvince) }

        // Flag locality if it has one of the following:
        //  Has a street/county suffix; Has illegal characters; Is too long
        // Every stored locality now describes the true location -- a withheld one
        //  leaves the field empty, which nonEmptyFields already flags -- so there is
        //  no longer a coarse locality to hold these checks back for.
        if (
            includesIllegalSuffix(updatedOccurrence[fieldNames.locality])
            || /[,"]/.test(updatedOccurrence[fieldNames.locality])
            || updatedOccurrence[fieldNames.locality]?.length > 18
        ) {
            errorFields.push(fieldNames.locality)
        }

        // Flag accuracy if it is greater than 250 meters
        if (parseInt(updatedOccurrence[fieldNames.accuracy]) > 250) { errorFields.push(fieldNames.accuracy) }    

        // Flag plantPhylum if it is defined but is not 'tracheophyta'
        if (!!updatedOccurrence[fieldNames.plantPhylum] && updatedOccurrence[fieldNames.plantPhylum]?.toLowerCase() !== 'tracheophyta') {
            errorFields.push(fieldNames.plantPhylum)
        }

        // Set errorFlags as a semicolon-separated list of fields (non-empty fields and additional flags)
        updatedOccurrence[fieldNames.errorFlags] = nonEmptyFields.filter((field) => !updatedOccurrence[field]).concat(errorFields).join(';')

        return updatedOccurrence
    }

    /*
     * getObservationLocation()
     * Returns the true location fields of an observation, or empty ones where its true
     *  location was withheld from us
     */
    getObservationLocation(observation) {
        // iNaturalist never substitutes the true coordinates into the public
        //  fields: for an obscured record, `geojson` is a point shifted by up to
        //  ~27km and the real one arrives alongside it as `private_geojson`,
        //  present only when we have been granted access.
        //
        // An occurrence holds the true location or none at all. The shifted point
        //  is not a coarser version of the location, it is a different place, and
        //  stored it is indistinguishable from a real one -- on a label, in the
        //  occurrences CSV, and in anything exported onward. So where the true
        //  point was withheld we record no location, and the empty coordinate
        //  fields keep the record off labels on their own.
        const granted = !!observation?.private_geojson
        const obscured = !!observation?.geoprivacy || !!observation?.taxon_geoprivacy

        if (obscured && !granted) {
            return { latitude: '', longitude: '', locality: '', placeIds: [], coordinateSource: '' }
        }

        // Every field comes from the same side as the coordinates. An observation
        //  can carry a private point and no private place guess, and the public
        //  guess is then a description of the *other* point -- falling back to it
        //  would put a locality and a county in the record that do not belong to
        //  the coordinates beside them. Better to have no locality: an empty one
        //  is flagged, and a wrong one is not.
        const geojson = granted ? observation?.private_geojson : observation?.geojson
        const placeGuess = granted ? observation?.private_place_guess : observation?.place_guess
        const placeIds = (granted ? observation?.private_place_ids : observation?.place_ids) ?? []

        return {
            latitude: geojson?.coordinates?.at(1)?.toFixed(4)?.toString() ?? '',
            longitude: geojson?.coordinates?.at(0)?.toFixed(4)?.toString() ?? '',
            // parseLocalityFromPlaceGuess turns a missing place guess into bare
            //  quote characters, which are truthy and would read as a locality
            locality: placeGuess ? this.parseLocalityFromPlaceGuess(placeGuess) : '',
            placeIds: placeIds,
            // Left empty when there are no coordinates at all, so that a record
            //  we simply have no location for is not labelled as public
            coordinateSource: geojson
                ? (granted ? coordinateSources.private : coordinateSources.public)
                : ''
        }
    }

    /*
     * hasBlockingErrorFlags()
     * Returns whether an occurrence carries an error flag on any field that a printed label depends on
     */
    hasBlockingErrorFlags(occurrence) {
        const flags = occurrence?.[fieldNames.errorFlags]?.split(';') ?? []

        return requiredFields.some((field) => flags.includes(field))
    }

    /*
     * hasTrueLocation()
     * Returns whether an occurrence's coordinates are known to be the true ones: either
     *  nothing obscured the record, or we hold the private point
     */
    hasTrueLocation(occurrence) {
        // Decided from provenance, not from whether the coordinate fields are empty.
        //  New records never store an obscured point, but plenty of stored ones do,
        //  and nothing guarantees they have been cleared: a refresh only reaches the
        //  occurrences a task selects, and one saved before coordinateSource existed
        //  keeps its obscured point even through a refresh. Its coordinates look like
        //  anyone else's, so only its privacy fields can keep it off a label.
        const obscured = !!occurrence?.[fieldNames.geoprivacy] || !!occurrence?.[fieldNames.taxon_geoprivacy]

        return !obscured || occurrence?.[fieldNames.coordinateSource] === coordinateSources.private
    }

    /*
     * isPrintable()
     * Returns whether an occurrence can go on a label; getPrintableOccurrences and
     *  getUnprintableOccurrences both answer through this, so they cannot disagree
     */
    isPrintable(occurrence) {
        return !this.hasBlockingErrorFlags(occurrence) && this.hasTrueLocation(occurrence)
    }

    /*
     * hasDefectErrorFlags()
     * Returns whether an occurrence carries an error flag that reports a fault, as opposed
     *  to one that only marks the record for whoever handles it later
     */
    hasDefectErrorFlags(occurrence) {
        const flags = occurrence?.[fieldNames.errorFlags]?.split(';')?.filter(Boolean) ?? []

        return flags.some((flag) => !markerFields.includes(flag))
    }

    /*
     * generateOccurrenceId()
     * Creates a unique key string for a given formatted occurrence
     */
    generateOccurrenceId(occurrence) {
        // Uniquely identify an occurrence with sample ID, specimen ID, day, month, year, and iNaturalist URL
        // If there is no URL, use first name and last name too.
        const keyFields = [fieldNames.sampleId, fieldNames.specimenId, fieldNames.day, fieldNames.month, fieldNames.year, fieldNames.iNaturalistUrl]
        if (!occurrence[fieldNames.iNaturalistUrl]) {
            keyFields.push(fieldNames.firstName)
            keyFields.push(fieldNames.lastName)
        }

        // Get a list of the corresponding values for the key fields
        const keyValues = keyFields.map((field) => String(occurrence[field] || ''))

        // Combine and hash the key values into a single unique key string
        const compositeKey = Crypto.createHash('sha256')
            .update(keyValues.join(','))
            .digest('hex')
        
        return compositeKey
    }

    /*
     * formatOccurrence()
     * Applies basic formatting to an occurrence
     */
    formatOccurrence(occurrence) {
        // The final field set should be a union of the standard template and the given row
        // The given row's values will overwrite the template's values
        let formattedOccurrence = Object.assign({}, template, occurrence)

        // Fill occurrenceId and resourceId if state is 'OR' and fieldNumber is defined
        if (formattedOccurrence[fieldNames.fieldNumber] && formattedOccurrence[fieldNames.stateProvince] === 'OR') {
            formattedOccurrence[fieldNames.occurrenceId] ||= `https://osac.oregonstate.edu/OBS/OBA_${formattedOccurrence[fieldNames.fieldNumber]}`
            formattedOccurrence[fieldNames.resourceId] ||= formattedOccurrence[fieldNames.occurrenceId]
        }

        // Fill recordedBy if empty
        const firstName = formattedOccurrence[fieldNames.firstName] ?? ''
        const lastName = formattedOccurrence[fieldNames.lastName] ?? ''
        formattedOccurrence[fieldNames.recordedBy] ||= `${firstName}${(firstName && lastName) ? ' ' : ''}${lastName}`

        // Set verbatimDate to default formatting
        formattedOccurrence[fieldNames.verbatimDate] = formattedOccurrence[fieldNames.day] && formattedOccurrence[fieldNames.month] && formattedOccurrence[fieldNames.year]
            ? `${formattedOccurrence[fieldNames.month]}/${formattedOccurrence[fieldNames.day]}/${formattedOccurrence[fieldNames.year]}`
            : ''

        // Fill startDayOfYear and endDayOfYear if day2, month2, and year2 are defined
        // Overwrite verbatimDate with two-date format
        if (!!formattedOccurrence[fieldNames.day2] && !!formattedOccurrence[fieldNames.month2] && !!formattedOccurrence[fieldNames.year2]) {
            const day1 = parseInt(formattedOccurrence[fieldNames.day])
            // Convert month to its index (subtract 1)
            const month1Index = parseInt(formattedOccurrence[fieldNames.month]) - 1
            const year1 = parseInt(formattedOccurrence[fieldNames.year])
            // Set the time to noon to avoid timezone errors
            const date1 = new Date(year1, month1Index, day1, 12)

            formattedOccurrence[fieldNames.startDayOfYear] = getDayOfYear(date1)?.toString() ?? ''

            const day2 = parseInt(formattedOccurrence[fieldNames.day2])
            // Convert month to its index (subtract 1)
            const month2Index = parseInt(formattedOccurrence[fieldNames.month2]) - 1
            const year2 = parseInt(formattedOccurrence[fieldNames.year2])
            // Set the time to noon to avoid timezone errors
            const date2 = new Date(year2, month2Index, day2, 12)

            formattedOccurrence[fieldNames.endDayOfYear] = getDayOfYear(date2)?.toString() ?? ''

            formattedOccurrence[fieldNames.verbatimDate] = `${formattedOccurrence[fieldNames.year]}-${formattedOccurrence[fieldNames.month]}-${formattedOccurrence[fieldNames.day]}/${formattedOccurrence[fieldNames.year2]}-${formattedOccurrence[fieldNames.month2]}-${formattedOccurrence[fieldNames.day2]}`
        }

        // Enforce county abbreviations
        const county = formattedOccurrence[fieldNames.county] ?? ''
        formattedOccurrence[fieldNames.county] = abbreviations.counties[county] ?? county

        // Enforce 4-decimal-point latitude and longitude
        const latitude = parseFloat(formattedOccurrence[fieldNames.latitude])
        const longitude = parseFloat(formattedOccurrence[fieldNames.longitude])
        formattedOccurrence[fieldNames.latitude] = !isNaN(latitude) ? latitude.toFixed(4).toString() : formattedOccurrence[fieldNames.latitude]
        formattedOccurrence[fieldNames.longitude] = !isNaN(longitude) ? longitude.toFixed(4).toString() : formattedOccurrence[fieldNames.longitude]

        // Set error flags
        formattedOccurrence = this.updateErrorFlags(formattedOccurrence)

        // Generate a unique ID for the occurrence and add it as the _id field
        formattedOccurrence._id = this.generateOccurrenceId(formattedOccurrence)

        return formattedOccurrence
    }

    /* Main Methods */

    /*
     * createOccurrence
     * Inserts a single occurrence into the database with optional formatting
     */
    async createOccurrence(document, options = { skipFormatting: false, scratch: false }) {
        const {
            skipFormatting = false,
            scratch = false
        } = options

        // Return object containing information about inserted and duplicate occurrences
        const results = {
            insertedCount: 0,
            insertedIds: [],
            duplicates: []
        }

        // Apply formatting (unless skipped)
        const occurrence = skipFormatting ? document : this.formatOccurrence(document)

        // Return if no document was provided
        if (!occurrence) return results

        // Set scratch space flag
        occurrence.scratch = scratch

        // Check if a occurrence with the same _id already exists; insert the occurrence if not
        const existing = await this.repository.findById(occurrence._id)
        if (existing) {
            results.duplicates.push(occurrence)
        } else {
            const response = await this.repository.create(occurrence)
            results.insertedCount = 1
            results.insertedIds = response
        }

        return results
    }

    /*
     * createOccurrences()
     * Inserts multiple occurrences into the database with optional formatting
     */
    async createOccurrences(documents, options = { skipFormatting: false, scratch: false }) {
        const {
            skipFormatting = false,
            scratch = false
        } = options

        // Return object containing information about inserted and duplicate occurrences
        const results = {
            insertedCount: 0,
            insertedIds: [],
            duplicates: []
        }

        // Apply formatting (unless skipped)
        const occurrences = skipFormatting ? documents : documents?.map((doc) => this.formatOccurrence(doc))

        // Return if no documents were provided
        if (!occurrences || occurrences.length === 0) return results

        // Set scratch space flags
        for (const occurrence of occurrences) {
            occurrence.scratch = scratch
        }

        try {
            const response = await this.repository.createMany(occurrences)

            results.insertedCount = Object.values(response).length
            results.insertedIds = Object.values(response)
        } catch (error) {
            if (error.name === 'MongoBulkWriteError') {
                // Capture successfully inserted occurrence data
                if (error.result && error.result.insertedCount) {
                    results.insertedCount = error.result.insertedCount
                    results.insertedIds = Object.values(error.result.insertedIds)
                }

                // Capture duplicate data
                error.writeErrors?.forEach((writeError) => {
                    if (writeError.code === 11000 && writeError.err?.op) {  // Mongo Server E11000 duplicate key error
                        results.duplicates.push(writeError.err.op)
                    } else {
                        console.error(writeError)
                    }
                })
            } else {
                throw error
            }
        }

        return results
    }

    /*
     * createOccurrencesFromFile()
     * Reads a given occurrences file chunk-by-chunk and inserts formatted occurrences for each entry
     */
    async createOccurrencesFromFile(filePath, options = { skipFormatting: false, scratch: false }, updateProgress = null) {
        const {
            skipFormatting = false,
            scratch = false
        } = options
        
        // Return object containing information about inserted and duplicate occurrences
        const results = {
            insertedCount: 0,
            insertedIds: [],
            duplicates: []
        }

        const chunkSize = 5000
        for await (const chunk of FileManager.readCSVChunks(filePath, chunkSize, updateProgress)) {
            const chunkResults = await this.createOccurrences(chunk, { skipFormatting, scratch })
            
            // Add the results for this chunk to the running total
            results.insertedCount += chunkResults.insertedCount
            results.insertedIds = results.insertedIds.concat(chunkResults.insertedIds)
            results.duplicates = results.duplicates.concat(chunkResults.duplicates)
        }

        return results
    }

    /*
     * parseLocalityFromPlaceGuess()
     * Returns a formatted locality from a iNaturalist observation's 
     *  place_guess field if it's valid, or the whole place_guess field
     *  surrounded in quotes if it's invalid
     */
    parseLocalityFromPlaceGuess(place_guess) {
        const splitGuess = place_guess ?.split(/,\s*/)
        const locality = splitGuess?.length === 3 
            ? splitGuess?.at(0).trim()
            : `"${place_guess?.trim() ?? ''}""`
        return locality
    }

    /*
     * createOccurrenceFromObservation()
     * Creates a formatted occurrence from an iNaturalist observation (and place, taxonomy, elevation, and user data); does not insert the occurrence
     */
    createOccurrenceFromObservation(observation, elevations, scratch = false) {
        // Return if no observation is provided
        if (!observation) return

        // Start from the template occurrence object
        let occurrence = Object.assign({}, template)

        // Tag this occurrence as new
        occurrence.new = true
        // Set scratch space flag
        occurrence.scratch = scratch

        /* Constants */

        // Parse user's name
        let { firstName, firstNameInitial, lastName } = UsernamesService.getUserName(observation.user?.login)

        // Look up the plant ancestry and format it
        const plantAncestry = PlantTaxaService.getPlantAncestry(observation.taxon)

        // Read the location, preferring the observation's private coordinates when we have them
        const location = this.getObservationLocation(observation)

        // Parse country, state/province, and county
        const { country, stateProvince, county } =  PlacesService.getPlaceNames(location.placeIds)

        /* Formatted fields as constants */

        // Find the observation field values (OFVs) for sampleId and number of bees collected (which will become specimenId)
        const rawSampleId = getOFV(observation.ofvs, ofvs.sampleId)
        const rawSpecimenId = getOFV(observation.ofvs, ofvs.beesCollected)
        const sampleId = !isNaN(parseInt(rawSampleId)) ? parseInt(rawSampleId).toString() : ''
        const specimenId = !isNaN(parseInt(rawSpecimenId)) ? parseInt(rawSpecimenId).toString() : ''

        // Attempt to parse observed_on as a JavaScript Date object
        const observedDate = observation.observed_on ? new Date(observation.observed_on) : undefined

        // Extract the day, month, and year from the Date object
        const observedDay = observedDate?.getUTCDate()
        const observedMonth = observedDate?.getUTCMonth() + 1
        const observedYear = observedDate?.getUTCFullYear()

        // Format the day, month, and year
        const formattedDay = !isNaN(observedDay) ? observedDay.toString() : ''
        const formattedMonth = !isNaN(observedMonth) ? observedMonth.toString() : ''
        const formattedYear = !isNaN(observedYear) ? observedYear.toString() : ''
        
        const formattedLocality = location.locality

        // Format the coordinates
        const formattedLatitude = location.latitude
        const formattedLongitude = location.longitude

        /* Final formatting */

        occurrence[fieldNames.iNaturalistId] = observation.user?.id?.toString() ?? ''
        occurrence[fieldNames.iNaturalistAlias] = observation.user?.login ?? ''

        if (observation.user?.login === 'pandg' && observedYear >= 2021) {
            if (parseInt(sampleId) > 100) {
                firstName = 'Gretchen'
                firstNameInitial = 'G.'
            } else if (parseInt(sampleId) <= 100) {
                firstName = 'Robert'
                firstNameInitial = 'R.'
            }
        }

        occurrence[fieldNames.firstName] = firstName
        occurrence[fieldNames.firstNameInitial] = firstNameInitial
        occurrence[fieldNames.lastName] = lastName
        occurrence[fieldNames.recordedBy] = `${firstName}${(firstName && lastName) ? ' ' : ''}${lastName}`

        occurrence[fieldNames.sampleId] = sampleId
        occurrence[fieldNames.specimenId] = specimenId

        occurrence[fieldNames.day] = formattedDay
        occurrence[fieldNames.month] = formattedMonth
        occurrence[fieldNames.year] = formattedYear
        occurrence[fieldNames.verbatimDate] =  formattedDay && formattedMonth && formattedYear ? `${formattedMonth}/${formattedDay}/${formattedYear}` : ''
        
        occurrence[fieldNames.country] = abbreviations.countries[country] ?? country
        occurrence[fieldNames.stateProvince] = abbreviations.stateProvinces[stateProvince] ?? stateProvince
        occurrence[fieldNames.county] = county
        occurrence[fieldNames.locality] = formattedLocality

        const coordinate = `${formattedLatitude},${formattedLongitude}`
        occurrence[fieldNames.elevation] = elevations[coordinate] || ''

        occurrence[fieldNames.latitude] = formattedLatitude
        occurrence[fieldNames.longitude] = formattedLongitude
        occurrence[fieldNames.accuracy] = observation.positional_accuracy?.toString() ?? ''
        // Record which coordinate we used. positional_accuracy describes the true
        //  location even when the public coordinates are obscured, so without this
        //  an obscured record looks as precise as any other.
        occurrence[fieldNames.coordinateSource] = location.coordinateSource

        occurrence[fieldNames.samplingProtocol] = 'aerial net'

        occurrence[fieldNames.resourceRelationship] = 'visits flowers of'
        occurrence[fieldNames.relatedResourceId] = observation.uuid

        occurrence[fieldNames.plantPhylum] = plantAncestry.phylum
        occurrence[fieldNames.plantOrder] = plantAncestry.order
        occurrence[fieldNames.plantFamily] = plantAncestry.family
        occurrence[fieldNames.plantGenus] = plantAncestry.genus
        occurrence[fieldNames.plantSpecies] = plantAncestry.species

        // As a fallback, search the plant ancestry upward for the first truthy rank
        const minRank = ['species', 'genus', 'family', 'order', 'phylum'].find((rank) => !!plantAncestry[rank])
        occurrence[fieldNames.plantTaxonRank] = observation.taxon?.rank || minRank || ''

        occurrence[fieldNames.iNaturalistUrl] = observation.uri ?? ''
        occurrence[fieldNames.geoprivacy] = observation.geoprivacy ?? ''
        occurrence[fieldNames.taxon_geoprivacy] = observation.taxon_geoprivacy ?? ''

        // Set error flags
        occurrence = this.updateErrorFlags(occurrence)

        return occurrence
    }

    /*
     * upsertOccurrence()
     * Inserts or updates an occurrence
     */
    async upsertOccurrence(document, options = { skipFormatting: false, scratch: false }) {
        const {
            skipFormatting = false,
            scratch = false
        } = options

        // Return object containing information about updated and inserted occurrences
        const results = {
            modifiedCount: 0,
            upsertedCount: 0,
            upsertedIds: [],
            matchedCount: 0
        }

        let update = document
        if (!skipFormatting) {
            // Limit update fields to those initially provided (and only occurrence template fields)
            const initialFields = Object.keys(document).filter((field) => field in template)
            const occurrence = this.formatOccurrence(document)

            // Build an update document containing only the initial occurrence fields with the formatted values; always include _id
            update = { _id: occurrence._id }
            initialFields.forEach((field) => update[field] = occurrence[field])
        }

        // Return if no document was provided
        if (!update) return results

        // Set scratch space flag
        update.scratch = scratch

        try {
            const upsertResults = await this.repository.updateById(update._id, update, { upsert: true })

            if (upsertResults) {
                results.modifiedCount = upsertResults.modifiedCount
                results.upsertedCount = upsertResults.upsertedCount
                results.upsertedIds.push(upsertResults.upsertedId)
                results.matchedCount = upsertResults.matchedCount
            }
        } catch (error) {
            console.error('Error while upserting occurrence:', document)
            console.error(error)
        }

        return results
    }

    /*
     * upsertOccurrences()
     * Inserts or updates multiple occurrences
     */
    async upsertOccurrences(documents, options = { skipFormatting: false, scratch: false }) {
        const {
            skipFormatting = false,
            scratch = false
        } = options

        // Return object containing information about updated and inserted occurrences
        const results = {
            modifiedCount: 0,
            upsertedCount: 0,
            upsertedIds: [],
            matchedCount: 0
        }

        // Apply formatting (unless skipped)
        let updates = documents
        if (!skipFormatting) {
            updates = documents?.map((document) => {
                // Limit update fields to those initially provided (and only occurrence template fields)
                const initialFields = Object.keys(document).filter((field) => field in template)
                const occurrence = this.formatOccurrence(document)

                // Build an update document containing only the initial occurrence fields with the formatted values; always include _id
                const updateDocument = { _id: occurrence._id }
                initialFields.forEach((field) => updateDocument[field] = occurrence[field])

                return updateDocument
            })
        }

        // Return if no documents were provided
        if (!updates || updates.length === 0) return results

        for (const update of updates) {
            const upsertResults = await this.upsertOccurrence(update, { skipFormatting: true, scratch })

            results.modifiedCount += upsertResults.modifiedCount
            results.upsertedCount += upsertResults.upsertedCount
            results.upsertedIds = results.upsertedIds.concat(upsertResults.upsertedIds)
            results.matchedCount += upsertResults.matchedCount
        }

        return results
    }

    /*
     * upsertOccurrencesFromFile()
     * Inserts or updates occurrences data from a given file path into the database
     */
    async upsertOccurrencesFromFile(filePath, options = { skipFormatting: false, scratch: false }) {
        const {
            skipFormatting = false,
            scratch = false
        } = options        

        // Return object containing information about updated and inserted occurrences
        const results = {
            modifiedCount: 0,
            upsertedCount: 0,
            upsertedIds: [],
            matchedCount: 0
        }

        const chunkSize = 5000
        for await (const chunk of FileManager.readCSVChunks(filePath, chunkSize)) {
            const chunkResults = await this.upsertOccurrences(chunk, { skipFormatting, scratch })

            results.modifiedCount += chunkResults.modifiedCount
            results.upsertedCount += chunkResults.upsertedCount
            results.upsertedIds = results.upsertedIds.concat(chunkResults.upsertedIds)
            results.matchedCount += chunkResults.matchedCount
        }

        return results
    }

    async getOccurrences(filter = {}, options = {}) {
        return await this.repository.findMany(filter, options, { 'composite_sort': 1 })
    }

    async getOccurrencesPage(options = {}) {
        const {
            sortConfig = [ { field: 'composite_sort', direction: 1, type: 'string' } ]
        } = options
        
        return await this.repository.paginate({ ...options, sortConfig })
    }

    /*
     * getUnindexedOccurrencesPage()
     * Returns a page of occurrences with empty errorFlags and fieldNumber fields
     */
    async getUnindexedOccurrencesPage(options = {}) {
        const {
            scratch = false
        } = options

        // Query occurrences with no fieldNumber and no error flag reporting a fault.
        // The marker flags are skipped here rather than everywhere downstream: a
        // taxon-obscured record is sound, and refusing it a field number would keep
        // its specimen off labels forever. This is hasDefectErrorFlags in the database.
        const filter = {
            scratch: scratch,
            [fieldNames.errorFlags]: { $exists: true },
            [fieldNames.fieldNumber]: { $exists: true, $in: [ null, '' ] },
            $expr: {
                $eq: [
                    {
                        $size: {
                            $setDifference: [
                                { $split: [ { $ifNull: [ `$${fieldNames.errorFlags}`, '' ] }, ';' ] },
                                [ '', ...markerFields ]
                            ]
                        }
                    },
                    0
                ]
            }
        }
        const sortConfig = [ { field: 'composite_sort', direction: 1, type: 'string' } ]
        return await this.repository.paginate({ ...options, filter, sortConfig })
    }

    /*
     * getPrintableOccurrences()
     * Returns occurrences that have every required field, no error flag on a field a label depends on, and a location known to be true; optional filtering by a list of userLogins, scratch space, and dateLabelPrint
     */
    async getPrintableOccurrences(options = { userLogins: [], scratch: false, ignoreDateLabelPrint: false }) {
        const {
            userLogins = [],
            scratch = false,
            ignoreDateLabelPrint = false
        } = options

        // At minimum, query occurrences with the given scratch value
        const filter = {
            scratch: scratch
        }
        // If dateLabelPrint should not be ignored, query for unprinted
        if (!ignoreDateLabelPrint) {
            filter.$or = [
                { [fieldNames.dateLabelPrint]: { $exists: false } },
                { [fieldNames.dateLabelPrint]: { $in: [ null, '' ] } }
            ]
        }
        // If userLogins are given, filter by them
        if (userLogins.length > 0) filter[fieldNames.iNaturalistAlias] = { $in: userLogins }

        // Filter by occurrences with all required fields
        requiredFields.forEach((field) => filter[field] = { $exists: true, $nin: [ null, '' ] })
        const occurrences = await this.repository.findMany(filter, {}, { [fieldNames.recordedBy]: 1, [fieldNames.fieldNumber]: 1 })

        return occurrences.filter((occurrence) => this.isPrintable(occurrence))
    }

    /*
     * getUnprintableOccurrences()
     * Returns flagged occurrences that cannot go on a label; optional filtering by dateLabelPrint
     */
    async getUnprintableOccurrences(options = { scratch: false, ignoreDateLabelPrint: false }) {
        const {
            scratch = false,
            ignoreDateLabelPrint = false
        } = options

        // Query occurrences with the given scratch value and a nonempty errorFlags field
        // If a requiredField is missing, it will show up as a flag in errorFlags, and
        //  an occurrence without a true location always carries a privacy flag
        const filter = {
            scratch: scratch,
            [fieldNames.errorFlags]: { $exists: true, $nin: [ null, '' ] }
        }
        // If dateLabelPrint should not be ignored, query for unprinted
        if (!ignoreDateLabelPrint) {
            filter.$or = [
                { [fieldNames.dateLabelPrint]: { $exists: false } },
                { [fieldNames.dateLabelPrint]: { $in: [ null, '' ] } }
            ]
        }
        const occurrences = await this.repository.findMany(filter)

        return occurrences.filter((occurrence) => !this.isPrintable(occurrence))
    }

    /*
     * getErrorFlagsByUserLogins()
     * Returns a list of errorFlags values from the occurrences grouped by userLogin and filtered to a given list of userLogins
     */
    async getErrorFlagsByUserLogins(userLogins, options = { scratch: false }) {
        const {
            scratch = false
        } = options

        // Query occurrences with errorFlags and iNaturalistAliases in the given list of user logins
        // Group by iNaturalistAlias
        return await this.repository.aggregate([
            {
                $match: {
                    scratch: scratch,
                    [fieldNames.iNaturalistAlias]: { $in: userLogins },
                    [fieldNames.errorFlags]: { $exists: true, $nin: [ null, '' ] }
                }
            },
            {
                $group: {
                    _id: `$${fieldNames.iNaturalistAlias}`,
                    errorFlagsList: {
                        $push: `$${fieldNames.errorFlags}`
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    'userLogin': '$_id',
                    'errorFlagsList': 1
                }
            }
        ])
    }

    async getDistinctCoordinates(filter = {}) {
        return await this.repository.distinctCoordinates(filter)
    }

    async getDistinctUrls(filter = {}) {
        return await this.repository.distinct(fieldNames.iNaturalistUrl, filter)
    }

    async getMaxFieldNumber(filter = {}) {
        return await this.repository.maxFieldNumber(filter)
    }

    async getStateCollectorBeeCounts(filter = {}) {
        return await this.repository.stateCollectorBeeCounts(filter)
    }

    async getStateCollectorCountyCounts(filter = {}) {
        return await this.repository.stateCollectorCountyCounts(filter)
    }

    async getStateGenusBeeCounts(filter = {}) {
        return await this.repository.stateGenusBeeCounts(filter)
    }

    async count(filter = {}) {
        return await this.repository.count(filter)
    }

    async updateOccurrenceById(id, updateDocument) {
        return await this.repository.updateById(id, updateDocument)
    }

    async updateOccurrences(filter = {}, updateDocument) {
        return await this.repository.updateMany(filter, updateDocument)
    }

    async updateMatchingOccurrences(documents, options = { skipFormatting: false, scratch: false }) {
        const {
            skipFormatting = false,
            scratch = false
        } = options

        // Return object containing information about updated occurrences
        const results = {
            modifiedCount: 0,
            matchedCount: 0
        }

        // Apply formatting (unless skipped)
        let updates = documents
        if (!skipFormatting) {
            updates = documents?.map((document) => {
                // Limit update fields to those initially provided (and only occurrence template fields)
                const initialFields = Object.keys(document).filter((field) => field in template)
                const occurrence = this.formatOccurrence(document)

                // Build an update document containing only the initial occurrence fields with the formatted values; always include _id
                const updateDocument = { _id: occurrence._id }
                initialFields.forEach((field) => updateDocument[field] = occurrence[field])

                return updateDocument
            })
        }

        // Return if no documents were provided
        if (!updates || updates.length === 0) return modifiedCount

        for (const update of updates) {
            // Set scratch space flag
            update.scratch = scratch

            const response = this.repository.updateById(update._id, update)

            results.modifiedCount += response?.modifiedCount ?? 0
            results.matchedCount += response?.matchedCount ?? 0
        }

        return results
    }

    async updateMatchingOccurrencesFromFile(filePath, options = { skipFormatting: false, scratch: false }) {
        const {
            skipFormatting = false,
            scratch = false
        } = options

        // Return object containing information about updated occurrences
        const results = {
            modifiedCount: 0,
            matchedCount: 0
        }

        const chunkSize = 5000
        for await (const chunk of FileManager.readCSVChunks(filePath, chunkSize)) {
            const chunkResults = await this.updateMatchingOccurrences(chunk, { skipFormatting, scratch })

            results.modifiedCount += chunkResults.modifiedCount
            results.matchedCount += chunkResults.matchedCount
        }

        return results
    }

    async replaceOccurrenceById(id, document, options = { skipFormatting: false, scratch: false, upsert: false }) {
        const {
            skipFormatting = false,
            scratch = false,
            upsert = false
        } = options

        // Return object containing information about replaced and upserted occurrences
        const results = {
            modifiedCount: 0,
            upsertedCount: 0,
            upsertedIds: [],
            matchedCount: 0
        }

        // Apply formatting (unless skipped)
        const occurrence = skipFormatting ? document : this.formatOccurrence(document)

        // Return if no document was provided
        if (!occurrence) return results

        // Set scratch space flag
        occurrence.scratch = scratch

        const response = await this.repository.replaceById(id, occurrence, { upsert })

        if (response) {
            results.modifiedCount += response.modifiedCount ?? 0
            results.upsertedCount = response.upsertedId ? 1 : 0
            results.upsertedIds = response.upsertedId ? [ response.upsertedId ] : []
            results.matchedCount += response.matchedCount ?? 0
        }

        return results
    }

    async replaceOccurrences(documents, options = { skipFormatting: false, scratch: false, upsert: false }) {
        const {
            skipFormatting = false,
            scratch = false,
            upsert = false
        } = options

        // Return object containing information about replaced and upserted occurrences
        const results = {
            modifiedCount: 0,
            upsertedCount: 0,
            upsertedIds: [],
            matchedCount: 0
        }

        // Apply formatting (unless skipped)
        const occurrences = skipFormatting ? documents : documents?.map((doc) => this.formatOccurrence(doc))

        // Return if no documents were provided
        if (!occurrences || occurrences.length === 0) return results

        // Set scratch space flags
        for (const occurrence of occurrences) {
            const occurrenceResults = await this.replaceOccurrenceById(occurrence._id, occurrence, { skipFormatting: true, scratch, upsert })

            results.modifiedCount += occurrenceResults.modifiedCount
            results.upsertedCount += occurrenceResults.upsertedCount
            results.upsertedIds = results.upsertedIds.concat(occurrenceResults.upsertedIds)
            results.matchedCount += occurrenceResults.matchedCount
        }

        return results
    }

    async replaceOccurrencesFromFile(filePath, options = { skipFormatting: false, scratch: false, upsert: false }) {
        const {
            skipFormatting = false,
            scratch = false,
            upsert = false
        } = options

        // Return object containing information about replaced and upserted occurrences
        const results = {
            modifiedCount: 0,
            upsertedIds: [],
            matchedCount: 0
        }

        const chunkSize = 5000
        for await (const chunk of FileManager.readCSVChunks(filePath, chunkSize)) {
            const chunkResults = await this.replaceOccurrences(chunk, { skipFormatting, scratch, upsert })

            results.modifiedCount += chunkResults.modifiedCount
            results.upsertedCount += chunkResults.upsertedCount
            results.upsertedIds = results.upsertedIds.concat(chunkResults.upsertedIds)
            results.matchedCount += chunkResults.matchedCount
        }

        return results
    }

    /*
    * updateOccurrenceFromObservation()
    * Updates specific values (location, elevation, and taxonomy) in an existing occurrence from its corresponding iNaturalist observation
    */
    async updateOccurrenceFromObservation(occurrence, observation, elevations, 
        options = { overwriteValidLocations: false }) {
        const {
            overwriteValidLocations: overwriteValidLocations = false,
        } = options

        if (!occurrence) return

        let updateDocument = { ...occurrence }

        // Overwrite the current elevation at the current coordinates
        const coordinate = `${occurrence[fieldNames.latitude]},${occurrence[fieldNames.longitude]}`
        updateDocument[fieldNames.elevation] = elevations[coordinate] || ''

        // Runs the same rule as the create path: the true location, or none
        const newLocation = this.getObservationLocation(observation)

        // Access to an observation's true location moves in both directions: an
        //  observer can grant trust or withdraw it. Gaining it is what rewrites a
        //  location -- a record stuck on a worse one takes the better one.
        //
        //  Losing it rewrites nothing. A true location we recorded while we were
        //  entitled to it stays: it is where the specimen in the drawer was
        //  collected, the label already says so, and deleting it would not unsay
        //  anything. What the observer's change governs is what we publish, so the
        //  record keeps its geoprivacy value and is coarsened on the way out to
        //  another system, exactly as a taxon-obscured record is.
        const storedSource = occurrence[fieldNames.coordinateSource]
        // A record holding no coordinates at all takes whatever location becomes
        //  available. It has nothing to lose and no provenance to respect: either it
        //  was stored empty because the true point was withheld, or it never had one.
        const storedHasNoLocation = !occurrence[fieldNames.latitude] && !occurrence[fieldNames.longitude]
        const accessChanged = !!observation
            && newLocation.coordinateSource !== storedSource
            && (!!storedSource || storedHasNoLocation || newLocation.coordinateSource === coordinateSources.private)

        // Update the coordinate fields if overwriting
        // Treat an empty accuracy as perfect precision
        // An observation with no location to offer leaves the stored one alone --
        //  nothing true is replaced by nothing at all, whichever way access moved
        if ((overwriteValidLocations || accessChanged) && !!newLocation.coordinateSource) {
            const newLatitude = newLocation.latitude
            const newLongitude = newLocation.longitude
            const newCoordinate = `${newLatitude},${newLongitude}`
            const newAccuracy = observation?.positional_accuracy ?? ''

            updateDocument[fieldNames.elevation] = elevations[newCoordinate]
                || await ElevationService.getElevation(newLatitude, newLongitude) || ''
            updateDocument[fieldNames.latitude] = newLatitude
            updateDocument[fieldNames.longitude] = newLongitude
            updateDocument[fieldNames.accuracy] = newAccuracy.toString() || ''
            // A stored locality describes the point it was stored with, so it can only
            //  be kept when the coordinates are not moving to a different provenance.
            //  Where they are, an observation offering no place guess leaves the
            //  locality empty rather than letting the old one name the new point.
            const sameProvenance = newLocation.coordinateSource === storedSource
            updateDocument[fieldNames.locality] = newLocation.locality
                || (sameProvenance ? occurrence?.[fieldNames.locality] : '') || ''
            updateDocument[fieldNames.coordinateSource] = newLocation.coordinateSource
        }

        if (observation) {
            updateDocument[fieldNames.resourceRelationship] = 'visits flowers of'
            updateDocument[fieldNames.relatedResourceId] = observation.uuid

            // Refresh the privacy fields. Geoprivacy is not fixed at the moment we
            //  first see an observation: an observer can obscure a record long after
            //  we built an occurrence from it, and iNaturalist can obscure one on its
            //  own when a taxon's conservation status changes. Re-reading them here
            //  means the error flags below reflect the observation as it stands today.
            updateDocument[fieldNames.geoprivacy] = observation.geoprivacy ?? ''
            updateDocument[fieldNames.taxon_geoprivacy] = observation.taxon_geoprivacy ?? ''

            // Look up and update the plant taxonomy
            const plantTaxonomy = PlantTaxaService.getPlantAncestry(observation.taxon)
            updateDocument[fieldNames.plantPhylum] = plantTaxonomy.phylum
            updateDocument[fieldNames.plantOrder] = plantTaxonomy.order
            updateDocument[fieldNames.plantFamily] = plantTaxonomy.family
            updateDocument[fieldNames.plantGenus] = plantTaxonomy.genus
            updateDocument[fieldNames.plantSpecies] = plantTaxonomy.species

            // As a fallback, search the plant taxonomy upward for the first truthy rank
            const minRank = ['species', 'genus', 'family', 'order', 'phylum'].find((rank) => !!plantTaxonomy[rank])
            updateDocument[fieldNames.plantTaxonRank] = observation.taxon?.rank || minRank || ''
        }

        // Rewrite the error flags based on the new data
        updateDocument = this.updateErrorFlags(updateDocument)

        return await this.repository.updateById(updateDocument._id, updateDocument)
    }

    /*
     * updateOccurrenceFromDetermination()
     * Updates specific values (bee taxonomy) in an existing occurrence from its corresponding determination
     */
    async updateOccurrenceFromDetermination(occurrence, determination) {
        if (!occurrence) return

        // List of aliases used in the constant field name objects (fieldNames and determinations.fieldNames)
        const fieldNameAliases = [
            'beePhylum',
            'beeClass',
            'beeOrder',
            'beeFamily',
            'beeGenus',
            'beeSubgenus',
            'specificEpithet',
            'taxonomicNotes',
            'scientificName',
            'sex',
            'caste',
            'beeTaxonRank',
            'identifiedBy',
            'volDetFamily',
            'volDetGenus',
            'volDetSpecies',
            'volDetSex',
            'volDetCaste'
        ]
        const updateDocument = {}
        fieldNameAliases.forEach((alias) => updateDocument[fieldNames[alias]] = determination[determinations.fieldNames[alias]] ?? '')

        return await this.repository.updateById(occurrence._id, updateDocument)
    }

    /*
     * writeOccurrencesFromDatabase()
     * Writes all occurrences matching a given filter to a CSV file at the given file path
     */
    async writeOccurrencesFromDatabase(filePath, filter = {}, projection = {}, updateProgress = null) {
        if (!filePath) return

        await FileManager.writeCSVFromDatabase(
            filePath,
            Object.keys(template),
            async (page) => this.getOccurrencesPage({ page, pageSize: 5000, filter, projection }),
            updateProgress
        )
    }

    /*
     * writeOccurrencesFile()
     * Writes occurrences to a given file path
     */
    writeOccurrencesFile(filePath, occurrences) {
        if (!filePath) return

        FileManager.writeCSV(filePath, occurrences, Object.keys(template))
    }

    /*
     * deleteOccurrences()
     * Deletes occurrences matching a given filter from the database
     */
    async deleteOccurrences(filter = {}) {
        return await this.repository.deleteMany(filter)
    }
}

export default new OccurrenceService()
