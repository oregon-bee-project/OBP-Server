import Crypto from 'node:crypto'

import { fieldNames, subtasks as subtasksConstant } from './constants.js'
import { tokens } from '../config/environment.js'
import { InvalidArgumentError, ValidationError } from './errors.js'

/*
 * includesIllegalSuffix()
 * A boolean function that returns whether a given string contains a street suffix (Road, Rd, Street, St, etc.)
 */
function includesIllegalSuffix(string) {
    if (!string || typeof string !== 'string') { return false }
    // A list of RegExps to detect street suffixes
    const streetSuffixRegexes = [
        'R(?:oa)?d',                    // Road, Rd
        'St(?:r(?:eet)?)?',             // Street, Str, St
        'Av(?:e(?:nue)?)?',             // Avenue, Ave, Av
        'Dr(?:ive)?',                   // Drive, Dr
        'Blvd|Boulevard',               // Boulevard, Blvd
        'C(?:our)?t',                   // Court, Ct
        'Ln|Lane',                      // Lane, Ln
        'County'                        // County
    ].map((regex) => new RegExp(`(?<![^,.\\s])${regex}(?![^,.\\s])`, 'i'))

    return streetSuffixRegexes.some((regex) => regex.test(string))
}

/*
 * getDayOfYear()
 * Calculates the day of the year (1 - 366) of a given Date object
 */
function getDayOfYear(date) {
    if (!(date instanceof Date) || isNaN(date)) {
        return
    }

    const startDate = new Date(date.getFullYear(), 0, 0)
    const dateDifference = date - startDate
    const dayMilliseconds = 1000 * 60 * 60 * 24
    return Math.floor(dateDifference / dayMilliseconds)
}

/*
 * delay()
 * Returns a Promise that resolves after a given number of milliseconds
 */
function delay(mSec) {
    return new Promise(resolve => setTimeout(resolve, mSec))
}

/*
 * getOFV()
 * Looks up the value of an iNaturalist observation field by name
 */
function getOFV(ofvs, fieldName) {
    const ofv = ofvs?.find((field) => field.name === fieldName)
    return ofv?.value ?? ''
}

/*
 * parseQueryParameters()
 * Parses API query parameters into a valid database query
 */
function parseQueryParameters(query, adminId) {
    const params = {
        page: 1,
        pageSize: 50,
        filter: {},
        projection: {
            composite_sort: 0,
            date: 0,
            new: 0,
            scratch: 0
        },
        sortConfig: [ { field: 'composite_sort', direction: 1, type: 'string' } ]
    }

    // Non-admins must query a single userLogin value
    const userLoginQuery = query[fieldNames.iNaturalistAlias]
    if (!adminId && (!userLoginQuery || userLoginQuery.split(',').length > 1)) {
        params.error = {
            status: 401,
            message: 'Unauthorized requests must query a single userLogin'
        }
    }

    // Parse query parameters

    // Fuzzy field number search parameter
    if (query.q) {
        params.filter[fieldNames.fieldNumber] = { $regex: `${query.q}.*` }
    }

    // Pagination parameters
    const parsedPage = parseInt(query.page)
    if (query.page && !isNaN(parsedPage)) {
        params.page = parsedPage
    }

    const parsedPerPage = parseInt(query.per_page)
    if (query.per_page && !isNaN(parsedPerPage)) {
        params.pageSize = Math.min(parsedPerPage, 5000)     // Limit page size to 5000
    }

    // Date parameters
    const startDate = new Date(query.start_date ?? '')
    const endDate = new Date(query.end_date ?? '')
    if (startDate > endDate) {
        params.error = {
            status: 400,
            message: 'start_date must be before end_date'
        }
        return params
    }
    if (startDate.toString() !== 'Invalid Date') {
        if (!params.filter.date) params.filter.date = {}
        
        // Set time to noon UTC to avoid location-based date variance
        startDate.setHours(12, 0, 0, 0)
        params.filter.date.$gte = startDate
    }
    if (endDate.toString() !== 'Invalid Date') {
        if (!params.filter.date) params.filter.date = {}

        // Set time to noon UTC to avoid location-based date variance
        endDate.setHours(12, 0, 0, 0)
        params.filter.date.$lte = endDate
    }

    // Parse field names directly included in the query object
    const queryFields = Object.values(fieldNames).filter((fieldName) => !!query[fieldName] || query[fieldName] === '')
    for (const queryField of queryFields) {
        if (query[queryField] === '(empty)') {
            // The query value '(empty)' is reserved for empty value queries
            params.filter[queryField] = { $in: [ null, '' ] }
        } else if (query[queryField] === '(non-empty)') {
            // The query value '(non-empty)' is reserved for non-empty value queries
            params.filter[queryField] = { $exists: true, $nin: [ null, '' ] }
        } else {
            // Comma-separated multi-value queries (case insensitive)
            const regexes = query[queryField].split(',').map((value) => new RegExp(`^${value}$`, 'i'))
            params.filter[queryField] = { $in: regexes }
        }
    }

    // Sorting parameters
    const sortDirection = query.sort_dir === 'desc' ? -1 : 1
    if (query.sort_by === 'fieldNumber') {
        params.sortConfig = [ { field: 'composite_sort', direction: sortDirection } ]
    } else if (query.sort_by === 'date') {
        // Sort by date, then default
        params.sortConfig = [
            { field: 'date', direction: sortDirection },
            { field: 'composite_sort', direction: 1 }
        ]
    } else if (query.sort_by === 'dateLabelPrint') {
        params.sortConfig = [
            { field: 'dateLabelPrint', direction: sortDirection },
            { field: 'composite_sort', direction: 1 }
        ]
    }

    console.log(params)

    return params
}

