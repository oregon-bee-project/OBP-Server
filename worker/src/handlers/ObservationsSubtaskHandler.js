import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { fieldNames, fileLimits } from '../../shared/lib/utils/constants.js'
import { ElevationService, ObservationService, OccurrenceService, PlacesService, TaskService, PlantTaxaService, UsernamesService } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'

export default class ObservationsSubtaskHandler extends BaseSubtaskHandler {
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
     * #insertOccurrencesFromObservations()
     * Inserts new occurrences using unmatched observations from the database
     */
    async #insertOccurrencesFromObservations(elevations, updateProgress) {
        await updateProgress(0)
        
        let occurrencesChunk = []
        let createOccurrencesResults = {
            insertedCount: 0,
            duplicatesCount: 0
        }
        const createOccurrencesChunkSize = 10000     // Approximate; actual number of inserts may be a couple dozen above this number

        let pageNumber = 1
        let observationIndex = 0
        let observationsPage = await ObservationService.getUnmatchedObservationsPage({ page: pageNumber, pageSize: 10000 })
        while (pageNumber <= observationsPage.pagination.totalPages) {
            for (const observation of observationsPage.data) {
                const occurrence = OccurrenceService.createOccurrenceFromObservation(observation, elevations, true)
                await updateProgress(100 * (++observationIndex) / observationsPage.pagination.totalDocuments)

                // specimenId is initially set to the number of bees collected
                // Duplicate observations a number of times equal to this value and overwrite specimenId to index the duplications
                const beesCollected = parseInt(occurrence[fieldNames.specimenId])
                const sampleId = parseInt(occurrence[fieldNames.sampleId])
                if (!isNaN(beesCollected) && !isNaN(sampleId) && sampleId !== 0) {
                    for (let i = 1; i <= beesCollected; i++) {
                        const duplicateOccurrence = Object.assign({}, occurrence)
                        duplicateOccurrence[fieldNames.specimenId] = i.toString()

                        occurrencesChunk.push(duplicateOccurrence)
                    }
                }

                // Limit the number of occurrences created at once to avoid memory limitations (and to create smoother task progression)
                if (occurrencesChunk.length >= createOccurrencesChunkSize || observationIndex >= observationsPage.pagination.totalDocuments) {
                    const chunkResults = await OccurrenceService.createOccurrences(occurrencesChunk, { scratch: true })

                    // Append chunk results
                    createOccurrencesResults.insertedCount += chunkResults.insertedCount
                    createOccurrencesResults.duplicatesCount += chunkResults.duplicates.length

                    // Empty occurrences chunk
                    occurrencesChunk = []
                }
            }

            // Query the next page
            observationsPage = await ObservationService.getUnmatchedObservationsPage({ page: ++pageNumber, pageSize: 10000 })
        }

        await updateProgress(100)
        return createOccurrencesResults
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
        const maxFieldNumber = await OccurrenceService.getMaxFieldNumber()

        // Create a default field number from the given year
        const yearPrefix = year.toString().slice(2)
        let nextFieldNumber = yearPrefix + '000001'

        nextFieldNumber = maxFieldNumber ? this.#incrementFieldNumber(maxFieldNumber) : nextFieldNumber

        // Query occurrences page-by-page to avoid memory constraints
        const updates = []
        let pageNumber = 1
        let results = await OccurrenceService.getUnindexedOccurrencesPage({ page: pageNumber, scratch: true })
        while (pageNumber <= results.pagination.totalPages) {
            for (const occurrence of results.data) {
                // Set field number, and if stateProvince is 'OR', set occurrenceId and resourceId
                const updateDocument = {
                    [fieldNames.fieldNumber]: nextFieldNumber
                }
                if (occurrence[fieldNames.stateProvince] === 'OR') {
                    updateDocument[fieldNames.occurrenceId] = occurrence[fieldNames.occurrenceId] || `https://osac.oregonstate.edu/OBS/OBA_${nextFieldNumber}`
                    updateDocument[fieldNames.resourceId] = occurrence[fieldNames.resourceId] || `https://osac.oregonstate.edu/OBS/OBA_${nextFieldNumber}`
                }

                const id = OccurrenceService.generateOccurrenceId(occurrence)
                updates.push({ id, updateDocument })
                nextFieldNumber = this.#incrementFieldNumber(nextFieldNumber)
            }

            // Query the next page
            results = await OccurrenceService.getUnindexedOccurrencesPage({ page: ++pageNumber, scratch: true })
        }

