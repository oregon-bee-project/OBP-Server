import fs from 'fs'

import { TaskRepository } from '../repositories/index.js'
import QueueManager from '../messaging/QueueManager.js'

class TaskService {
    constructor() {
        this.repository = new TaskRepository()
    }

    /*
     * createTask()
     * Creates a new task with the given properties
     */
    async createTask(subtasks, uploadFileName) {
        // Create a formatted timestamp of the task's creation time (set the default tag to it)
        const createdAt = new Date()
        const tag = createdAt.toISOString().slice(0, -5).replaceAll(':', '.')   // ISO minus milliseconds, replace : with .
        const name = `task_${tag}`

        const task = {
            name,
            tag,
            subtasks,
            status: 'Pending',
            createdAt: createdAt.toISOString()
        }
        // Set the upload file if provided
        if (uploadFileName) {
            const uploadFilePath = `./shared/data/uploads/${uploadFileName}`
            const uploadUri = `/api/uploads/${uploadFileName}`
            task.upload = {
                fileName: uploadFileName,
                filePath: uploadFilePath,
                uri: uploadUri
            }
        }
        // Set the first subtask as the current one
        if (subtasks.length > 0) {
            task.progress = {
                currentSubtask: subtasks[0]?.type
            }
        }

        // Create the task
        const insertedId = await this.repository.create(task)

        // Publish task ID to RabbitMQ queue
        await QueueManager.publishMessage(insertedId.toString())

        return {
            insertedId,
            createdAt: task.createdAt
        }
    }

    /*
     * getTasks()
     * Finds all tasks
     */
    async getTasks() {
        return await this.repository.findMany({}, {}, { 'createdAt': -1 })
    }

    /*
     * hasStartedTasksSince()
     * Returns whether any task created after a given ISO timestamp has started (is no longer pending) and has a
     *  subtask matching none of the given subtask conditions (e.g. [ { type: 'download' }, { type: 'labels', input: 'selection' } ])
     */
    async hasStartedTasksSince(isoDate, excludedSubtasks = []) {
        const task = await this.repository.findOne({
            createdAt: { $gt: isoDate },
            status: { $ne: 'Pending' },
            // $nor can't be empty, and with nothing excluded any subtask counts
            subtasks: { $elemMatch: excludedSubtasks.length > 0 ? { $nor: excludedSubtasks } : { type: { $exists: true } } }
        })

        return !!task
    }

    /*
     * getTaskById()
     * Finds a specific task by its Mongo ID
     */
    async getTaskById(id) {
        return await this.repository.findById(id)
    }

    /*
     * logTaskStep()
     * Updates a given task's current step message and logs the same message to the console
     */
    async logTaskStep(id, message) {
        const task = await this.repository.findById(id)

        await this.updateProgressById(id, { ...task?.progress, currentStep: message })
        console.log(`\t\t${message}...`)
    }

    /*
     * completeTaskById()
     * Sets the status field of a task selected by ID to 'Completed'
     */
    async completeTaskById(id) {
        return await this.repository.completeById(id)
    }

    /*
     * updateCurrentSubtaskById()
     * Sets the currentSubtask field of a task selected by ID to the given value
     */
    async updateCurrentSubtaskById(id, subtask) {
        const task = await this.repository.findById(id)

        return await this.repository.updateProgressById(id, {
            ...task?.progress,
            currentSubtask: subtask
        })
    }

    /*
     * updateProgressById()
     * Updates the progress field of a task selected by ID; sets the status to 'Running'
     */
    async updateProgressById(id, progress) {
        return await this.repository.updateProgressById(id, progress)
    }

    /*
     * updateProgressPercentageById()
     * Updates the progress.percentage field of a task selected by ID; sets the status to 'Running'
     */
    async updateProgressPercentageById(id, percentage) {
        if (percentage === null || percentage === undefined || percentage === NaN) return

        const task = await this.repository.findById(id)

        const formattedPercentage = typeof percentage === 'number' && !isNaN(parseFloat(percentage))
            ? `${percentage.toFixed(2)}%`
            : percentage

        return await this.repository.updateProgressById(id, {
            ...task?.progress,
            percentage: formattedPercentage
        })
    }

    /*
     * updateWarningsById()
     * Updates the warnings field of a task selected by ID
     */
    async updateWarningsById(id, warnings) {
        return await this.repository.updateWarningsById(id, warnings)
    }

    /*
     * updateSubtaskOutputsById()
     * Updates the output field of a given subtask in a task selected by ID; unsets the task's progress field
     */
    async updateSubtaskOutputsById(id, subtaskType, outputs) {
        return await this.repository.updateSubtaskOutputsById(id, subtaskType, outputs)
    }

    /*
     * failTaskById()
     * Sets the status field of a task selected by ID to 'Failed'
     */
    async failTaskById(id) {
        return await this.repository.failById(id)
    }

    /*
     * deleteTasks()
     * Deletes all tasks
     */
    async deleteTasks() {
        return await this.repository.deleteMany()
    }

    /*
     * deleteTasksWithoutFiles()
     * Deletes all tasks with non-existent 'dataset' or 'result' files
     */
    async deleteTasksWithoutFiles() {
        // Find tasks with missing files (dataset or result)
        const tasks = await this.repository.findMany()
        const taskIdsWithoutFiles = tasks
            .filter((t) =>
                (t.status !== 'Completed' && !fs.existsSync(t.dataset)) ||
                (t.result?.subtaskOutputs?.some((s) => s.outputs?.some((o) => !fs.existsSync(`./shared/data/${o.type}/${o.fileName}`))))
            )
            .map((t) => t._id)

        // Delete tasks with missing files
        return await this.repository.deleteMany({ _id: { $in: taskIdsWithoutFiles } })
    }
}

export default new TaskService()