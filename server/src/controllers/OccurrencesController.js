import path from 'path'

import { OccurrenceService, TaskService } from '../../shared/lib/services/index.js'
import { InvalidArgumentError, ValidationError } from '../../shared/lib/utils/errors.js'
import { parseQueryParameters } from '../../shared/lib/utils/utilities.js'
import { fieldNames } from '../../shared/lib/utils/constants.js'

export default class OccurrencesController {
    static async getOccurrencesPage(req, res, next) {
        // Parse query parameters
        const params = parseQueryParameters(req.query, req.adminId)

        if (params.error) {
            res.status(params.error.status ?? 400).send({
                error: params.error.message ?? 'Error in query parameters'
            })
        }

        try {
            const occurrencesPage = await OccurrenceService.getOccurrencesPage(params)

            res.status(200).send(occurrencesPage)
        } catch (error) {
            // Forward to 500-code middleware
            next(error)
        }
    }

    static async uploadOccurrences(req, res, next) {
        if (!req.body?.occurrences) {
            res.status(400).send({
                error: 'Missing required request field'
            })
            return
        }

        const results = {
            modifiedCount: 0,
            upsertedCount: 0,
            matchedCount: 0
        }
        // Check that req.body.occurrences is an array
        if (Array.isArray(req.body.occurrences)) {
            // List of fields that do not require authentication to modify
            const noAuthFields = [
                fieldNames.volDetFamily,
                fieldNames.volDetGenus,
                fieldNames.volDetSpecies,
                fieldNames.volDetSex,
                fieldNames.volDetCaste
            ]
            // If no authentication is provided, limit the given 'occurrences' to only the fields that do not require it
            const occurrences = req.body.occurrences
                .filter((element) => typeof element === 'object')   // Filter out non-object elements of the given 'occurrences' array
                .map((object) => {
                    if (!req.adminId) {
                        const projection = { _id: object._id }
                        noAuthFields.forEach((field) => { if (Object.hasOwn(object, field)) projection[field] = object[field] })
                        return projection
                    } else {
                        return object
                    }
                })
                .filter((object) => Object.keys(object).length > 0) // Filter out empty objects
            const jsonResults = await OccurrenceService.upsertOccurrences(occurrences, { skipFormatting: true })

            results.modifiedCount += jsonResults.modifiedCount
            results.upsertedCount += jsonResults.upsertedCount
            results.matchedCount += jsonResults.matchedCount
        }
        
        res.status(200).send(results)
    }

    static async getOccurrencesDownload(req, res, next) {
        // Parse query parameters for validation only
        const params = parseQueryParameters(req.query, req.adminId)

        if (params.error) {
            res.status(params.error.status ?? 400).send({
                error: params.error.message ?? 'Error in query parameters'
            })
        }

        try {
            // Create task and send its ID to the RabbitMQ queue
            const subtasks = [
                {
                    type: 'download',
                    query: req.query,
                    params
                }
            ]
            const { insertedId, createdAt } = await TaskService.createTask(subtasks)

            // Return 'Accepted' response and HATEOAS link
            res.status(202).send({
                uri: `/api/tasks/${insertedId}`,
                createdAt
            })
        } catch (error) {
            if (error instanceof InvalidArgumentError || error instanceof ValidationError) {
                res.status(400).send({
                    error: error.message
                })
            } else {
                // Forward to 500-code middleware
                next(error)
            }
        }
    }

    static async getWorkingFile(req, res, next) {
        // Send workingOccurrences.csv
        res.status(200).sendFile(path.resolve('./shared/data/workingOccurrences.csv'))
    }

    static async uploadWorkingFile(req, res, next) {
        // Check that required field exists
        if (!req.file) {
            res.status(400).send({
                error: 'Missing required request field'
            })
            return
        }

        res.status(200).send()
    }

    static async readWorkingFile(req, res, next) {
        try {
            // Create task and send its ID to the RabbitMQ queue
            const subtasks = [
                {
                    type: 'syncOccurrences',
                    operation: 'read',
                    file: 'workingOccurrences'
                }
            ]
            const { insertedId, createdAt } = await TaskService.createTask(subtasks)

            // Return 'Accepted' response and HATEOAS link
            res.status(202).send({
                uri: `/api/tasks/${insertedId}`,
                createdAt
            })
        } catch (error) {
            if (error instanceof InvalidArgumentError || error instanceof ValidationError) {
                res.status(400).send({
                    error: error.message
                })
            } else {
                // Forward to 500-code middleware
                next(error)
            }
        }
    }

    static async writeWorkingFile(req, res, next) {
        try {
            // Create task and send its ID to the RabbitMQ queue
            const subtasks = [
                {
                    type: 'syncOccurrences',
                    operation: 'write',
                    file: 'workingOccurrences'
                }
            ]
            const { insertedId, createdAt } = await TaskService.createTask(subtasks)

            // Return 'Accepted' response and HATEOAS link
            res.status(202).send({
                uri: `/api/tasks/${insertedId}`,
                createdAt
            })
        } catch (error) {
            if (error instanceof InvalidArgumentError || error instanceof ValidationError) {
                res.status(400).send({
                    error: error.message
                })
            } else {
                // Forward to 500-code middleware
                next(error)
            }
        }
    }

    static async getBackupFile(req, res, next) {
        // Send backupOccurrences.csv
        res.status(200).sendFile(path.resolve('./shared/data/backupOccurrences.csv'))
    }

    static async uploadBackupFile(req, res, next) {
        // Check that required field exists
        if (!req.file) {
            res.status(400).send({
                error: 'Missing required request field'
            })
            return
        }

        res.status(200).send()
    }

    static async readBackupFile(req, res, next) {
        try {
            // Create task and send its ID to the RabbitMQ queue
            const subtasks = [
                {
                    type: 'syncOccurrences',
                    operation: 'read',
                    file: 'backupOccurrences'
                }
            ]
            const { insertedId, createdAt } = await TaskService.createTask(subtasks)

            // Return 'Accepted' response and HATEOAS link
            res.status(202).send({
                uri: `/api/tasks/${insertedId}`,
                createdAt
            })
        } catch (error) {
            if (error instanceof InvalidArgumentError || error instanceof ValidationError) {
                res.status(400).send({
                    error: error.message
                })
            } else {
                // Forward to 500-code middleware
                next(error)
            }
        }
    }

    static async writeBackupFile(req, res, next) {
        try {
            // Create task and send its ID to the RabbitMQ queue
            const subtasks = [
                {
                    type: 'syncOccurrences',
                    operation: 'write',
                    file: 'backupOccurrences'
                }
            ]
            const { insertedId, createdAt } = await TaskService.createTask(subtasks)

            // Return 'Accepted' response and HATEOAS link
            res.status(202).send({
                uri: `/api/tasks/${insertedId}`,
                createdAt
            })
        } catch (error) {
            if (error instanceof InvalidArgumentError || error instanceof ValidationError) {
                res.status(400).send({
                    error: error.message
                })
            } else {
                // Forward to 500-code middleware
                next(error)
            }
        }
    }
}
