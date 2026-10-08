import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { parse as parseAsync } from 'csv-parse'
import { parse as parseSync } from 'csv-parse/sync'
import { stringify as stringifyAsync } from 'csv-stringify'
import { stringify as stringifySync } from 'csv-stringify/sync'

const writeOptions = {
    header: true,
    // columns: header,
    bom: true,
    cast: {
        date: (value) => (value.toISOString())
    }
}

const readOptions = { 
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
    bom: true,
    // Reads in (some) ISO 8601 date strings as proper Date objects
    cast: (value, context) => {
        if (context.header) return value
        return (isISODate(value)) ? new Date(value) : value
    }
}

// Adapted from https://stackoverflow.com/a/52869830 and tested with regexr.com
// Retrieved 2026-07-25, License - CC BY-SA 4.0
function isISODate(date) {
    if (!/\d{4}-\d{2}-\d{2}T(?:\d{2}:\d{2}:\d{2})?(?:.\d{3})?(?:Z|(:?-\d{2}:\d{2}))/.test(date)) {
        return false
    }
  const d = new Date(date)
  return !isNaN(d.getTime())
}


class FileManager {
    constructor() {}

    /*
     * writeJSON()
     * Writes data to a given JSON file path
     */
    writeJSON(filePath, data) {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data || {}))
            return true
        } catch (error) {
            console.error(`Error while attempting to write to '${filePath}':`, error)
            return false
        }
    }

    /*
     * writeCSV()
     * Writes CSV data to a given file path (with a given header)
     */
    writeCSV(filePath, data, header) {
        try {
            const csv = stringifySync(data, writeOptions)
            fs.writeFileSync(filePath, csv)
            return true
        } catch (error) {
            console.error(`Error while attempting to write to '${filePath}':`, error)
            return false
        }
    }

    /*
     * writeCSVFromDatabase()
     * Writes a CSV page-by-page from a database table using a given page query function
     */
    async writeCSVFromDatabase(filePath, header, getPage, updateProgress = null) {
        if (!filePath || !getPage) return

        if (updateProgress) await updateProgress(0)
        
        try {
            // Create an output stringifier
            const outputFileStream = fs.createWriteStream(filePath, { encoding: 'utf-8' })
            const stringifier = stringifyAsync(writeOptions)
            stringifier.pipe(outputFileStream)
        
            // Create a function that guarantees write completion before continuing
            const writeAsync = (stringifier, data) => new Promise((resolve, reject) => {
                stringifier.write(data, (error) => {
                    if (error) reject(error)
                    else resolve()
                })
            })
        
            let pageNumber = 1
            let results = await getPage(pageNumber)

            // Write just the header if there are no documents provided
            if (results.pagination.totalDocuments === 0) {
                return this.writeCSV(filePath, [], header)
            }

            while (pageNumber <= results.pagination.totalPages) {
                for (const document of results.data) {
                    await writeAsync(stringifier, document)
                }

                if (updateProgress) await updateProgress(100 * results.pagination.currentPage / results.pagination.totalPages)
        
                // Query the next page
                results = await getPage(++pageNumber)
            }

            if (updateProgress) await updateProgress(100)

            // Close file stream and return success
            outputFileStream.close()
            return true
        } catch (error) {
            console.error(`Error while attempting to write to '${filePath}' from database:`, error)
            return false
        }
    }

    /*
     * readJSON()
     * Reads data from a given JSON file path; creates a default file if absent and default data is provided
     */
    readJSON(filePath, defaultData) {
        // Create a default file if provided file path does not exist and default data is provided
        if (!fs.existsSync(filePath) && defaultData) {
            this.writeJSON(filePath, defaultData)
        }

        // Read and parse the JSON file
        try {
            const data = fs.readFileSync(filePath)
            return JSON.parse(data)
        } catch (error) {
            console.error(`Error while attempting to read and parse '${filePath}':`, error)
        }
    }

    /*
     * readCSV()
     * Reads and parses CSV data from a given file path; creates a default file if absent and default data is provided
     */
    readCSV(filePath, defaultData, defaultHeader) {
        // Create a default file if provided file path does not exist and default data is provided
        if (!fs.existsSync(filePath) && defaultData) {
            this.writeCSV(filePath, defaultData, defaultHeader)
        }

        try {
            const data = fs.readFileSync(filePath)
            return parseSync(data, readOptions)
        } catch (error) {
            console.error(`Error while attempting to read and parse '${filePath}':`, error)
        }
    }

    /*
     * readCSVChunks()
     * A generator function that reads a given CSV file into memory in chunks of a given size
     */
    async *readCSVChunks(filePath, chunkSize, updateProgress = null) {
        // Check that the input file path exists
        if (!fs.existsSync(filePath)) {
            return []
        }

        if (updateProgress) await updateProgress(0)

        // Create a read stream and add a listener to track progress
        const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' })

        const stats = fs.statSync(filePath)
        const totalSize = stats.size
        let bytesRead = 0
        let lastPercent = -1
        fileStream.on('data', async (chunk) => {
            bytesRead += chunk.length

            const percent = parseFloat((100 * bytesRead / totalSize).toFixed(2))
            if (percent !== lastPercent && updateProgress) {
                await updateProgress(percent)

                lastPercent = percent
            }
        })

        // Create a CSV parser and pipe the file stream into it
        const parser = parseAsync(readOptions)
        const csvStream = fileStream.pipe(parser)

        // Create a chunk to store rows
        let chunk = []

        // Read the file, yielding chunks as they are filled
        for await (const row of csvStream) {
            // Add the current row to the chunk
            chunk.push(row)

            // If the chunk is large enough, yield it and reset the chunk for the next call
            if (chunk.length >= chunkSize) {
                yield chunk
                chunk = []
            }
        }

        // Yield any remaining rows (a partial chunk)
        if (chunk.length > 0) {
            yield chunk
        }

        if (updateProgress) await updateProgress(100)

        // Close file stream
        fileStream.close()
    }

    /*
     * copyFile()
     * Copies a given file to a specified file path (overwrites path if not empty)
     */
    copyFile(sourcePath, destinationPath) {
        try {
            fs.copyFileSync(sourcePath, destinationPath)
            return { success: true }
        } catch (error) {
            console.error(`Failed to copy '${sourcePath}' to '${destinationPath}':`, error)
            return { success: false, error }
        }
    }

    /*
     * compressFile()
     * Compresses a given file to a zip file
     */
    compressFile(filePath) {
        // Check that the input file path exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`)
        }

        const zipName = filePath.replace(/\.[a-zA-Z]+\b/, '.zip')
        const zip = new AdmZip()
    
        zip.addLocalFile(filePath)
        zip.writeZip(zipName)
    }

    /*
     * limitFilesInDirectory()
     * Limits the number of files in a given directory; compresses the least recently edited file if over the limit
     */
    limitFilesInDirectory(directory, maxFiles, options = { archive: true }) {
        const {
            archive = true
        } = options

        try {
            // Read the list of files in the given directory; optionally filter by .zip extension, depending on archive
            let files = fs.readdirSync(directory).filter((file) => !archive || !file.toLowerCase().endsWith('.zip'))
    
            // Delete the least recently edited file while over the limit
            while (files.length > maxFiles) {
                // Use 'stat' to find when the file was last edited
                // Filter to only files (not directories)
                // And find the least recently edited file
                const oldestFile = files
                    .map((f) => ({ name: f, path: path.join(directory, f), stat: fs.statSync(path.join(directory, f)) }))
                    .filter((f) => f.stat.isFile())
                    .reduce((oldest, current) => current.stat.mtimeMs < oldest.stat.mtimeMs ? current : oldest)
                
                // Archive (if applicable) and then 'rm' the least recently edited file
                if (archive) {
                    this.compressFile(oldestFile.path)
                }
                fs.rmSync(oldestFile.path)
                // Reread the list of files in the directory; optionally filter by .zip extension, depending on archive
                files = fs.readdirSync(directory).filter((file) => !archive || !file.toLowerCase().endsWith('.zip'))
            }
        } catch (error) {
            console.error('Error while limiting files in directory:', error)
        }
    }

    /*
     * clearDirectory()
     * Deletes all files in a given directory, but not the directory itself (non-recursive)
     */
    clearDirectory(directory) {
        try {
            // Read the list of files in the given directory
            let files = fs.readdirSync(directory)
    
            // 'rm' each file
            for (const file of files) {
                fs.rmSync(path.join(directory, file))
            }
        } catch (error) {
            console.error('Error while clearing directory:', error)
        }
    }

    /*
     * deleteFile()
     * Deletes a file in the /shared/data directory at a given file path
     */
    deleteFile(filePath) {
        try {
            const parsedPath = path.parse(filePath)

            if (!parsedPath.dir.includes('/shared/data')) throw new Error('Operation only permitted in /shared/data')

            fs.rmSync(filePath)
        } catch (error) {
            console.error('Error while deleting file:', error)
        }
    }
}

export default new FileManager()
