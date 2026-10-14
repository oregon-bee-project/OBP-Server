import fs from 'fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { stringify } from 'csv-stringify'

import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { fieldNames, fileLimits, obsFieldNames, obsTemplate } from '../../shared/lib/utils/constants.js'
import { ApiService, ObservationService, OccurrenceService, ScriptService, TaskService } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'

// Scratch space for a single run; cleared at the start of every run so earlier observations never reach the report
const tempDirectory = './shared/data/temp/'
const inatDirectory = tempDirectory + 'inat/'       // The R script reads every CSV in here as an iNaturalist project
const scriptOutputDirectory = tempDirectory + 'out/'
const scriptLogPath = tempDirectory + 'script.txt'

// Cached occurrences export, kept between runs
const cacheDirectory = './shared/data/stewardship/'
const occurrencesPath = cacheDirectory + 'occurrences.csv'
const occurrencesMetadataPath = cacheDirectory + 'occurrences.json'

const plantListPath = './shared/data/plantList.csv'
const reportsDirectory = './shared/data/reports/'

// The only occurrence columns the R script reads (see beeDataColumns in run.R)
const occurrenceColumns = [
    fieldNames.recordedBy,
    fieldNames.sex,
    fieldNames.plantSpecies,
    fieldNames.samplingProtocol,
    fieldNames.month,
    fieldNames.day,
    fieldNames.year,
    fieldNames.county,
    fieldNames.beeGenus,
    fieldNames.specificEpithet,
    fieldNames.latitude,
    fieldNames.longitude
]

// Subtasks confirmed never to change the exported occurrence data. Any other subtask (including ones added later)
//  invalidates the cached occurrences export, so only add one here after checking its handler
export const readOnlySubtasks = [
    { type: 'download' },
    { type: 'plantList' },
    { type: 'stewardshipReport' },
    // With selection input, these only move occurrences in and out of scratch space (labels also sets the unexported
    //  dateLabelPrint) and delete some, which changes the count. With file input they upsert the file's values over
    //  existing occurrences
    ...[ 'addresses', 'emails', 'labels', 'pivots' ].map((type) => ({ type, input: 'selection' }))
]

// iNaturalist refuses to page past this many results
const maxObservations = 10000

// The R script stops if any observation is undated or from before 2010
const minObservationYear = 2010

// The production server renders reports more slowly than development machines
const scriptTimeout = 6 * 60 * 1000     // 6 minutes

/*
 * writeCSVFromRows()
 * Streams rows from an (async) iterable into a CSV file, formatted like FileManager.writeCSV. Resolves once the file is
 *  completely written, so it can be read immediately afterwards
 */
