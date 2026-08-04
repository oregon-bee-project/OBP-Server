import { exec } from 'node:child_process'
import { promisify } from 'node:util'

class ScriptService {
    constructor() {
        this.execPromise = promisify(exec)
    }

    async runScript(cmd, scriptPath, args) {
        const command = `${cmd} "${scriptPath}"${args ? ' ' + args.join(' ') : ''}`

        try {
            // TODO: Move these constants into an .env or config file
            const { stdout, stderr } = await this.execPromise(command, {
                maxBuffer: 1024 * 1024 * 10,    // 10 MB buffer limit
                timeout: 300000                 // 5 minute timeout
            })

            return { success: true, stdout, stderr }
        } catch (error) {
            console.error('Script failed:', error)
            
            return { success: false }
        }
    }

    async runRScript(scriptPath, args) {
        return await this.runScript('Rscript', scriptPath, args)
    }
}

export default new ScriptService()
