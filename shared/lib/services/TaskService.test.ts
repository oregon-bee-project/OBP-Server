import { describe, it, expect, vi, afterEach } from 'vitest'
import { ObjectId } from 'mongodb'

// Like the other service singletons, TaskService only stores its collection
// *name* until a query runs, so spying on the repository keeps Mongo out of it.
import TaskService from './TaskService.js'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('hasStartedTasksSince', () => {
    const exportedAt = '2026-10-13T19:45:00.000Z'

    it('looks for started tasks created after the timestamp with a subtask matching none of the excluded ones', async () => {
        const findOne = vi.spyOn(TaskService.repository, 'findOne').mockResolvedValue(null)
        const excludedSubtasks = [ { type: 'download' }, { type: 'labels', input: 'selection' } ]

        await TaskService.hasStartedTasksSince(exportedAt, excludedSubtasks)

        // Pending tasks haven't touched the database yet, so they must not count;
        // and one non-excluded subtask is enough to count the whole task
        expect(findOne).toHaveBeenCalledWith({
            createdAt: { $gt: exportedAt },
            status: { $ne: 'Pending' },
            subtasks: { $elemMatch: { $nor: excludedSubtasks } }
        })
    })

    it('counts any subtask when none are excluded', async () => {
        // MongoDB rejects an empty $nor, so this needs its own condition
        const findOne = vi.spyOn(TaskService.repository, 'findOne').mockResolvedValue(null)

        await TaskService.hasStartedTasksSince(exportedAt)

        expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
            subtasks: { $elemMatch: { type: { $exists: true } } }
        }))
    })

    it.each([
        [{ _id: new ObjectId() }, true],
        [null, false],
    ])('returns whether a matching task exists (%j -> %s)', async (task, expected) => {
        vi.spyOn(TaskService.repository, 'findOne').mockResolvedValue(task)

        expect(await TaskService.hasStartedTasksSince(exportedAt, [ { type: 'download' } ])).toBe(expected)
    })
})
