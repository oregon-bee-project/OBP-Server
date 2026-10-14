import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { readOnlySubtasks, writeCSVFromRows } from './StewardshipReportSubtaskHandler.js'
import { subtasks } from '../../../shared/lib/utils/constants.js'
import FileManager from '../../../shared/lib/utils/FileManager.js'

describe('writeCSVFromRows', () => {
    let directory: string

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stewardship-export-'))
    })

    afterEach(() => {
        fs.rmSync(directory, { recursive: true, force: true })
    })

    const columns = ['recordedBy', 'genus', 'speciesPlant', 'decimalLatitude']
    const rows = [
        { _id: 'a1', recordedBy: 'Doe, Jane', genus: 'Bombus', speciesPlant: 'Rosa "wild" nutkana', decimalLatitude: '44.5' },
        { _id: 'a2', recordedBy: 'Line\nBreak', genus: 'Osmia', decimalLatitude: '-0.000001' },
        { _id: 'a3', recordedBy: 'Núñez', genus: '', speciesPlant: null, decimalLatitude: '45' },
    ]

    // Pages arrive asynchronously, as they do from the database
    async function* pagedRows(pageSize: number) {
        for (let i = 0; i < rows.length; i += pageSize) {
            await new Promise((resolve) => setTimeout(resolve, 5))
            yield* rows.slice(i, i + pageSize)
        }
    }

    it('writes exactly what FileManager.writeCSV writes, completely, by the time it resolves', async () => {
        // The R script reads the export right after it is written, and it used
        // to be written with FileManager.writeCSV
        const expectedPath = path.join(directory, 'expected.csv')
        const streamedPath = path.join(directory, 'streamed.csv')
        FileManager.writeCSV(expectedPath, rows, columns)

        await writeCSVFromRows(streamedPath, pagedRows(2), columns)

        expect(fs.readFileSync(streamedPath)).toEqual(fs.readFileSync(expectedPath))
    })

    it('writes just the header when there are no rows', async () => {
        const expectedPath = path.join(directory, 'expected.csv')
        const streamedPath = path.join(directory, 'streamed.csv')
        FileManager.writeCSV(expectedPath, [], columns)

        await writeCSVFromRows(streamedPath, [], columns)

        expect(fs.readFileSync(streamedPath)).toEqual(fs.readFileSync(expectedPath))
    })

    it('rejects when the file cannot be written', async () => {
        await expect(writeCSVFromRows(path.join(directory, 'missing', 'export.csv'), pagedRows(2), columns)).rejects.toThrow()
    })

    it('rejects when reading the rows fails', async () => {
        async function* failingRows() {
            yield rows[0]
            throw new Error('database went away')
        }

        await expect(writeCSVFromRows(path.join(directory, 'export.csv'), failingRows(), columns)).rejects.toThrow('database went away')
    })
})

describe('readOnlySubtasks', () => {
    it('only names real subtask types', () => {
        // A misspelled type would never match, so that subtask would quietly
        // force a full occurrences re-export on every report
        const subtaskTypes = subtasks.map((subtask) => subtask.type)
        for (const { type } of readOnlySubtasks) {
            expect(subtaskTypes).toContain(type)
        }
    })

    it('includes the stewardship report itself', () => {
        // Otherwise every report would invalidate the cache for the next one
        expect(readOnlySubtasks).toContainEqual({ type: 'stewardshipReport' })
    })

    it.each([ 'addresses', 'emails', 'labels', 'pivots' ])('only treats %s as read-only with selection input', (type) => {
        // With a file input these upsert the file's values over existing occurrences
        expect(readOnlySubtasks.filter((subtask) => subtask.type === type)).toEqual([ { type, input: 'selection' } ])
    })
})