        for (const update of updates) {
            const { id, updateDocument } = update
            await OccurrenceService.updateOccurrenceById(id, updateDocument)
        }
    }

    /* Main Handler Method */

    async handleTask(taskId) {
        if (!taskId) { return }

        // Update the current subtask
        await TaskService.updateCurrentSubtaskById(taskId, 'observations')

        // Fetch the task, subtask, and previous outputs
        const task = await TaskService.getTaskById(taskId)
        const subtask = task.subtasks.find((subtask) => subtask.type === 'observations')

        // Input and output file names
        
        // If using the upload (and it exists), set the input file to its file path
        let inputFilePath = subtask.input === 'upload' && task.upload?.filePath 
            ? task.upload.filePath : ''
        // If using an input file that is not the upload file, try to find the specified input file in the previous subtask outputs
        if (subtask.input !== 'none' && subtask.input !== 'selection' && subtask.input !== 'upload') {
            const subtaskInputSplit = subtask.input?.split('_') ?? []
            const subtaskInputIndex = parseInt(subtaskInputSplit[0])
            const subtaskInputFileType = subtaskInputSplit[1]
            
            // Get the output file list from the given subtask index
            const outputs = task.subtasks[subtaskInputIndex]?.outputs
            // Get the output file matching the given input file type
            const outputFile = outputs?.find((output) => output.type === subtaskInputFileType)

            // Build the input file path if the given file was found in the previous subtask outputs
            inputFilePath = outputFile ? `./shared/data/${outputFile.type}/${outputFile.fileName}` : inputFilePath
        }
        const sourceAbbreviations = {
            '18521': 'OBA',
            '99706': 'MM',
            '166376': 'WaBA'
        }
        const sourceString = subtask.sources?.map((id) => sourceAbbreviations[id] ?? id)
            ?.join('_') || 'merged'

        const occurrencesFileName = `occurrences_${sourceString}_${task.tag}.csv`
        const occurrencesFilePath = './shared/data/occurrences/' + occurrencesFileName
        const pullsFileName = `pulls_${task.tag}.csv`
        const pullsFilePath = './shared/data/pulls/' + pullsFileName
        const flagsFileName = `flags_${task.tag}.csv`
        const flagsFilePath = './shared/data/flags/' + flagsFileName
        // const obscuredFileName = `obscured_${task.tag}.csv`
        // const obscuredFilePath = `./shared/data/obscured/` 

        await TaskService.logTaskStep(taskId, 'Formatting and uploading provided dataset')

        // Delete old scratch space occurrences (from previous tasks)
        await OccurrenceService.deleteOccurrences({ scratch: true })

        // subtask.input is either 'upload' or a previous subtask's output file
        if (inputFilePath) {   
            if (subtask.excludeOutput) {
                // Insert new occurrences from the input file into scratch space; ignore existing occurrences
                await OccurrenceService.createOccurrencesFromFile(inputFilePath,
                    { scratch: true })
            } else {
                // Upsert data from the input occurrence file into scratch space (existing records will be moved to scratch space)
                await OccurrenceService.upsertOccurrencesFromFile(inputFilePath,
                    { scratch: true })
            }

        // Existing occurrences are not allowed to be excluded from the database
        // The scratch space will be empty if input === 'selection' and excludeOutput === true
        } else if (subtask.input === 'selection' && !subtask.excludeOutput) {

            // Move occurrences matching the query parameters into scratch space
            await OccurrenceService.updateOccurrences(subtask.params?.filter ?? {},
                { scratch: true })
        }

        // Pull new iNaturalist observations and insert them
        await TaskService.logTaskStep(taskId, 'Querying new observations from iNaturalist')

        // Delete old observations (from previous tasks)
        await ObservationService.deleteObservations()

        await ObservationService.pullObservations(
            subtask.sources,
            subtask.minDate,
            subtask.maxDate,
            this.#createUpdateProgressFn(taskId)
        )
        const observations = await ObservationService.getObservations()

        // Update places.json and taxa.json from observations table
        await TaskService.logTaskStep(taskId, 'Updating place data')

        await PlacesService.updatePlacesFromObservations(observations,
            this.#createUpdateProgressFn(taskId))

        await TaskService.logTaskStep(taskId, 'Updating taxonomy data')

        await PlantTaxaService.updateTaxaFromObservations(observations,
            this.#createUpdateProgressFn(taskId))


        // Update usernames data in memory
        UsernamesService.readUsernames()

        // Query all distinct coordinates from the observations database table
        const coordinates = await ObservationService.getDistinctCoordinates()

        // Read all elevation data
        await TaskService.logTaskStep(taskId, `Reading ${coordinates.length} elevations`)

        const elevations = await ElevationService.getElevations(coordinates,
            this.#createUpdateProgressFn(taskId))

        // Add new occurrence data from pulled observations
        await TaskService.logTaskStep(taskId, 'Adding new occurrence data from iNaturalist observations')

        await this.#insertOccurrencesFromObservations(elevations, this.#createUpdateProgressFn(taskId))

        // Fill fieldNumber for unindexed occurrences without errors
        await TaskService.logTaskStep(taskId, 'Indexing occurrences')

        const currentYear = (new Date()).getUTCFullYear()
        await this.#indexOccurrences(currentYear)

        await TaskService.logTaskStep(taskId, 'Writing output files')
        await TaskService.updateProgressPercentageById(taskId, 0)

        // Write unflagged scratch space occurrences to the occurrences output file
        const occurrencesFilter = {
            scratch: true,
            $or: [
                { [fieldNames.errorFlags]: { $exists: false } },
                { [fieldNames.errorFlags]: { $in: [ null, '' ] } }
            ]
        }
        await OccurrenceService.writeOccurrencesFromDatabase(occurrencesFilePath, occurrencesFilter)

        await TaskService.updateProgressPercentageById(taskId, 100 / 4)
        
        // Write unprinted, flagged scratch space occurrences to the flags output file
        const flagsFilter = {
            scratch: true,
            [fieldNames.errorFlags]: { $exists: true, $nin: [ null, '' ] },
            $or: [
                { [fieldNames.dateLabelPrint]: { $exists: false } },
                { [fieldNames.dateLabelPrint]: { $in: [null, ''] } }
            ]
        }
        await OccurrenceService.writeOccurrencesFromDatabase(flagsFilePath, flagsFilter)

        await TaskService.updateProgressPercentageById(taskId, 100 * 2 / 4)

        // Write new unflagged scratch space occurrences to the pulls output file
        const pullsFilter = {
            scratch: true,
            new: true,
            $or: [
                { [fieldNames.errorFlags]: { $exists: false } },
                { [fieldNames.errorFlags]: { $in: [ null, '' ] } }
            ]
        }
        await OccurrenceService.writeOccurrencesFromDatabase(pullsFilePath, pullsFilter)


        await TaskService.updateProgressPercentageById(taskId, 100)

        // Update the task result with the output files
        const outputs = [
            { uri: `/api/occurrences/${occurrencesFileName}`, fileName: occurrencesFileName, type: 'occurrences', subtype: 'merged' },
            { uri: `/api/pulls/${pullsFileName}`, fileName: pullsFileName, type: 'pulls' },
            { uri: `/api/flags/${flagsFileName}`, fileName: flagsFileName, type: 'flags' }
        ]
        await TaskService.updateSubtaskOutputsById(taskId, 'observations', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/occurrences', fileLimits.maxOccurrences)
        FileManager.limitFilesInDirectory('./shared/data/pulls', fileLimits.maxPulls)
        FileManager.limitFilesInDirectory('./shared/data/flags', fileLimits.maxFlags)

        if (!subtask.excludeOutput) {
            // Move occurrences with a fieldNumber or no errorFlags back to non-scratch space
            const unscratchFilter = {
                scratch: true,
                $or: [
                    { [fieldNames.fieldNumber]: { $exists: true, $nin: [ null, '' ] } },
                    { [fieldNames.errorFlags]: { $exists: false } },
                    { [fieldNames.errorFlags]: { $in: [ null, '' ] } }
                ]
            }
            await OccurrenceService.updateOccurrences(unscratchFilter, { scratch: false })
        }
        // Discard remaining scratch space occurrences
        await OccurrenceService.deleteOccurrences({ scratch: true })
    }
}