/*
 * parseSubtasks()
 * Parses subtasks from a given JSON string, throwing errors if any fields are invalid
 */
function parseSubtasks(subtasksJSON, adminId) {
    if (!subtasksJSON) { throw new InvalidArgumentError('subtasks must exist') }
    
    try {
        const subtasks = JSON.parse(subtasksJSON)

        const subtaskTypes = subtasksConstant.map((subtask) => subtask.type)
        for (let i = 0; i < subtasks.length; i++) {
            const subtask = subtasks[i]
            if (!subtaskTypes.includes(subtask.type)) { throw new ValidationError(`Invalid subtask type '${subtask.type}'`) }

            if (subtask.query) {
                const params = parseQueryParameters(subtask.query, adminId)

                if (params.error) { throw new ValidationError(`Invalid query parameters: ${params.error.message}`) }

                subtasks[i].params = params
            }
            
            if (subtask.type === 'observations') {
                if (!subtask.sources || !subtask.minDate || !subtask.maxDate) {
                    throw new ValidationError('sources, minDate, and maxDate required for observations subtasks')
                }

                // Split the sources string
                subtasks[i].sources = subtask.sources.split(',')

                // Parse minDate and maxDate arguments
                const parsedMinDate = new Date(subtask.minDate)
                const parsedMaxDate = new Date(subtask.maxDate)
                if (parsedMinDate > parsedMaxDate) {
                    throw new ValidationError('minDate must be before maxDate')
                }

                // Format dates how the API (and iNaturalist) expect (YYYY-MM-DD)
                const formattedMinDate = parsedMinDate.toISOString().slice(0, 10)
                const formattedMaxDate = parsedMaxDate.toISOString().slice(0, 10)

                // Modify subtasks with the formatted dates
                subtasks[i].minDate = formattedMinDate
                subtasks[i].maxDate = formattedMaxDate
            }
        }

        return subtasks
    } catch (error) {
        if (error.message?.search('JSON.parse') !== -1) {   // Catch JSON parsing errors
            throw new ValidationError('Invalid JSON in subtasks')
        } else {
            throw error
        }
    }
}

const ALGORITHM = 'aes-256-gcm'
const KEY = Crypto.scryptSync(tokens.secret, tokens.salt, 32)

function encryptObject(object) {
    const iv = Crypto.randomBytes(16)
    const cipher = Crypto.createCipheriv(ALGORITHM, KEY, iv)

    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(object), 'utf8'),
        cipher.final()
    ])
    const authTag = cipher.getAuthTag()

    // Store iv, authTag, and ciphertext together (all needed for decryption)
    return {
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        data: encrypted.toString('hex')
    }
}

function decryptObject(encryptedObject) {
    if (!encryptedObject || !encryptedObject.iv || !encryptedObject.authTag || !encryptedObject.data) return

    const decipher = Crypto.createDecipheriv(
        ALGORITHM,
        KEY,
        Buffer.from(encryptedObject.iv, 'hex')
    )
    decipher.setAuthTag(Buffer.from(encryptedObject.authTag, 'hex'))

    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encryptedObject.data, 'hex')),
        decipher.final()
    ])

    return JSON.parse(decrypted.toString('utf8'))
}

export { includesIllegalSuffix, getDayOfYear, delay, getOFV, parseQueryParameters, parseSubtasks, encryptObject, decryptObject }
