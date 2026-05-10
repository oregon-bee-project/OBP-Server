import fs from 'fs'
import fontkit from '@pdf-lib/fontkit'
import { PageSizes, PDFDocument, degrees } from 'pdf-lib'
import { datamatrixrectangularextension } from 'bwip-js/node'

import BaseSubtaskHandler from './BaseSubtaskHandler.js'
import { abbreviations, fieldNames, fileLimits, template } from '../../shared/lib/utils/constants.js'
import { ApiService, TaskService, OccurrenceService } from '../../shared/lib/services/index.js'
import FileManager from '../../shared/lib/utils/FileManager.js'

export default class LabelsSubtaskHandler extends BaseSubtaskHandler {
    constructor() {
        super()
    }

    /* Private Fields */

    // Number of rows of labels
    #nRows = 25
    // Number of columns of labels
    #nColumns = 10

    // Conversion rate from PostScript points (the standard unit of pdf-lib) to inches
    #PostScriptPointsPerInch = 72

    // Paper dimensions in PostScript points
    #letterPaperWidth = 8.5 * this.#PostScriptPointsPerInch
    #letterPaperHeight = 11 * this.#PostScriptPointsPerInch

    // Paper margins in PostScript points
    #horizontalMargin = 0.25 * this.#PostScriptPointsPerInch
    #verticalMargin = 0.5 * this.#PostScriptPointsPerInch

    // Label dimensions in PostScript points
    #labelWidth = 0.666 * this.#PostScriptPointsPerInch
    #labelHeight = 0.311 * this.#PostScriptPointsPerInch

    // Horizontal and vertical spacing between labels in PostScript points
    // Calculated as an even distribution of the paper space after subtracting the margins and label dimensions
    #horizontalSpacing = (this.#letterPaperWidth - (2 * this.#horizontalMargin) - (this.#nColumns * this.#labelWidth)) / (this.#nColumns - 1)
    #verticalSpacing = (this.#letterPaperHeight - (2 * this.#verticalMargin) - (this.#nRows * this.#labelHeight)) / (this.#nRows - 1)

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
     * #createLabelFromOccurrence()
     * Creates an object containing formatted label fields from a given occurrence object
     */
    #createLabelFromOccurrence(occurrence) {
        // Roman numerals 1 to 12 (for date formatting)
        const monthNumerals = [ 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII' ]

        const label = {}

        // Location field
        const country = occurrence[fieldNames.country]
        const stateProvince = occurrence[fieldNames.stateProvince]
        let formattedCounty = abbreviations.counties[occurrence[fieldNames.county].trim()] ?? occurrence[fieldNames.county].trim()
        formattedCounty = formattedCounty ? `:${formattedCounty}${country === 'USA' ? 'Co' : ''}` : ''
        const locality = occurrence[fieldNames.locality]
        const locationText = `${country}:${stateProvince}${formattedCounty} ${locality}`
        label.location = locationText

        // Coordinates field
        const latitude = parseFloat(occurrence[fieldNames.latitude]).toFixed(3).toString()
        const longitude = parseFloat(occurrence[fieldNames.longitude]).toFixed(3).toString()
        const elevation = occurrence[fieldNames.elevation] ? ` ${occurrence[fieldNames.elevation]}m` : ''
        const coordinatesText = `${latitude} ${longitude}${elevation}`
        label.coordinates = coordinatesText

        // Date field
        const day1 = occurrence[fieldNames.day]
        const month1 = monthNumerals[occurrence[fieldNames.month] - 1] ?? ''
        const year = occurrence[fieldNames.year]
        // Optional second date (for trap observations)
        const day2 = occurrence[fieldNames.day2]
        const month2 = monthNumerals[occurrence[fieldNames.month2] - 1]
        const duration = `-${day2}.${month2}`
        // Sample and specimen IDs
        const sampleID = occurrence[fieldNames.sampleId].replace('-', '')
        const specimenId = occurrence[fieldNames.specimenId] ? `.${occurrence[fieldNames.specimenId]}` : ''
        const dateText = `${day1}.${month1}${(day2 && month2) ? duration : ''}${year}-${sampleID}${specimenId}`
        label.date = dateText

        // Collector field
        const firstNameInitial = occurrence[fieldNames.firstNameInitial]
        const lastName = occurrence[fieldNames.lastName]
        const nameText = `${firstNameInitial}${lastName}`
        label.name = nameText

        // Collection method field
        let methodText = occurrence[fieldNames.samplingProtocol].toLowerCase() ?? ''
        if (methodText.includes('net')) { methodText = 'net' }
        if (methodText.includes('trap')) { methodText = 'trap' }
        if (methodText.includes('nest')) { methodText = 'nest' }
        label.method = methodText

        // Field number field
        const numberText = occurrence[fieldNames.fieldNumber] ?? ''
        label.number = numberText

        return label
    }

