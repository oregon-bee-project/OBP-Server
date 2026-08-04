import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { fileLimits } from '../../shared/lib/utils/constants.js'
import { ApiService, ObservationService, ScriptService, TaskService } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'
import { delay } from '../../shared/lib/utils/utilities.js'

export default class StewardshipReportSubtaskHandler extends BaseSubtaskHandler {
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

    /* Main Handler Method */

    async handleTask(taskId) {
        if (!taskId) { return }

        // Update the current subtask
        await TaskService.updateCurrentSubtaskById(taskId, 'stewardshipReport')

        // Fetch the task and subtask
        const task = await TaskService.getTaskById(taskId)
        const subtask = task.subtasks.find((subtask) => subtask.type === 'stewardshipReport')

        // Input and output file names
        const uploadFilePath = task.upload?.filePath ?? ''
        const occurrencesFilePath = './shared/data/workingOccurrences.csv'
        const plantListFilePath = "./shared/data/plantList.csv"
        // const observationsFileName = `observations_${task.tag}.csv`
        // const observationsFilePath = './shared/data/observations/' + observationsFileName
        const stewardshipReportFileName = `observations_${task.tag}-report.pdf`
        // const stewardshipReportFilePath = './shared/data/reports/' + stewardshipReportFileName
        const stewardshipReportFilePath = './shared/data/reports/'

        // // Pull iNaturalist observations and write them to a CSV in /shared/data/observations
        // await TaskService.logTaskStep(taskId, 'Querying observations from iNaturalist')
        //
        // // Delete old observations (from previous tasks)
        // await ObservationService.deleteObservations()
        // // Fetch observations from the given URL and insert them into the database
        // // Something about this function hits too many requests -- let's abandon it for now
        // const observations = await ApiService.fetchUrlPages(subtask.url, this.#createUpdateProgressFn(taskId))
        // await ObservationService.createObservations(observations)
        // // Flatten and write the observations to a CSV in /shared/data/observations
        // await ObservationService.writeObservationsFromDatabase(observationsFilePath)

        // Execute the stewardship report R script
        await TaskService.logTaskStep(taskId, 'Creating stewardship report')
        await TaskService.updateProgressPercentageById(taskId, 0)
        
        // Directly feeding the uploadFilePath may not work if it's relative?
        // For ease of testing, we'll always feed it workingOccurrences.csv
        //  TODO: Make it instead take a selection / upload, as is typical for other tasks
        const { success, stdout, stderr } = await ScriptService.runRScript('./src/scripts/dry-run.R', [ plantListFilePath, occurrencesFilePath, uploadFilePath, stewardshipReportFilePath ])
        if (!success) {
            console.log(stdout, '\n', stderr)
            throw new Error('Script failed')
        }
        
        // // Wait 5 seconds for rendering to finish
        // //   this seems bad -- isn't there a way to wait on the rendering process to finish?
        // await delay(5000)

        console.log(stdout, stderr)

        await TaskService.updateProgressPercentageById(taskId, 100)

        // // Clean up observations files
        // await TaskService.logTaskStep(taskId, 'Cleaning up files')
        //
        // FileManager.clearDirectory('./shared/data/observations')

        // Update the task result with the output files
        const outputs = [
            { uri: `/api/reports/${stewardshipReportFileName}`, fileName: stewardshipReportFileName, type: 'report', subtype: 'stewardship' }
        ]
        await TaskService.updateSubtaskOutputsById(taskId, 'stewardshipReport', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/reports', fileLimits.maxReports)
    }
}
