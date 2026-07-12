import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import styled from '@emotion/styled'

import closeIcon from '/src/assets/close.svg'
import TaskState from './TaskState'
import Dropdown from './Dropdown'

const TaskMenuContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: stretch;
    gap: 15px;

    border: 1px solid #222;
    border-radius: 5px;

    padding: 15px;

    .subtaskListItem {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        gap: 10px;

        h3 {
            margin: 0px;

            font-size: 16pt;
        }

        #removeSubtaskButton {
            display: flex;
            justify-content: center;
            align-items: center;

            border: 1px solid gray;
            border-radius: 5px;

            padding: 5px;

            background-color: white;

            &:hover {
                background-color: #efefef;
            }

            img {
                width: 20px;
                height: 20px;
            }
        }
    }

    #taskSelectionContainer {
        display: flex;
        flex-direction: column;
        justify-content: start;
        align-items: stretch;
        gap: 10px;

        select {
            border: 1px solid gray;
            border-radius: 5px;

            padding: 5px;

            font-size: 12pt;

            background-color: white;

            &:hover {
                background-color: #efefef;
            }

            optgroup {
                font-style: normal;
            }
        }

        p {
            margin: 0px;

            font-size: 12pt;
        }
    }

    #dropdownContainer {
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        align-items: center;
    }

    #taskSubmitButton {
        border: 1px solid gray;
        border-radius: 5px;

        padding: 5px;

        font-size: 12pt;

        background-color: white;
            
        &:hover {
            background-color: #efefef;
        }
    }
`

function capitalize(text) {
    if (!text) return ''
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export default function TaskMenu({ taskState, setTaskState, selectedTaskId, setSelectedTaskId, selectedTaskQueryError, selectedTaskData }) {
    const [ selectedValue, setSelectedValue ] = useState(selectedTaskId || 'blank')

    // Subtask pipeline presets for creating new tasks
    const newTaskPresets = {
        'blank': {},
        'occurrences-observations': { occurrences: true, observations: true },
        'occurrences-observations-emails': { occurrences: true, observations: true, emails: true },
        'occurrences-observations-pivots': { occurrences: true, observations: true, pivots: true },
        'observations-labels-addresses': { observations: true, labels: true, addresses: true },
        'labels-addresses': { labels: true, addresses: true },
        'full': { occurrences: true, observations: true, labels: true, addresses: true, emails: true, pivots: true }
    }

    // List of displayable subtasks
    const displayableSubtasks = [
        'occurrences',
        'observations',
        'emails',
        'pivots',
        'labels',
        'addresses',
        'overwrite'
    ]

    /* Queries */

    /*
     * Tasks Query
     * Fetches a list of all existing tasks from the server
     */
    const { error: tasksQueryError, data: tasks } = useQuery({
        queryKey: ['tasks', selectedTaskId],
        queryFn: async () => {
            const response = await fetch('/api/tasks')
            const parsedResponse = await response.json()

            // Limit tasks to those with displayable subtasks
            const displayableTasks = parsedResponse.tasks?.filter((task) => task.subtasks?.some((subtask) => displayableSubtasks.includes(subtask.type)))

            return displayableTasks
        },
        refetchInterval: 10000,
        refetchOnMount: 'always',
    })

    /* Effects */

    useEffect(() => {
        if (selectedTaskId) {
            setSelectedValue(selectedTaskId)
        }
    }, [selectedTaskId])

    /* Handler Functions */
    
    /*
     * handleAdd()
     * Adds a subtask to the pipeline
     */
    function handleAdd(subtask, setSelectedValue) {
        const newTaskState = new TaskState(taskState)
        newTaskState[subtask] = true

        setTaskState(newTaskState)
        setSelectedValue('')
    }

    /*
     * handleRemove()
     * Removes a task from the pipeline
     */
    function handleRemove(subtask) {
        const newTaskState = new TaskState(taskState)
        newTaskState[subtask] = false

        setTaskState(newTaskState)
    }

    /*
     * handleTaskSelect()
     * Selects the given value in the task selector (workaround for insufficient onChange behavior)
     */
    function handleTaskSelect(event) {
        if (newTaskPresets[event.target.value]) {
            setSelectedTaskId(null)
            setSelectedValue(event.target.value)
            setTaskState(new TaskState(newTaskPresets[event.target.value]))
        } else {
            setSelectedTaskId(event.target.value)
            setSelectedValue(event.target.value)
        }
    }

    return (
        <TaskMenuContainer>
            <div id='taskSelectionContainer'>
                <select value={selectedValue} onChange={ handleTaskSelect }>
                    <optgroup label='New task presets'>
                        { Object.keys(newTaskPresets).map((preset) => <option key={preset} value={preset}>New {preset} task</option>) }
                    </optgroup>
                    <optgroup label='Previous tasks'>
                        { tasks?.map((task) => <option value={task._id} key={task._id}>{task.name}</option>)}
                    </optgroup>
                </select>

                { selectedTaskQueryError &&
                    <p>Error: {selectedTaskQueryError.message}</p>
                }
                { selectedTaskData &&
                    <p>Task {selectedTaskData.task?._id}: {selectedTaskData.task?.status}</p>
                }
            </div>

            { taskState.getEnabledSubtasks().map((type) => 
                <div className='subtaskListItem'>
                    <h3>{taskState.getSubtaskOrdinal(type)}. {capitalize(type)} Subtask</h3>

                    { !selectedTaskId &&
                        <button id='removeSubtaskButton' type='button' onClick={() => handleRemove(type)}>
                            <img src={closeIcon} alt='Remove' />
                        </button>
                    }
                </div>
            )}

            { !selectedTaskId && !taskState.areAllEnabled() &&
                <div id='dropdownContainer'>
                    <Dropdown
                        onChange={ handleAdd }
                        options={taskState.getDisabledSubtasks().map((subtask) => ({ key: subtask, value: subtask, text: subtask }))}
                    />
                </div>
            }

            { !selectedTaskId &&
                <input id='taskSubmitButton' type='submit' value='Submit' />
            }
        </TaskMenuContainer>
    )
}
