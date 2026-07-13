import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { fieldNames, fileLimits, template } from '../../shared/lib/utils/constants.js'
import { ObservationService, OccurrenceService, TaskService, } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'

export default class OverwriteSubtaskHandler extends BaseSubtaskHandler {
    constructor() {
        super()
    }

    /* Private Helper Methods */

    /*
     * #cleanRevision()
     * Removes all fields from an object which aren't in the occurrence template
     */
    #cleanRevisions(rawRevisions) {
        return rawRevisions.map(revision => (
            Object.fromEntries(
                Object.entries(revision).filter(([ key ]) => key in template)
            )
        ))
    }

    /*
     * #overwriteOccurrences()
     * Overwrites fields in each occurrence with that of the corresponding revision
     *   and retuns fieldNumbers of revisions which matched with an occurrence
     */
    async #overwriteOccurrences(revisions, occurrences) {
        const matches = []
        for (const occurrence of occurrences) {
            const revision = revisions.find(r => r.fieldNumber === occurrence.fieldNumber)
            if (!revision) {
                continue
            }
            matches.push(revision.fieldNumber)
            Object.assign(occurrence, revision)
            await OccurrenceService.updateOccurrenceById(occurrence._id, occurrence)
        }
        return matches
    }

    /*
     * #writeMismatchesFile()
     * Writes mismatched revisions to a CSV file at the given file path
     */
    #writeMismatchesFile(filePath, mismatches, rawRevision) {
        const header = rawRevision ? Object.keys(rawRevision) : ['fieldNumber']
        return FileManager.writeCSV(filePath, mismatches, header)
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
        const mismatchesFilePath = './shared/data/mismatches/' + mismatchesFileName

        await TaskService.logTaskStep(taskId, 'Formatting and uploading provided dataset')

        // Delete old scratch space occurrences (from previous tasks)
        await OccurrenceService.deleteOccurrences({ scratch: true })

        // Read revisions input file as an Object
        const rawRevisions = FileManager.readCSV(inputFilePath)

        await TaskService.logTaskStep(taskId, 'Updating occurrence data')

        // Filter off columns which aren't in the occurrence template and extract field numbers
        const revisions = this.#cleanRevisions(rawRevisions)
        const fieldNumbers = revisions.map(revision => revision.fieldNumber)

        // Retrieve all occurrences with a matching fieldNumber
        const result = await OccurrenceService.updateOccurrences(
            { fieldNumber: { $in: fieldNumbers  } },
            { scratch: true }
        )
        const occurrences = await OccurrenceService.getOccurrences({ scratch: true })

        // Overwrite occurrences with the fields from the revisions
        const matches = await this.#overwriteOccurrences(revisions, occurrences)

        await TaskService.logTaskStep(taskId, 'Finding mismatches')
        const mismatches = revisions.filter(r => !(r.fieldNumber in matches))

        await TaskService.logTaskStep(taskId, 'Writing output files')
        await TaskService.updateProgressPercentageById(taskId, 0)

        // Write scratch space occurrences to output file
        await OccurrenceService.writeOccurrencesFromDatabase(occurrencesFilePath, { scratch: true })

        // Write mismatches file
        await TaskService.updateProgressPercentageById(taskId, 50)
        this.#writeMismatchesFile(mismatchesFilePath, mismatches, rawRevisions?.at(0))

        await TaskService.updateProgressPercentageById(taskId, 100)

        // Update the subtask with the output files
        const outputs = [
            { uri: `/api/occurrences/${occurrencesFileName}`, fileName: occurrencesFileName, type: 'occurrences' },
            { uri: `/api/mismatches/${mismatchesFileName}`, fileName: mismatchesFileName, type: 'mismatches' },
        ]
        await TaskService.updateSubtaskOutputsById(taskId, 'overwrite', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/occurrences', fileLimits.maxOccurrences)
        FileManager.limitFilesInDirectory('./shared/data/mismatches', fileLimits.maxMismatches)

        // Move all scratch space occurrences back to non-scratch space
        await OccurrenceService.updateOccurrences({ scratch: true }, { scratch: false })
    }
}
