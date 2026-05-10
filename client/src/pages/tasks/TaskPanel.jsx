import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import styled from '@emotion/styled'
import axios from 'axios'

import SubtaskPipeline from './SubtaskPipeline'
import TaskMenu from './TaskMenu'
import TaskState from './TaskState'
import { useFlow } from '../../FlowProvider'
import { useAuth } from '../../AuthProvider'

const TaskPanelContainer = styled.form`
    display: grid;
    grid-template-columns: 3fr 9fr;
    grid-column-gap: 10px;
`

export default function TaskPanel() {
    const [ taskState, setTaskState ] = useState(new TaskState())
    const [ selectedTaskId, setSelectedTaskId ] = useState()
    const [ postTaskResponse, setPostTaskResponse ] = useState()
    const { query, setQuery } = useFlow()
    const { admin } = useAuth()

    /* Queries */

    /*
     * Selected Task Query
     * Fetches the task data for the currently selected task
     */
    const { error: selectedTaskQueryError, data: selectedTaskData } = useQuery({
        queryKey: ['selectedTask', selectedTaskId],
        queryFn: async () => {
            const response = await fetch(`/api/tasks/${selectedTaskId}`)
            const selectedTaskResponse = await response.json()

            // Update taskState to match selected task's subtasks
            let newTaskState = new TaskState({ id: selectedTaskId })
            for (const subtask of (selectedTaskResponse?.task?.subtasks || [])) {
                newTaskState[subtask.type] = true
            }
            setTaskState(newTaskState)

            return { ...selectedTaskResponse, status: response.status, statusText: response.statusText }
        },
        refetchInterval: 1000,
        refetchOnMount: 'always',
        enabled: !!selectedTaskId
    })

    // On remount, update subtasks based on the selected task data
    let subtasks = selectedTaskData?.task?.subtasks ?? []

    /*
     * Downloads Query
     * Generates download links for each output file in the currently selected task
     */
    const { data: downloads } = useQuery({
        queryKey: ['downloads', subtasks, admin],
        queryFn: async () => {
            const downloads = []

            for (const subtask of subtasks) {
                const outputs = subtask.outputs ?? []
                for (const output of outputs) {
                    const response = await axios.get(output.uri, { responseType: 'blob' }).catch((error) => {
                        return { status: error.status }
                    })

                    const download = {
                        fileName: output.fileName,
                        type: output.type,
                        subtype: output.subtype,
                        subtask: subtask.type,
                        responseStatus: response.status
                    }
                    if (response.status === 200) {
                        download.url = URL.createObjectURL(response.data)
                    }
                    downloads.push(download)
                }
            }
            
            return downloads
        },
        refetchOnMount: 'always',
        enabled: subtasks.some((subtask) => !!subtask.outputs)
    })

    /* Handler Functions */

    /*
     * handleSubmit()
     * Posts a task to the server based on the form data
     */
    function handleSubmit(event) {
        event.preventDefault()

        // If there are no subtasks, return without posting
        if (taskState.areAllDisabled()) return

        // If there are subtasks with no valid input file post a warning
        const enabledSubtasks = taskState.getEnabledSubtasks()
        if (enabledSubtasks.some((type) => taskState.subtaskIO[type].inputs.length > 0 && !event.target[`${type}Input`]?.value)) {
            console.error('Some subtasks have no input selected')
            window.alert('Some subtasks have no input selected')
            return
        }
        if (enabledSubtasks.filter((type) => event.target[`${type}Input`]?.value === 'upload').length > 1) {
            console.error('Multiple uploads are not allowed')
            window.alert('Multiple uploads are not allowed')
            return
        }

        setPostTaskResponse(null)

        const formData = new FormData()

        // Add the upload file (if present)
        if (event.target.fileUpload?.files?.length > 0) {
            formData.append('file', event.target.fileUpload.files[0])
        }

        // Build the subtask pipeline
        const subtaskPipeline = enabledSubtasks.map((type) => {
            const subtask = { type }

            // Subtask inputs are determined by the `${type}Input` element
            subtask.input = event.target[`${type}Input`]?.value

            if (subtask.input === 'selection') {
                const subtaskQuery = {
                    page: query.page,
                    per_page: query.per_page,
                    start_date: query.start_date,
                    end_date: query.end_date
                }

                for (const [ fieldName, values ] of Object.entries(query.valueQueries)) {
                    subtaskQuery[fieldName] = values ?? ''
                }

                subtask.query = subtaskQuery
            }

            // Add observations subtask settings
            if (type === 'observations') {
                subtask.sources = event.target.sources.value
                subtask.minDate = event.target.minDate.value
                subtask.maxDate = event.target.maxDate.value
            }

            // Add labels subtask settings
            if (type === 'labels') {
                subtask.ignoreDateLabelPrint = event.target.labelsIgnoreDateLabelPrint.checked
            }

            // Add addresses subtask settings
            if (type === 'addresses') {
                subtask.includeUnprintedRows = event.target.addressesIncludeUnprintedRows.checked
            }

            const excludeOutput = event.target[`${type}ExcludeOutput`]?.checked
            console.log(excludeOutput)
            if (excludeOutput) {
                subtask.excludeOutput = excludeOutput
            }

            return subtask
        })
        formData.append('subtasks', JSON.stringify(subtaskPipeline))

        // Post the task
        axios.postForm('/api/tasks', formData).then((res) => {
            setPostTaskResponse({ status: res.status, data: res.data })

            const postedTaskId = res.data?.uri?.replace('/api/tasks/', '')
            setSelectedTaskId(postedTaskId)
        }).catch((error) => {
            setPostTaskResponse({ status: error.response?.status, error: error.response?.data?.error ?? error.message })
        }).finally(() => {
            setQuery({ ...query, unsubmitted: true })
        })
    }

    return (
        <TaskPanelContainer onSubmit={ handleSubmit }>
            <TaskMenu
                taskState={taskState}
                setTaskState={setTaskState}
                selectedTaskId={selectedTaskId}
                setSelectedTaskId={setSelectedTaskId}
                selectedTaskQueryError={selectedTaskQueryError}
                selectedTaskData={selectedTaskData}
            />
            <SubtaskPipeline
                taskState={taskState}
                selectedTaskData={selectedTaskData}
                downloads={downloads}
            />
        </TaskPanelContainer>
    )
}
