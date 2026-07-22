import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { determinations, fieldNames, fileLimits, ofvs } from '../../shared/lib/utils/constants.js'
import { getOFV } from '../../shared/lib/utils/utilities.js'
import { ApiService, DeterminationsService, ElevationService, ObservationService, ObservationViewService, OccurrenceService, PlacesService, TaskService, PlantTaxaService } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'

export default class OccurrencesSubtaskHandler extends BaseSubtaskHandler {
    constructor() {
        super()
    }

    /* Private Helper Methods */

    /*
     * #createUpdateProgressFn()
     * Returns a function that updates a given task's current step progress percentage
     */
    #createUpdateProgressFn(taskId) {
        return async (percentage) => {
            return await TaskService.updateProgressPercentageById(taskId, percentage)
        }
    }

    /*
     * #updateOccurrencesFromObservations()
     * Updates existing occurrences using matching observations from the database
     */
    async #updateOccurrencesFromObservations(elevations, updateProgress, overwriteValidLocations = false) {

        // Query occurrences page-by-page to avoid memory constraints
        let pageNumber = 1
        let occurrenceIndex = 0
        const occurrencesFilter = {
            scratch: true,
            [fieldNames.iNaturalistUrl]: { $exists: true, $nin: [ null, '' ] }
        }
        const observationQueryOptions = {
            projection: {
                uuid: 1,
                positional_accuracy: 1,
                geojson: 1,
                taxon: 1,
                uri: 1,
                place_guess: 1
            }
        }
        let occurrencesResults = await OccurrenceService.getOccurrencesPage({ page: pageNumber, filter: occurrencesFilter })
        while (pageNumber <= occurrencesResults.pagination.totalPages) {
            const urls = occurrencesResults.data.map((occurrence) => occurrence[fieldNames.iNaturalistUrl])
            const matchingObservations = await ObservationService.getObservations({ 'uri': { $in: urls } }, observationQueryOptions)
            const urlMap = {}
            matchingObservations.forEach((observation) => urlMap[observation.uri] = observation)

            for (const occurrence of occurrencesResults.data) {
                const matchingObservation = urlMap[occurrence[fieldNames.iNaturalistUrl]]
                if (matchingObservation) {
                    // Update the occurrence data from the matching observation
                    await OccurrenceService.updateOccurrenceFromObservation(occurrence, matchingObservation, elevations, { overwriteValidLocations })
                }

                await updateProgress(100 * (++occurrenceIndex) / occurrencesResults.pagination.totalDocuments)
            }

            // Query the next page
            occurrencesResults = await OccurrenceService.getOccurrencesPage({ page: ++pageNumber, filter: occurrencesFilter })
        }

        await updateProgress(100)
    }

    /*
     * #insertOccurrencesFromBeeIncreases()
     * Adjusts the number of occurrences corresponding to each observation to match the number of bees collected (if increased)
     */
    async #insertOccurrencesFromBeeIncreases(updateProgress) {
        await updateProgress(0)

        // Query the observation/occurrence join view page-by-page and insert new occurrences in
        // batches, so neither the source observations nor the generated occurrences are ever all
        // held in memory at once (issue #17). Inserting occurrences for one observation does not
        // change any other observation's count (they join on distinct iNaturalist URLs), so the
        // paginated view stays consistent as we go.
        const flushSize = 5000
        let pending = []

        let pageNumber = 1
        let page = await ObservationViewService.getObservationViewPage(pageNumber)
        const totalDocuments = page.pagination.totalDocuments
        let processed = 0

        while (page.data.length > 0) {
            for (const observation of page.data) {
                const beesCollected = getOFV(observation.ofvs, ofvs.beesCollected)

                if (beesCollected > observation.occurrenceCount) {
                    // Create new occurrences to make up the difference between the existing occurrences and the new number of bees collected
                    for (let j = 1; j < beesCollected - observation.occurrenceCount + 1; j++) {
                        // Duplicate the first occurrence and set its SPECIMEN_ID
                        const duplicateOccurrence = Object.assign({}, observation.firstOccurrence)

                        duplicateOccurrence[fieldNames.specimenId] = (observation.occurrenceCount + j).toString()
                        // Clear OBSERVATION_NO and DATE_LABEL_PRINT fields so they can be assigned properly later
                        duplicateOccurrence[fieldNames.fieldNumber] = ''
                        duplicateOccurrence[fieldNames.dateLabelPrint] = ''
                        // Tag the occurrence as new
                        duplicateOccurrence.new = true

                        pending.push(duplicateOccurrence)
                    }
                }

                // Flush the batch once it is large enough to keep memory bounded
                if (pending.length >= flushSize) {
                    await OccurrenceService.createOccurrences(pending, { scratch: true })
                    pending = []
                }

                await updateProgress(totalDocuments ? 100 * (++processed) / totalDocuments : 100)
            }

            // Query the next page
            page = await ObservationViewService.getObservationViewPage(++pageNumber)
        }

        // Insert any remaining occurrences from the final partial batch
        if (pending.length > 0) {
            await OccurrenceService.createOccurrences(pending, { scratch: true })
        }

        await updateProgress(100)
    }

    /*
     * #incrementFieldNumber()
     * Takes a given field number as a string and returns the next in the sequence, maintaining the year prefix
     */
    #incrementFieldNumber(fieldNumber) {
        // Catch invalid numbers
        if (!fieldNumber || isNaN(fieldNumber)) return ''

        // Convert the number to a string if it is not one
        if (typeof fieldNumber !== 'string') {
            fieldNumber = fieldNumber.toString()
        }

        // Split the given number at the second character
        const prefix = fieldNumber.slice(0, 2)
        const suffix = fieldNumber.slice(2)

        // Convert the suffix to an integer, increment it, and parse it back to a string of fixed length
        let nextSuffix = parseInt(suffix)
        nextSuffix = (++nextSuffix).toString().padStart(suffix.length, '0')

        // Return the concatenated prefix and new suffix
        return prefix + nextSuffix
    }

    /*
     * #indexOccurrences()
     * Fills the fieldNumber, occurrenceId, and resourceId fields for unflagged occurrences in the database
     */
    async #indexOccurrences(year) {
        // Query the highest field number from the occurrence database
        const maxFieldNumber = await OccurrenceService.getMaxFieldNumber({ scratch: true })

        // Create a default field number from the given year
        const yearPrefix = year.toString().slice(2)
        let nextFieldNumber = yearPrefix + '000001'

        nextFieldNumber = maxFieldNumber ? this.#incrementFieldNumber(maxFieldNumber) : nextFieldNumber

        // Index occurrences one page at a time, applying each page's updates before fetching the
        // next. Assigning a field number removes an occurrence from the unindexed set, so we always
        // drain the first page until none remain. This bounds memory to a single page rather than
        // accumulating an update for every occurrence up front (issue #17). Occurrences are drained
        // in composite_sort order, so field numbers are still assigned in the same sequence.
        let results = await OccurrenceService.getUnindexedOccurrencesPage({ page: 1, scratch: true })
        while (results.data.length > 0) {
            for (const occurrence of results.data) {
                // Set field number, and if stateProvince is 'OR', set occurrenceId and resourceId
                const updateDocument = { observation: null }

                updateDocument[fieldNames.fieldNumber] = nextFieldNumber
                if (occurrence[fieldNames.stateProvince] === 'OR') {
                    updateDocument[fieldNames.occurrenceId] = occurrence[fieldNames.occurrenceId] || `https://osac.oregonstate.edu/OBS/OBA_${nextFieldNumber}`
                    updateDocument[fieldNames.resourceId] = occurrence[fieldNames.resourceId] || `https://osac.oregonstate.edu/OBS/OBA_${nextFieldNumber}`
                }

                const id = OccurrenceService.generateOccurrenceId(occurrence)
                await OccurrenceService.updateOccurrenceById(id, updateDocument)
                nextFieldNumber = this.#incrementFieldNumber(nextFieldNumber)
            }

            // Re-query the first page; the occurrences just indexed have dropped out of the set
            const previousTotal = results.pagination.totalDocuments
            results = await OccurrenceService.getUnindexedOccurrencesPage({ page: 1, scratch: true })

            // Safety valve: bail out if a page failed to shrink the set rather than loop forever
            if (results.pagination.totalDocuments >= previousTotal) {
                throw new Error('Occurrence indexing did not converge; aborting to avoid an infinite loop')
            }
        }
    }

    /*
     * #updateOccurrencesFromDeterminations()
     * Update existing occurrences with matching determinations data
     */
    async #updateOccurrencesFromDeterminations(updateProgress) {
        await updateProgress(0)

        // Query occurrences page-by-page to avoid memory constraints
        let pageNumber = 1
        let occurrenceIndex = 0
        const occurrencesFilter = {
            scratch: true,
            [fieldNames.fieldNumber]: { $exists: true, $nin: [ null, '' ] }
        }
        let occurrencesResults = await OccurrenceService.getOccurrencesPage({ page: pageNumber, filter: occurrencesFilter })
        while (pageNumber <= occurrencesResults.pagination.totalPages) {
            const fieldNumbers = occurrencesResults.data.map((occurrence) => occurrence[fieldNames.fieldNumber])
            const matchingDeterminations = await DeterminationsService.getDeterminations({ [determinations.fieldNames.fieldNumber]: { $in: fieldNumbers } })
            const fieldNumberMap = {}
            matchingDeterminations.forEach((determination) => fieldNumberMap[determination[determinations.fieldNames.fieldNumber]] = determination)

            for (const occurrence of occurrencesResults.data) {
                const matchingDetermination = fieldNumberMap[occurrence[fieldNames.fieldNumber]]
                if (matchingDetermination) {
                    // Update the occurrence data from the matching determination
                    await OccurrenceService.updateOccurrenceFromDetermination(occurrence, matchingDetermination)
                }

                await updateProgress(100 * (++occurrenceIndex) / occurrencesResults.pagination.totalDocuments)
            }

            // Query the next page
            occurrencesResults = await OccurrenceService.getOccurrencesPage({ page: ++pageNumber, filter: occurrencesFilter })
        }

        await updateProgress(100)
    }

    /* Main Handler Method */

    async handleTask(taskId) {
        if (!taskId) { return }

        // Update the current subtask
        await TaskService.updateCurrentSubtaskById(taskId, 'occurrences')

        // Fetch the task and subtask
        const task = await TaskService.getTaskById(taskId)
        const subtask = task.subtasks.find((subtask) => subtask.type === 'occurrences')

        // Input and output file names
        const uploadFilePath = task.upload?.filePath ?? ''
        const occurrencesFileName = `occurrences_${task.tag}.csv`
        const occurrencesFilePath = './shared/data/occurrences/' + occurrencesFileName

        await TaskService.logTaskStep(taskId, 'Formatting and uploading provided dataset')

        // Delete old scratch space occurrences (from previous tasks)
        await OccurrenceService.deleteOccurrences({ scratch: true })

        if (subtask.input === 'upload') {
            if (subtask.excludeOutput) {
                // Insert new occurrences from the upload file into scratch space; ignore existing occurrences
                await OccurrenceService.createOccurrencesFromFile(uploadFilePath, { scratch: true })
            } else {
                // Upsert data from the uploaded occurrence file into scratch space (existing records will be moved to scratch space)
                await OccurrenceService.upsertOccurrencesFromFile(uploadFilePath, { scratch: true })
            }
        } else if (subtask.input === 'selection' && !subtask.excludeOutput) {
            // Existing occurrences are not allowed to be excluded from the database
            // The scratch space will be empty if input === 'selection' and excludeOutput === true
            
            // Move occurrences matching the query parameters into scratch space
            await OccurrenceService.updateOccurrences(subtask.params?.filter ?? {}, { scratch: true })
        }

        await TaskService.logTaskStep(taskId, 'Querying corresponding iNaturalist observations from provided dataset')

        // Query all distinct URLs from the occurrences database table and extract the observation IDs
        const distinctUrls = await OccurrenceService.getDistinctUrls({ scratch: true })
        const observationIds = distinctUrls
            .map((url) => url.split('/').pop())
            .filter((id) => id && !isNaN(id))
        // Fetch the observations corresponding to the uploaded occurrences and insert them into the observations database table
        let matchingObservations = await ApiService.fetchObservationsByIds(observationIds, this.#createUpdateProgressFn(taskId))
        // Set a custom field indicating that this observation has a matching occurrence
        matchingObservations = matchingObservations.map((obs) => ({ ...obs, matched: true }))

        // Insert observations into the database; delete old observations first
        await ObservationService.deleteObservations()
        if (matchingObservations.length > 0) {
            await ObservationService.createObservations(matchingObservations)
        }

        const observations = await ObservationService.getObservations()

        // Update places.json and taxa.json from observations table
        await TaskService.logTaskStep(taskId, 'Updating place data')

        // Everything goes as expected here, nothing new. Followed by a crash.
        await PlacesService.updatePlacesFromObservations(observations, this.#createUpdateProgressFn(taskId))

        await TaskService.logTaskStep(taskId, 'Updating taxonomy data')

        await PlantTaxaService.updateTaxaFromObservations(observations, this.#createUpdateProgressFn(taskId))

        // Query all distinct coordinates from the occurrences database table
        let coordinates = await OccurrenceService.getDistinctCoordinates({ scratch: true })
        // Query all distinct coordinates from the observations database table and append them (deduplicating with a Set)
        coordinates = [...(new Set(coordinates.concat(await ObservationService.getDistinctCoordinates())))]

        // Read all elevation data
        await TaskService.logTaskStep(taskId, `Reading ${coordinates.length} elevations`)

        const elevations = await ElevationService.getElevations(coordinates, this.#createUpdateProgressFn(taskId))

        // Update existing occurrence data from its corresponding observations
        await TaskService.logTaskStep(taskId, 'Updating occurrence data from iNaturalist observations')

        await this.#updateOccurrencesFromObservations(elevations, this.#createUpdateProgressFn(taskId), subtask.overwriteValidLocations)

        // Add new occurrence data from bee increases
        await TaskService.logTaskStep(taskId, 'Adding new occurrence data from bee increases')

        await this.#insertOccurrencesFromBeeIncreases(this.#createUpdateProgressFn(taskId))

        // Fill fieldNumber for unindexed occurrences without errors
        await TaskService.logTaskStep(taskId, 'Indexing occurrences')

        const currentYear = (new Date()).getUTCFullYear()
        await this.#indexOccurrences(currentYear)

        // Update existing occurrences with determinations data (keyed by fieldNumber)
        await TaskService.logTaskStep(taskId, 'Updating occurrence data with bee species determinations')

        await this.#updateOccurrencesFromDeterminations(this.#createUpdateProgressFn(taskId))

        await TaskService.logTaskStep(taskId, 'Writing output files')
        await TaskService.updateProgressPercentageById(taskId, 0)

        // Write scratch space occurrences to output file
        await OccurrenceService.writeOccurrencesFromDatabase(occurrencesFilePath, { scratch: true })

        await TaskService.updateProgressPercentageById(taskId, 100)

        // Update the subtask with the output files
        const outputs = [
            { uri: `/api/occurrences/${occurrencesFileName}`, fileName: occurrencesFileName, type: 'occurrences' },
        ]
        await TaskService.updateSubtaskOutputsById(taskId, 'occurrences', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/occurrences', fileLimits.maxOccurrences)

        if (subtask.excludeOutput) {
            // Discard scratch space occurrences
            await OccurrenceService.deleteOccurrences({ scratch: true })
        } else {
            // Move all scratch space occurrences back to non-scratch space
            await OccurrenceService.updateOccurrences({ scratch: true }, { scratch: false })
        }
        
    }
}
