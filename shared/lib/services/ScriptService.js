import { spawn } from 'node:child_process'
import fs from 'node:fs'

class ScriptService {
    constructor() {
        // TODO: Move these constants into an .env or config file
        this.defaultTimeout = 300000                // 5 minute timeout
        this.defaultMaxLogBytes = 1024 * 1024 * 10  // 10 MB log limit
    }

    /*
     * runScript()
     * Runs a script, streaming its stdout and stderr (interleaved, as they arrive) into an optional log file
     * that starts with an optional header. Output past maxLogBytes is discarded, but the script keeps running.
     */
    runScript(cmd, scriptPath, args = [], options = {}) {
        const { logPath, logHeader, timeout = this.defaultTimeout, maxLogBytes = this.defaultMaxLogBytes } = options

        return new Promise((resolve) => {
            const log = logPath ? fs.createWriteStream(logPath) : null
            if (logHeader) log?.write(`${logHeader}\n\n`)
            let loggedBytes = 0
            let truncated = false
            let settled = false

            const writeLog = (chunk) => {
                if (!log || truncated) return

                const remainingBytes = maxLogBytes - loggedBytes
                if (chunk.length > remainingBytes) {
                    log.write(chunk.subarray(0, remainingBytes))
                    log.write(`\n[Log truncated at ${maxLogBytes / (1024 * 1024)} MB; further output discarded]\n`)
                    truncated = true
                } else {
                    log.write(chunk)
                }
                loggedBytes += chunk.length
            }

            let timedOut = false
            let timer = null

            const finish = (success, note) => {
                if (settled) return
                settled = true
                clearTimeout(timer)

                if (note) {
                    console.error(`Script '${scriptPath}': ${note}`)
                    log?.write(`\n${note}\n`)
                }
                if (log) {
                    log.end(() => resolve({ success, logPath }))
                } else {
                    resolve({ success })
                }
            }

            // Arguments are passed directly (no shell), so they need no quoting. The script runs in its own
            //  process group so a timeout also stops anything it started (e.g. pandoc and LaTeX for R reports),
            //  and gets no stdin so nothing it starts can wait on input
            const child = spawn(cmd, [scriptPath, ...args], { detached: true, stdio: [ 'ignore', 'pipe', 'pipe' ] })

            timer = setTimeout(() => {
                timedOut = true
                try {
                    process.kill(-child.pid, 'SIGKILL')
                } catch (error) {
                    console.error('Failed to stop timed out script:', error)
                }
            }, timeout)

            // Both streams are always drained, even once the log is full, so the script never blocks on output
            child.stdout.on('data', writeLog)
            child.stderr.on('data', writeLog)

            child.on('error', (error) => {
                finish(false, `Script failed to start: ${error.message}`)
            })

            child.on('close', (code) => {
                if (timedOut) {
                    finish(false, `Script stopped after reaching the ${timeout / 1000} second time limit`)
                } else if (code === 0) {
                    finish(true)
                } else {
                    finish(false, `Script exited with code ${code}`)
                }
            })
        })
    }

    async runRScript(scriptPath, args, options) {
        return await this.runScript('Rscript', scriptPath, args, options)
    }
}

export default new ScriptService()
