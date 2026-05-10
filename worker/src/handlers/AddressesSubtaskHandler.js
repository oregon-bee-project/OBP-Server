import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { fieldNames, fileLimits, usernames } from '../../shared/lib/utils/constants.js'
import { OccurrenceService, TaskService, UsernamesService } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'

export default class AddressesSubtaskHandler extends BaseSubtaskHandler {
    constructor() {
        super()
    }

    /* Private Helper Methods */

    /*
     * #writeAddressesFile()
     * Writes user addresses to a CSV file at the given file path
     */
    #writeAddressesFile(filePath, users) {
        const addressFields = [
            usernames.fieldNames.fullName,
            usernames.fieldNames.address,
            usernames.fieldNames.city,
            usernames.fieldNames.stateProvince,
            usernames.fieldNames.zipPostal,
            usernames.fieldNames.country,
        ]

        // Reduce each user object to just the address output fields
        const addresses = users.map((user) => {
            const address = {}
            for (const field of addressFields) {
                address[field] = user[field] ?? ''
            }
            return address
        })

        return FileManager.writeCSV(filePath, addresses, addressFields)
    }

    /* Main Handler Method */

    async handleTask(taskId) {
        if (!taskId) { return }
        
        // Update the current subtask
        await TaskService.updateCurrentSubtaskById(taskId, 'addresses')

        // Fetch the task, subtask, and previous outputs
        const task = await TaskService.getTaskById(taskId)
        const subtask = task.subtasks.find((subtask) => subtask.type === 'addresses')

        // Input and output file names

        // Set the default input file to the file upload
        let inputFilePath = task.upload?.filePath ?? ''
        // If not using the upload file or selection, try to find the specified input file in the previous subtask outputs
        if (subtask.input !== 'upload' && subtask.input !== 'selection') {
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
        const addressesFileName = `addresses_${task.tag}.csv`
        const addressesFilePath = './shared/data/addresses/' + addressesFileName

        await TaskService.logTaskStep(taskId, 'Formatting and uploading provided dataset')
        
        // Delete old scratch space occurrences (from previous tasks)
        await OccurrenceService.deleteOccurrences({ scratch: true })

        if (subtask.input !== 'selection') {
            // Upsert data from the input occurrence file into scratch space (existing records will be moved to scratch space)
            await OccurrenceService.upsertOccurrencesFromFile(inputFilePath, { scratch: true })
        } else {    // subtask.input === 'selection'
            // Move occurrences matching the query parameters into scratch space
            await OccurrenceService.updateOccurrences(subtask.params?.filter ?? {}, { scratch: true })
        }

        await TaskService.logTaskStep(taskId, 'Compiling user mailing addresses')

        // Read users dataset; extract userLogins
        const users = UsernamesService.readUsernames()
        const userLogins = users.map((user) => user[usernames.fieldNames.userLogin])
                                .filter((userLogin) => !!userLogin)

        // Get printable occurrences with known user data; extract iNaturalist aliases (userLogins)
        let printableOccurrences = await OccurrenceService.getPrintableOccurrences({ userLogins: userLogins, scratch: true, ignoreDateLabelPrint: true })
        // In most cases, we only want to output rows which have already been printed
        if (!subtask.includeUnprintedRows) {
            printableOccurrences = printableOccurrences.filter(v => v.dateLabelPrint)
        }
        const aliases = printableOccurrences.map((occurrence) => occurrence[fieldNames.iNaturalistAlias])
                                            .filter((alias) => !!alias)
        
        // Filter user data to only those with userLogins matching printable occurrences
        const filteredUsers = users.filter((user) => aliases.includes(user[usernames.fieldNames.userLogin]))
        
        // Write output file
        this.#writeAddressesFile(addressesFilePath, filteredUsers)

        // Update the task result with the output files
        const outputs = [
            { uri: `/api/addresses/${addressesFileName}`, fileName: addressesFileName, type: 'addresses' }
        ]
        await TaskService.updateSubtaskOutputsById(taskId, 'addresses', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/addresses', fileLimits.maxAddresses)

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
        // Discard remaining scratch space occurrences
        await OccurrenceService.deleteOccurrences({ scratch: true })
    }
}
