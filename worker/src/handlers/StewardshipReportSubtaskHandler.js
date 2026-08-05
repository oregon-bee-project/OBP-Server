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

        // Script input files
        const uploadFilePath = task.upload?.filePath ?? ''
        const occurrencesPath = './shared/data/workingOccurrences.csv'
        const plantListPath = "./shared/data/plantList.csv"

        const tempDirectory = './shared/data/temp/'
        const observationsPath = tempDirectory + 'observations.csv'

        // Script output files
        const defaultReportName = 'report.pdf'
        const defaultReportPath = tempDirectory + defaultReportName
        const defaultPlantSummaryName = 'plantDataSummary.csv'
        const defaultPlantSummaryPath = tempDirectory + defaultPlantSummaryName

        // Subtask output files
        const outputDirectory = './shared/data/reports/'
        const reportName = `stewardship_reports_${task.tag}.pdf`
        const reportPath = outputDirectory + reportName
        const plantSummaryName = `plant_summary_${task.tag}.csv`
        const plantSummaryPath = outputDirectory + plantSummaryName

        // Clear out temp directory from previous subtasks
        FileManager.clearDirectory(tempDirectory)

        // Move uploaded file to dedicated "input directory"
        FileManager.copyFile(uploadFilePath, observationsPath)

        // Execute the stewardship report R script
        await TaskService.logTaskStep(taskId, 'Creating stewardship report')
        
        //  TODO: Make this subtask take a selection / upload for occurrences,
        //      instead of just whataver happens to be in "workingOccurrences"
        const { success, stdout, stderr } = await ScriptService.runRScript('./src/scripts/stewardshipReports/run.R', [ plantListPath, occurrencesPath, tempDirectory, tempDirectory ])
        if (!success) {
            throw new Error('Script failed')
        }

        await TaskService.logTaskStep(taskId, 'Writing output files')

        FileManager.copyFile(defaultReportPath, reportPath)
        FileManager.copyFile(defaultPlantSummaryPath, plantSummaryPath)


        // Update the task result with the output files
        const outputs = [
            { uri: `/api/reports/${reportName}`, fileName: reportName, type: 'report', subtype: 'stewardship' },
            { uri: `/api/reports${plantSummaryName}`, fileName: plantSummaryName, type: 'plantSummary' }
        ]
        await TaskService.updateSubtaskOutputsById(taskId, 'stewardshipReport', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/reports', fileLimits.maxReports)

        // Clean up temp directory
        FileManager.clearDirectory(tempDirectory)
    }
}
