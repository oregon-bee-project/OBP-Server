import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import ScriptService from './ScriptService.js'

// Runs real (tiny) Node child processes in place of Rscript
const runNode = (code: string, options = {}) => ScriptService.runScript(process.execPath, '-e', [code], options)

let directory: string

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'script-service-'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
})

describe('runScript', () => {
    it('logs stdout and stderr after the header', async () => {
        const logPath = path.join(directory, 'log.txt')

        const result = await runNode('console.log("out"); console.error("err")', { logPath, logHeader: 'Skipped 4 observations' })

        expect(result).toEqual({ success: true, logPath })
        const log = fs.readFileSync(logPath, 'utf8')
        expect(log.startsWith('Skipped 4 observations\n\n')).toBe(true)
        expect(log).toContain('out')
        expect(log).toContain('err')
    })

    it('reports a non-zero exit as a failure and notes it in the log', async () => {
        const logPath = path.join(directory, 'log.txt')

        const result = await runNode('process.exit(3)', { logPath })

        expect(result.success).toBe(false)
        expect(fs.readFileSync(logPath, 'utf8')).toContain('Script exited with code 3')
    })

    it('truncates the log at maxLogBytes without stopping the script', async () => {
        const logPath = path.join(directory, 'log.txt')

        const result = await runNode('process.stdout.write("x".repeat(5000))', { logPath, maxLogBytes: 1000 })

        expect(result.success).toBe(true)
        const log = fs.readFileSync(logPath, 'utf8')
        expect(log).toContain('[Log truncated')
        expect(log.length).toBeLessThan(1200)
    })

    it('still runs the script when the log cannot be written', async () => {
        // Without an 'error' listener on the log stream this would crash the
        // whole worker process instead of just losing the log
        const logPath = path.join(directory, 'missing', 'log.txt')

        const result = await runNode('console.log("out")', { logPath })

        expect(result.success).toBe(true)
        expect(fs.existsSync(logPath)).toBe(false)
    })
})
