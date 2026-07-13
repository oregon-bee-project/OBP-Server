import amqp from 'amqplib'

import { messageBroker } from '../shared/lib/config/environment.js'
import { TaskService } from '../shared/lib/services/index.js'
import {
    AddressesSubtaskHandler,
    DeterminationsSubtaskHandler,
    DownloadSubtaskHandler,
    EmailsSubtaskHandler,
    LabelsSubtaskHandler,
    ObservationsSubtaskHandler,
    OccurrencesSubtaskHandler,
    OverwriteSubtaskHandler,
    PivotsSubtaskHandler,
    PlantListSubtaskHandler,
    StewardshipReportSubtaskHandler,
    SyncOccurrencesSubtaskHandler,
    UploadSubtaskHandler
} from './handlers/index.js'

class TaskConsumer {
    constructor() {
        this.connection = null
        this.channel = null
    }

    async connect(retries = 5) {
        try {
            this.connection = await amqp.connect(messageBroker.uri, { heartbeat: 60 })
            this.channel = await this.connection.createChannel()

            await this.channel.assertQueue(messageBroker.queueName, { durable: true })

            // Fair dispatch - don't give new message until previous is processed
            this.channel.prefetch(1)

            console.log('Connected to RabbitMQ')
        } catch (error) {
            if (retries > 0) {
                console.error('RabbitMQ connection failed. Retrying...')
                
                await new Promise(r => setTimeout(r, 2000))
                return this.connect(retries - 1)
            }
            console.error('RabbitMQ connection failed:', error)
            throw error
        }
    }

    async startConsuming() {
        console.log(`Consuming queue '${messageBroker.queueName}'...`)

        await this.channel.consume(messageBroker.queueName, async (msg) => {
            if (!msg) return

            try {
                const taskId = msg.content.toString()

                // ACK immediately to prevent timeout
                this.channel.ack(msg)

                // Handle the task
                await this.handleTask(taskId)                
            } catch (error) {
                console.error('Error processing message:', error)

                // Reject and don't requeue (or requeue for retry)
                this.channel.nack(msg, false, false)
            }
        })
    }

    async handleTask(taskId) {
        console.log(`${new Date().toLocaleTimeString('en-US')} Processing task ${taskId}...`)

        try {
            const task = await TaskService.getTaskById(taskId)

            const addressesHandler = new AddressesSubtaskHandler()
            const determinationsHandler = new DeterminationsSubtaskHandler()
            const downloadHandler = new DownloadSubtaskHandler()
            const emailsHandler = new EmailsSubtaskHandler()
            const labelsHandler = new LabelsSubtaskHandler()
            const observationsHandler = new ObservationsSubtaskHandler()
            const occurrencesHandler = new OccurrencesSubtaskHandler()
            const overwriteHandler = new OverwriteSubtaskHandler()
            const pivotsHandler = new PivotsSubtaskHandler()
            const plantListHandler = new PlantListSubtaskHandler()
            const stewardshipReportHandler = new StewardshipReportSubtaskHandler()
            const syncOccurrencesHandler = new SyncOccurrencesSubtaskHandler()
            const uploadHandler = new UploadSubtaskHandler()

            for (const subtask of task.subtasks) {
                console.log(`\t${new Date().toLocaleTimeString('en-US')} Processing ${subtask.type} subtask...`)

                if (subtask.type === 'addresses') {
                    await addressesHandler.handleTask(task._id)
                } else if (subtask.type === 'determinations') {
                    await determinationsHandler.handleTask(task._id)
                } else if (subtask.type === 'download') {
                    await downloadHandler.handleTask(task._id)
                } else if (subtask.type === 'emails') {
                    await emailsHandler.handleTask(task._id)
                } else if (subtask.type === 'labels') {
                    await labelsHandler.handleTask(task._id)
                } else if (subtask.type === 'observations') {
                    await observationsHandler.handleTask(task._id)
                } else if (subtask.type === 'occurrences') {
                    await occurrencesHandler.handleTask(task._id)
                } else if (subtask.type === 'overwrite') {
                    await overwriteHandler.handleTask(task._id)
                } else if (subtask.type === 'pivots') {
                    await pivotsHandler.handleTask(task._id)
                } else if (subtask.type === 'plantList') {
                    await plantListHandler.handleTask(task._id)
                } else if (subtask.type === 'stewardshipReport') {
                    await stewardshipReportHandler.handleTask(task._id)
                } else if (subtask.type === 'syncOccurrences') {
                    await syncOccurrencesHandler.handleTask(task._id)
                } else if (subtask.type === 'upload') {
                    await uploadHandler.handleTask(task._id)
                }
            }

            await TaskService.completeTaskById(task._id)
        } catch (error) {
            console.error(`Error while processing task ${taskId}:`, error)
            TaskService.failTaskById(taskId)
        }

        console.log(`${new Date().toLocaleTimeString('en-US')} Completed task ${taskId}`)
    }
}

export default TaskConsumer