export async function writeCSVFromRows(filePath, rows, columns) {
    await pipeline(
        Readable.from(rows),
        stringify({ header: true, columns, bom: true }),
        fs.createWriteStream(filePath)
    )
}

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

    /*
     * #logUnmeasuredStep()
     * Logs a task step without a progress percentage (logTaskStep otherwise keeps the previous step's percentage)
     */
    async #logUnmeasuredStep(taskId, message) {
        await TaskService.updateProgressPercentageById(taskId, '')
        await TaskService.logTaskStep(taskId, message)
    }

    /*
     * #writeObservationsFromUrl()
     * Fetches plant observations from an iNaturalist observations URL and writes them to a CSV file
     */
    async #writeObservationsFromUrl(taskId, url, filePath) {
        // Check the number of matching observations before pulling them all
        const countUrl = new URL(url)
        countUrl.hostname = 'api.inaturalist.org'
        countUrl.pathname = '/v1/observations'
        countUrl.searchParams.set('per_page', '1')

        const countResponse = await ApiService.fetchUrl(countUrl.toString())
        if (!countResponse) {
            throw new Error('Could not reach iNaturalist')
        }

        const totalObservations = parseInt(countResponse.total_results ?? '0')
        if (totalObservations === 0) {
            throw new Error('No plant observations found at the given iNaturalist URL')
        }
        if (totalObservations > maxObservations) {
            throw new Error(`The iNaturalist URL matches ${totalObservations} plant observations; narrow it down to ${maxObservations} or fewer`)
        }

        await TaskService.logTaskStep(taskId, `Pulling ${totalObservations} plant observations from iNaturalist`)
        const observations = await ApiService.fetchUrlPages(url, this.#createUpdateProgressFn(taskId))

        // fetchUrlPages skips pages it fails to fetch, which would quietly leave observations out of the report
        if (observations.length < totalObservations) {
            throw new Error(`Only ${observations.length} of ${totalObservations} observations could be pulled from iNaturalist`)
        }

        const flatObservations = observations
            .map((observation) => ObservationService.flattenObservation(observation))
            .filter((observation) => {
                const observedOn = observation[obsFieldNames.observedOn]
                return /^\d{4}-\d{2}-\d{2}$/.test(observedOn) && parseInt(observedOn) >= minObservationYear
            })
        if (flatObservations.length === 0) {
            throw new Error(`None of the plant observations at the given iNaturalist URL are dated ${minObservationYear} or later`)
        }
        if (!FileManager.writeCSV(filePath, flatObservations, Object.keys(obsTemplate))) {
            throw new Error('Failed to write observations file')
        }

        return { pulled: observations.length, skipped: observations.length - flatObservations.length }
    }

    /*
     * #getCachedOccurrencesExport()
     * Returns the cached occurrences export's metadata if the export is still current, otherwise null
     */
    async #getCachedOccurrencesExport() {
        if (!fs.existsSync(occurrencesPath) || !fs.existsSync(occurrencesMetadataPath)) return null

        let metadata
        try {
            metadata = JSON.parse(fs.readFileSync(occurrencesMetadataPath, 'utf8'))
        } catch {
            return null
        }

        if (JSON.stringify(metadata.columns) !== JSON.stringify(occurrenceColumns)) return null

        // Occurrences only change through tasks that aren't read-only or through direct uploads, which usually change the
        //  count. Tasks still pending haven't touched the database yet; they are caught by the next report once they run
        if (await OccurrenceService.count({}) !== metadata.count) return null
        if (await TaskService.hasStartedTasksSince(metadata.exportedAt, readOnlySubtasks)) return null

        return metadata
    }

    /*
     * #exportOccurrences()
     * Writes the occurrence columns the R script needs from the database to the cached export
     */
    async #exportOccurrences(taskId) {
        const updateProgress = this.#createUpdateProgressFn(taskId)
        const exportedAt = new Date().toISOString()

        // Invalidate the old export first, in case this one fails partway through
        fs.rmSync(occurrencesMetadataPath, { force: true })

        const pageSize = 5000
        const projection = Object.fromEntries(occurrenceColumns.map((column) => [column, 1]))
        let count = 0

        // Pages are written as they arrive, so only one page of occurrences is in memory at a time
        async function* occurrencePages() {
            for (let page = 1; ; page++) {
                // Sorting by _id alone is much cheaper than the default sort, and the R script doesn't need an order
                const results = await OccurrenceService.getOccurrencesPage({ page, pageSize, filter: {}, projection, sortConfig: [] })
                count += results.data.length
                yield* results.data

                const totalPages = Math.max(results.pagination.totalPages, page)
                await updateProgress(Math.min(100, 100 * page / totalPages))

                if (results.data.length < pageSize) break
            }
        }

        await updateProgress(0)
        try {
            await writeCSVFromRows(occurrencesPath, occurrencePages(), occurrenceColumns)
        } catch (error) {
            throw new Error(`Failed to write occurrences export: ${error.message}`)
        }
        FileManager.writeJSON(occurrencesMetadataPath, { exportedAt, count, columns: occurrenceColumns })

        return count
    }

    /*
     * #describeAge()
     * Describes how long ago an ISO timestamp was (e.g. '5 minutes ago')
     */
    #describeAge(isoDate) {
        const minutes = Math.round((Date.now() - new Date(isoDate).getTime()) / 60000)
        if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`

        const hours = Math.round(minutes / 60)
        if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`

        return `${Math.round(hours / 24)} days ago`
    }

    /* Main Handler Method */

    async handleTask(taskId) {
        if (!taskId) { return }

        // Update the current subtask
        await TaskService.updateCurrentSubtaskById(taskId, 'stewardshipReport')

        // Fetch the task and subtask
        const task = await TaskService.getTaskById(taskId)
        const subtask = task.subtasks.find((subtask) => subtask.type === 'stewardshipReport')

        // The report's title comes from the observations file name
        const title = subtask.title || 'Stewardship Report'
        const observationsPath = inatDirectory + `${title}.csv`

        // Start from an empty temp directory (FileManager.clearDirectory can't remove subdirectories)
        fs.rmSync(tempDirectory, { recursive: true, force: true })
        for (const directory of [ inatDirectory, scriptOutputDirectory, cacheDirectory, reportsDirectory ]) {
            fs.mkdirSync(directory, { recursive: true })
        }

        // Notes for the top of the script log
        const logNotes = []

        // Observations
        if (subtask.input === 'url') {
            await this.#logUnmeasuredStep(taskId, 'Pulling plant observations from iNaturalist')
            const { pulled, skipped } = await this.#writeObservationsFromUrl(taskId, subtask.url, observationsPath)
            if (skipped > 0) {
                const note = `Skipped ${skipped} of ${pulled} observations that are undated or from before ${minObservationYear}`
                logNotes.push(note)
                await this.#logUnmeasuredStep(taskId, note)
            }
        } else {
            const uploadFilePath = task.upload?.filePath
            if (!uploadFilePath || !FileManager.copyFile(uploadFilePath, observationsPath)?.success) {
                throw new Error('No observations file was uploaded')
            }
        }

        // Occurrences
        const cachedExport = subtask.refreshOccurrences ? null : await this.#getCachedOccurrencesExport()
        if (cachedExport) {
            await this.#logUnmeasuredStep(taskId, `Using cached occurrences export (${cachedExport.count} occurrences, exported ${this.#describeAge(cachedExport.exportedAt)})`)
        } else {
            await TaskService.logTaskStep(taskId, 'Exporting occurrences from database')
            await this.#exportOccurrences(taskId)
        }

        // Execute the stewardship report R script
        await this.#logUnmeasuredStep(taskId, 'Creating stewardship report')
        const { success } = await ScriptService.runRScript(
            './src/scripts/stewardshipReports/run.R',
            [ plantListPath, occurrencesPath, inatDirectory, scriptOutputDirectory ],
            { logPath: scriptLogPath, logHeader: logNotes.join('\n'), timeout: scriptTimeout }
        )

        await this.#logUnmeasuredStep(taskId, 'Writing output files')

        // Publish whichever output files exist, so the log is downloadable even when the script fails
        const reportSourcePath = scriptOutputDirectory + 'report.pdf'
        const outputFiles = [
            { sourcePath: reportSourcePath, fileName: `stewardship_report_${task.tag}.pdf`, type: 'report', subtype: 'stewardship' },
            { sourcePath: scriptOutputDirectory + 'plantDataSummary.csv', fileName: `plant_summary_${task.tag}.csv`, type: 'plantSummary' },
            { sourcePath: scriptLogPath, fileName: `stewardship_log_${task.tag}.txt`, type: 'log' }
        ]

        const outputs = []
        for (const { sourcePath, fileName, ...output } of outputFiles) {
            if (fs.existsSync(sourcePath) && FileManager.copyFile(sourcePath, reportsDirectory + fileName)?.success) {
                outputs.push({ uri: `/api/reports/${fileName}`, fileName, ...output })
            }
        }
        await TaskService.updateSubtaskOutputsById(taskId, 'stewardshipReport', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/reports', fileLimits.maxReports)

        if (!success) {
            throw new Error('Stewardship report script failed; see the script log')
        }
        if (!fs.existsSync(reportSourcePath)) {
            throw new Error('Stewardship report script finished without creating a report; see the script log')
        }

        // Clean up temp directory
        fs.rmSync(tempDirectory, { recursive: true, force: true })
    }
}
