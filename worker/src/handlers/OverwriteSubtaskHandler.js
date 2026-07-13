import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { determinations, fieldNames, fileLimits, ofvs } from '../../shared/lib/utils/constants.js'
import { getOFV } from '../../shared/lib/utils/utilities.js'
import { ApiService, DeterminationsService, ElevationService, ObservationService, ObservationViewService, OccurrenceService, PlacesService, TaskService, PlantTaxaService } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'

export default class OverwriteSubtaskHandler extends BaseSubtaskHandler {
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

    /* Main Handler Method */

    async handleTask(taskId) {
        if (!taskId) { return }

        // Update the current subtask
        await TaskService.updateCurrentSubtaskById(taskId, 'overwrite')

        // Fetch the task and subtask
        const task = await TaskService.getTaskById(taskId)
        const subtask = task.subtasks.find((subtask) => subtask.type === 'overwrite')

        // Input file names
        // Note -- we assume that a input can *only* come from an upload, not from
        //  a previous subtask. This limitation will likely not be an issue in the future.
        const inputFilePath = task.upload?.filePath ?? ''

        // Output file names
        const occurrencesFileName = `occurrences_${task.tag}.csv`
        const occurrencesFilePath = './shared/data/occurrences/' + occurrencesFileName
        const mismatchesFileName = `mismatches_${task.tag}.csv`
        const mismatchesFilePath = './shared/data/overwrite/' + mismatchesFileName

        await TaskService.logTaskStep(taskId, 'Formatting and uploading provided dataset')
        await TaskService.logTaskStep(taskId, 'Done')
        return

        // Delete old scratch space occurrences (from previous tasks)
        await OccurrenceService.deleteOccurrences({ scratch: true })

        // Move all occurrences into scratch space
        await OccurrenceService.updateOccurrences(subtask.params?.filter ?? {}, { scratch: true })

        // This is where the fun begins!
        await TaskService.logTaskStep(taskId, 'This is where the fun begins!')

        await TaskService.logTaskStep(taskId, 'Writing output files')
        await TaskService.updateProgressPercentageById(taskId, 0)

        // Write scratch space occurrences to output file
        await OccurrenceService.writeOccurrencesFromDatabase(occurrencesFilePath, { scratch: true })

        // Write mismatches file
        await TaskService.updateProgressPercentageById(taskId, 50)
        // await OccurrenceService.writeOccurrencesFromDatabase(mismatchesFilePath, { scratch: true })

        await TaskService.updateProgressPercentageById(taskId, 100)

        // Update the subtask with the output files
        const outputs = [
            { uri: `/api/occurrences/${occurrencesFileName}`, fileName: occurrencesFileName, type: 'occurrences' },
            { uri: `/api/occurrences/${mismatchesFileName}`, fileName: mismatchesFileName, type: 'occurrences' },
        ]
        await TaskService.updateSubtaskOutputsById(taskId, 'overwrite', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/occurrences', fileLimits.maxOccurrences)
        FileManager.limitFilesInDirectory('./shared/data/occurrences', fileLimits.maxMismatches)

        if (subtask.excludeOutput) {
            // Discard scratch space occurrences
            await OccurrenceService.deleteOccurrences({ scratch: true })
        } else {
            // Move all scratch space occurrences back to non-scratch space
            await OccurrenceService.updateOccurrences({ scratch: true }, { scratch: false })
        }
        
    }
}