    /*
    * #createLabelsFromOccurrences()
    * Formats the given occurrences into label fields and updates warnings
    */
    #createLabelsFromOccurrences(occurrences, addWarning) {
        if (!occurrences) return

        // Optional fields that should throw warnings
        const warningFields = [
            fieldNames.county
        ]

        const labels = []
        const warningLabels = []
        for (const occurrence of occurrences) {
            const label = this.#createLabelFromOccurrence(occurrence)
            labels.push(label)

            // Add warnings for falsy warningFields and fields that are too long (highly specific, may need tuning)
            const warningReasons = warningFields.filter((field) => !occurrence[field])
            if (label.location.length > 38 ||
                label.name.length > 22 ||
                label.method.length > 5
            ) {
                warningReasons.push('field length')
            }
            if (warningReasons.length > 0) {
                addWarning(occurrence[fieldNames.fieldNumber], warningReasons.join(', '))
                warningLabels.push(label)
            }
        }

        return { labels, warningLabels }
    }

    /*
     * #partitionLabels()
     * Inserts blank records between labels with different collectors for spacing
     */
    #partitionLabels(labels) {
        if (!labels) return

        const partitionedLabels = []

        // Iterate through each label and look ahead one to determine if the collectors are different
        for (let i = 0; i < labels.length; i++) {
            partitionedLabels.push(labels[i])

            if (labels[i + 1] && labels[i].name !== labels[i + 1].name) {
                partitionedLabels.push({ blank: true })
            }
        }

        return partitionedLabels
    }

    /*
     * #addTextBox()
     * Adds a text box to the given PDFPage with the given specifications
     * 1.    text: The text to include in the text box
     * 2, 3. basisX, basisY: Coordinates (in PostScript points) of the lower left corner of the box
     * 4.    textBoxLayout: An object containing text formatting information
     */
    #addTextBox(page, text, basisX, basisY, textBoxLayout) {
        // An optional bounding rectangle for making adjustments to the layout
        // page.drawRectangle({
        //     x: basisX + textBoxLayout.x,
        //     y: basisY + textBoxLayout.y,
        //     width: textBoxLayout.width,
        //     height: textBoxLayout.height,
        //     rotate: degrees(textBoxLayout.rotation),
        //     borderWidth: 0.1,
        //     opacity: 0
        // })

        // Handle automatic text fitting
        let fontSize = textBoxLayout.fontSize
        let lineHeight = textBoxLayout.lineHeight
        let xOffset = textBoxLayout.offset.x
        let yOffset = textBoxLayout.offset.y
        if (textBoxLayout.fit) {
            // The width (in PostScript points) of the text at fontSize with no line wrapping
            let singleLineWidth = textBoxLayout.font.widthOfTextAtSize(text, fontSize)
            // Guess the number of lines the text will wrap to when constrained to textBoxLayout.width
            const spaces = text.match(/ /g)?.length || 0
            let approximateNumberOfLines = Math.min(spaces + 1, Math.ceil(singleLineWidth / textBoxLayout.width))
            // The height (in PostScript points) of a single line of text at fontSize
            let singleLineHeight = textBoxLayout.font.heightAtSize(fontSize, { descender: true })
            // The approximate height of the text with wrapping
            let approximateHeight = approximateNumberOfLines * singleLineHeight

            // If the text is a single line, reduce the font size to fit the text box width
            // Otherwise, fit the text box height
            // Keep the font size at least 1 PostScript point
            while (
                (approximateNumberOfLines === 1 && singleLineWidth > textBoxLayout.width) ||
                (approximateNumberOfLines > 1 && approximateHeight > textBoxLayout.height) &&
                fontSize > 1
            ) {
                // Decrement the font size
                fontSize -= 0.01
                // For the Gill Sans font, the line height should be ~85% of the font size
                lineHeight = fontSize

                // Recalculate the approximate height and width of the text for the new font size
                singleLineWidth = textBoxLayout.font.widthOfTextAtSize(text, fontSize)
                approximateNumberOfLines = text.match(/ /g) ? Math.ceil(singleLineWidth / textBoxLayout.width) : 1
                singleLineHeight = textBoxLayout.font.heightAtSize(fontSize, { descender: true })
                approximateHeight = approximateNumberOfLines * singleLineHeight

                // Adjust the text offset to prevent text overflow
                if (textBoxLayout.rotation === 0) {
                    yOffset = (textBoxLayout.height - approximateHeight) * -0.5 - singleLineHeight * 0.8
                } else if (textBoxLayout.rotation === 90) {
                    xOffset = (textBoxLayout.height - approximateHeight) * -0.5
                }
            }
        }

        // Add the text box to the page
        page.drawText(text, {
            x: basisX + textBoxLayout.x + xOffset,
            y: basisY + textBoxLayout.y + textBoxLayout.height + yOffset,
            font: textBoxLayout.font,
            size: fontSize,
            lineHeight: lineHeight,
            rotate: degrees(textBoxLayout.rotation),
            maxWidth: textBoxLayout.width
        })
    }

    /*
     * #addDataMatrix()
     * Adds a 8x18 data matrix bar code to the given PDFPage with the given specifications
     * 1.    text: The text to encode in the data matrix
     * 2, 3. basisX, basisY: Coordinates (in PostScript points) of the lower left corner of the box
     * 4.    dataMatrixLayout: An object containing dimension and position data
     */
    async #addDataMatrix(page, text, basisX, basisY, dataMatrixLayout) {
        // An optional bounding rectangle for making adjustments to the layout
        // page.drawRectangle({
        //     x: basisX + dataMatrixLayout.x,
        //     y: basisY + dataMatrixLayout.y,
        //     width: dataMatrixLayout.width,
        //     height: dataMatrixLayout.height,
        //     borderWidth: 0.1,
        //     opacity: 0
        // })

        // Extract only numeric characters from given text
        const number = parseInt(text?.replace(/\D/g, ''))
        
        // Create the data matrix PNG from the text
        const png = await datamatrixrectangularextension({
            text: isNaN(number) ? text : number.toString(),     // Use original text if no number could be extracted
            version: '8x18',
            rotate: 'L'
        })
        // Embed the image
        const image = await page.doc.embedPng(png)
        // Scale the image to the given dimensions
        const scaledDimensions = image.scaleToFit(dataMatrixLayout.width, dataMatrixLayout.height)
        // Add the image at the given position
        page.drawImage(image, {
            x: basisX + dataMatrixLayout.x,
            y: basisY + dataMatrixLayout.y,
            width: scaledDimensions.width,
            height: scaledDimensions.height
        })
    }

    /*
     * #addLabel()
     * Adds a label for the given label data to the PDFPage at the given position
     */
    async #addLabel(page, label, basisX, basisY, fonts) {
        // An optional bounding rectangle for making adjustments to the layout
        // page.drawRectangle({
        //     x: basisX,
        //     y: basisY,
        //     width: labelWidth,
        //     height: labelHeight,
        //     borderWidth: 0.1,
        //     opacity: 0
        // })

        // Define the layout for the location label field
        const locationText = label.location ?? ''
        const locationLayout = {
            x: 0.005 * this.#PostScriptPointsPerInch,
            y: 0.18525 * this.#PostScriptPointsPerInch,
            width: 0.46 * this.#PostScriptPointsPerInch,
            height: 0.12075 * this.#PostScriptPointsPerInch,
            font: fonts.oxygenMonoFont,
            fontSize: 3,
            lineHeight: 3,
            rotation: 0,
            offset: {
                x: 0,
                y: -2.3,
            }
        }
        // Add the location field to the page
        this.#addTextBox(page, locationText, basisX, basisY, locationLayout)

        // Define the layout for the coordinates label field
        const coordinatesText = label.coordinates ?? ''
        const coordinatesLayout = {
            x: 0.005 * this.#PostScriptPointsPerInch,
            y: 0.145 * this.#PostScriptPointsPerInch,
            width: 0.46 * this.#PostScriptPointsPerInch,
            height: 0.04025 * this.#PostScriptPointsPerInch,
            font: fonts.oxygenMonoFont,
            fontSize: 3,
            lineHeight: 3,
            rotation: 0,
            offset: {
                x: 0,
                y: -2.3,
            },
            fit: true
        }
        // Add the coordinates field to the page
        this.#addTextBox(page, coordinatesText, basisX, basisY, coordinatesLayout)

        // Define the layout for the date label field
        const dateText = label.date ?? ''
        const dateLayout = {
            x: 0.005 * this.#PostScriptPointsPerInch,
            y: 0.075 * this.#PostScriptPointsPerInch,
            width: 0.46 * this.#PostScriptPointsPerInch,
            height: 0.07 * this.#PostScriptPointsPerInch,
            font: fonts.oxygenMonoFont,
            fontSize: 5,
            lineHeight: 5,
            rotation: 0,
            offset: {
                x: 0,
                y: -0.056 * this.#PostScriptPointsPerInch
            },
            fit: true
        }
        // Add the date field to the page
        this.#addTextBox(page, dateText, basisX, basisY, dateLayout)

        // Define the layout for the collector name label field
        const nameText = label.name ?? ''
        const nameLayout = {
            x: 0.005 * this.#PostScriptPointsPerInch,
            y: 0.005 * this.#PostScriptPointsPerInch,
            width: 0.335 * this.#PostScriptPointsPerInch,
            height: 0.07 * this.#PostScriptPointsPerInch,
            font: fonts.oxygenMonoFont,
            fontSize: 5,
            lineHeight: 5,
            rotation: 0,
            offset: {
                x: 0,
                y: -0.056 * this.#PostScriptPointsPerInch
            },
            fit: true
        }
        // Add the collector name field to the page
        this.#addTextBox(page, nameText, basisX, basisY, nameLayout)

        // Define the layout for the collection method label field
        const methodText = label.method ?? ''
        const methodLayout = {
            x: 0.36 * this.#PostScriptPointsPerInch,
            y: 0.005 * this.#PostScriptPointsPerInch,
            width: 0.105 * this.#PostScriptPointsPerInch,
            height: 0.07 * this.#PostScriptPointsPerInch,
            font: fonts.oxygenMonoFont,
            fontSize: 5,
            lineHeight: 5,
            rotation: 0,
            offset: {
                x: 0,
                y: -0.056 * this.#PostScriptPointsPerInch
            },
            fit: true
        }
        // Add the collection method field to the page
        this.#addTextBox(page, methodText, basisX, basisY, methodLayout)

        // Define the layout for the field number label field
        const numberText = label.number ?? ''
        const numberLayout = {
            x: 0.661 * this.#PostScriptPointsPerInch,
            y: 0.005 * this.#PostScriptPointsPerInch,
            width: this.#labelHeight - 0.01 * this.#PostScriptPointsPerInch,
            height: 0.07 * this.#PostScriptPointsPerInch,
            font: fonts.oxygenMonoFont,
            fontSize: 4.5,
            lineHeight: 4.5,
            rotation: 90,
            offset: {
                x: -0.75,
                y: -5,
            },
            fit: true
        }
        // Add the field number field to the page
        this.#addTextBox(page, numberText, basisX, basisY, numberLayout)

        // Define the layout for the data matrix
        const dataMatrixLayout = {
            x: 0.476 * this.#PostScriptPointsPerInch,
            y: 0.005 * this.#PostScriptPointsPerInch,
            width: 0.11 * this.#PostScriptPointsPerInch,
            height: this.#labelHeight - 0.01 * this.#PostScriptPointsPerInch
        }
        // Add the data matrix to the page
        await this.#addDataMatrix(page, numberText, basisX, basisY, dataMatrixLayout)
    }

    /*
     * #getFontData()
     * Reads a given font file from the local disk
     */
    async #getFontData(fileKey) {
        const filePath = './shared/data/' + fileKey

        return fs.readFileSync(filePath)
    }

    /*
     * #writePDFPage()
     * Creates a PDFPage in the given PDFDocument and populates it with labels
     */
    async #writePDFPage(doc, labels, updateProgress) {
        await updateProgress(0)

        // Create the PDFPage
        const page = doc.addPage(PageSizes.Letter)

        // Register and embed the fonts
        doc.registerFontkit(fontkit)
        const oxygenMonoData = await this.#getFontData('fonts/OxygenMono-Regular.ttf')
        const oxygenMonoFont = await doc.embedFont(oxygenMonoData)

        // Add a label for each formatted occurrence in rows and columns
        for (let i = 0; i < labels.length; i++) {
            // Skip blank partition records
            if (labels[i].blank) {
                continue
            }

            // Calculate the current row and column
            const currentRow = this.#nRows - Math.floor(i / this.#nColumns) - 1
            const currentColumn = i % this.#nColumns

            // Calculate the position of the current label (lower left corner)
            const basisX = this.#horizontalMargin + (currentColumn * (this.#labelWidth + this.#horizontalSpacing))
            const basisY = this.#verticalMargin + (currentRow * (this.#labelHeight + this.#verticalSpacing))

            // Add the label
            await this.#addLabel(page, labels[i], basisX, basisY, { oxygenMonoFont })

            // Provide a progress update
            updateProgress(100 * i / labels.length)
        }
    }

    /*
     * #writePDF()
     * Creates a PDFDocument, populates it with labels, and writes it to the given file path
     */
    async #writePDF(filePath, labels, updateProgress) {
        await updateProgress(0)

        // Paginate the data
        const pageSize = this.#nRows * this.#nColumns
        const totalPages = Math.ceil(labels.length / pageSize)
        let pageStart = 0
        let pageEnd = Math.min(pageSize, labels.length)
        let currentPage = 1

        // Create the output PDF
        const doc = await PDFDocument.create()
        
        // Add pages of labels
        for (let i = 0; i < totalPages; i++) {
            await this.#writePDFPage(doc, labels.slice(pageStart, pageEnd), async (percentage) => {
                await updateProgress((100 * i + percentage) / totalPages)
            })

            // Update the partition markers
            pageStart = pageEnd
            pageEnd = Math.min(pageEnd + pageSize, labels.length)
            currentPage++
        }

        // Write the document to the given file path
        const docBuffer = await doc.save()
        fs.writeFileSync(filePath, docBuffer)

        await updateProgress(100)
    }

    /* Main Handler Method */

    async handleTask(taskId) {
        if (!taskId) { return }

        // Update the current subtask
        await TaskService.updateCurrentSubtaskById(taskId, 'labels')

        // Fetch the task, subtask, and previous outputs
        const task = await TaskService.getTaskById(taskId)
        const subtask = task.subtasks.find((subtask) => subtask.type === 'labels')

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
        const labelsFileName = `labels_${task.tag}.pdf`
        const labelFilePath = './shared/data/labels/' + labelsFileName
        const warningLabelsFileName = `labels_warnings_${task.tag}.pdf`
        const warningLabelsFilePath = './shared/data/labels/' + warningLabelsFileName
        const occurrencesFileName = `occurrences_printed_${task.tag}.csv`
        const occurrencesFilePath = './shared/data/occurrences/' + occurrencesFileName
        const flagsFileName = `flags_unprintable_${task.tag}.csv`
        const flagsFilePath = './shared/data/flags/' + flagsFileName

        await TaskService.logTaskStep(taskId, 'Formatting and uploading provided dataset')

        // Delete old scratch space occurrences (from previous tasks)
        await OccurrenceService.deleteOccurrences({ scratch: true })

        if (inputFilePath) {    // subtask.input is either 'upload' or a previous subtask's output file
            if (subtask.excludeOutput) {
                // Insert new occurrences from the input file into scratch space; ignore existing occurrences
                await OccurrenceService.createOccurrencesFromFile(inputFilePath, { scratch: true })
            } else {
                // Upsert data from the input occurrence file into scratch space (existing records will be moved to scratch space)
                await OccurrenceService.upsertOccurrencesFromFile(inputFilePath, { scratch: true })
            }
        } else if (subtask.input === 'selection' && !subtask.excludeOutput) {
            // Existing occurrences are not allowed to be excluded from the database
            // The scratch space will be empty if input === 'selection' and excludeOutput === true

            // Move occurrences matching the query parameters into scratch space
            await OccurrenceService.updateOccurrences(subtask.params?.filter ?? {}, { scratch: true })
        }

        // Find the set of printable occurrences
        const printableOccurrences = await OccurrenceService.getPrintableOccurrences({ scratch: true, ignoreDateLabelPrint: subtask.ignoreDateLabelPrint })

        // Calculate the number of unprintable occurrences that were filtered out and add a warning message
        const numFilteredOut = await OccurrenceService.count({ scratch: true }) - printableOccurrences.length

        const warnings = [
            `Filtered out ${numFilteredOut} occurrences that were already printed or had faulty data.`
        ]

        // Filter and process the occurrences into formatted label fields and check the data for warnings
        let warningIds = []
        const { labels, warningLabels } = this.#createLabelsFromOccurrences(printableOccurrences, (warningId, reason) => {
            warningIds.push(`${warningId}${reason ? ` (${reason})` : ''}`)
        })
        if (warningIds.length > 0) {
            warnings.push(`Potentially incompatible data for occurrences: [ ${warningIds.join(', ')} ]`)
        }

        // Display warnings
        await TaskService.updateWarningsById(taskId, warnings)

        // Add blank partitions to labels for spacing
        const partitionedLabels = this.#partitionLabels(labels)

        await TaskService.logTaskStep(taskId, 'Generating label PDFs')

        // Write the labels PDF
        await this.#writePDF(labelFilePath, partitionedLabels, this.#createUpdateProgressFn(taskId))

        // Generate a warning labels PDF if there are any labels with warnings
        if (warningLabels.length > 0) {
            // Add blank partitions to warning labels for spacing
            const partitionedWarningLabels = this.#partitionLabels(warningLabels)

            await TaskService.logTaskStep(taskId, 'Generating PDF of labels with warnings')

            // Write the warning labels PDF
            await this.#writePDF(warningLabelsFilePath, partitionedWarningLabels, this.#createUpdateProgressFn(taskId))
        }

        await TaskService.logTaskStep(taskId, 'Writing output files')

        // Upload labels file to the Google Drive (if authorized and not blank)
        if (partitionedLabels.length > 0) {
            await ApiService.uploadFileToGoogleDrive(labelFilePath, this.#createUpdateProgressFn(taskId))
        }

        // Update the dateLabelPrint field of the printed occurrences
        const printedIds = printableOccurrences.map((occurrence) => occurrence._id)
        const printedFilter = { _id: { $in: printedIds } }
        // Format the date to DD-MMM-YY (e.g. 31-Jan-26)
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
            year: '2-digit',
            month: 'short',
            day: 'numeric'
        })
        const dateParts = dateFormatter.formatToParts(new Date())
        const day = dateParts.find(({ type }) => type === 'day').value
        const month = dateParts.find(({ type }) => type === 'month').value
        const year = dateParts.find(({ type }) => type === 'year').value
        const dateLabelPrint = `${day}-${month}-${year}`
        await OccurrenceService.updateOccurrences(printedFilter, { [fieldNames.dateLabelPrint]: dateLabelPrint })

        // Write printed occurrences file
        await OccurrenceService.writeOccurrencesFromDatabase(occurrencesFilePath, printedFilter, {}, this.#createUpdateProgressFn(taskId))

        // Write the flags file
        const flags = await OccurrenceService.getUnprintableOccurrences({ scratch: true, ignoreDateLabelPrint: true })
        FileManager.writeCSV(flagsFilePath, flags, Object.keys(template))

        // Update the task result with the output files
        const outputs = [
            { uri: `/api/labels/${labelsFileName}`, fileName: labelsFileName, type: 'labels' },
            { uri: `/api/occurrences/${occurrencesFileName}`, fileName: occurrencesFileName, type: 'occurrences', subtype: 'printed' },
            { uri: `/api/flags/${flagsFileName}`, fileName: flagsFileName, type: 'flags', subtype: 'unprintable' }
        ]
        if (warningLabels.length > 0) {
            outputs.push({ uri: `/api/labels/${warningLabelsFileName}`, fileName: warningLabelsFileName, type: 'labels', subtype: 'warnings' })
        }
        await TaskService.updateSubtaskOutputsById(taskId, 'labels', outputs)

        // Archive excess output files
        FileManager.limitFilesInDirectory('./shared/data/labels', fileLimits.maxLabels)
        FileManager.limitFilesInDirectory('./shared/data/occurrences', fileLimits.maxOccurrences)
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
