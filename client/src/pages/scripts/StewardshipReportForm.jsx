import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import styled from '@emotion/styled'

// Styles mirror the subtask cards on the Tasks page (SubtaskCard, SubtaskCardForm, SubtaskIOPanel)
const StewardshipReportFormContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 15px;

    border: 1px solid #222;
    border-radius: 5px;

    padding: 20px;

    h2 {
        margin: 0px;

        font-size: 16pt;
    }

    h3 {
        margin: 0px;

        font-size: 12pt;
    }

    p {
        margin: 0px;

        font-size: 12pt;
    }

    button, input[type='submit'] {
        border: 1px solid gray;
        border-radius: 5px;

        font-size: 12pt;

        background-color: white;

        &:hover {
            background-color: #efefef;
        }
    }

    fieldset {
        display: flex;
        flex-direction: column;
        justify-content: start;
        gap: 15px;

        margin: 0px;

        border: none;

        padding: 0px;

        font-size: 12pt;

        legend {
            margin-bottom: 2px;

            padding: 0px;

            font-size: 12pt;
            font-weight: bold;
        }
    }

    .ioPanel {
        display: flex;
        flex-direction: row;
        justify-content: start;
        align-items: stretch;
        gap: 40px;

        white-space: nowrap;
    }

    .inputFileFieldset {
        display: flex;
        flex-direction: column;
        gap: 5px;

        .inputOption {
            display: grid;
            grid-template-columns: 15px 1fr;
            grid-row-gap: 5px;
            align-items: center;
            column-gap: 5px;

            input[type='radio'] {
                margin: 0px;

                width: 15px;
                height: 15px;
            }

            input[type='file'], input[type='url'] {
                grid-column: 1 / 3;
            }

            input[type='url'] {
                width: 45ch;

                font-size: 10pt;
            }
        }
    }

    .tipContainer {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0px;

        padding: 0px;
        padding-right: 25px;

        ul {
            margin: 0px;
            padding-left: 25px;
        }
    }

    .subtaskSettingsFieldset {
        gap: 5px;
    }

    .subtaskSetting {
        display: flex;
        align-items: center;
        gap: 5px;

        white-space: nowrap;

        label {
            display: flex;
            align-items: center;
        }

        input[type='text'] {
            width: 30ch;
        }

        input[type='checkbox'] {
            margin: 0px;

            width: 15px;
            height: 15px;
        }
    }

    input[type='text'], input[type='url'] {
        border: 1px solid gray;
        border-radius: 5px;

        padding: 3px;

        font-size: 12pt;
    }

    .titleNotice {
        color: goldenrod;
        font-weight: bold;
    }

    #submitStewardshipReport {
        align-self: start;

        height: 35px;
    }

    #stewardshipReportQueryResults {
        display: flex;
        flex-direction: column;
        align-items: start;
        gap: 10px;
    }

    .fileTip {
        font-weight: bold;
    }

    .reportFileTip {
        color: var(--labels-file-color);
    }

    .plantSummaryFileTip {
        color: var(--pivots-file-color);
    }

    .logFileTip {
        color: gray;
    }

    .authRequiredDownloadMessage {
        color: red;
        text-decoration: underline;
    }
`

const defaultTitle = 'Stewardship Report'

// Mirrors the title rules in parseSubtasks (shared/lib/utils/utilities.ts); characters outside these
//  would break the report's file name or LaTeX, and a leading '.' would hide the file from the R script
const disallowedTitleCharacters = /[^a-zA-Z0-9 '.-]/g

// Output files produced by the stewardship report subtask, keyed by output type
const outputLabels = {
    report: 'report',
    plantSummary: 'plant summary',
    log: 'script log'
}

export default function StewardshipReportForm() {
    const [ formDisabled, setFormDisabled ] = useState(false)
    const [ queryResponse, setQueryResponse ] = useState()
    const [ selectedTaskId, setSelectedTaskId ] = useState()

    // Form fields are kept in state so they persist between queries
    const [ inputType, setInputType ] = useState('url')
    const [ url, setUrl ] = useState('')
    const [ title, setTitle ] = useState('')
    const [ titleRejected, setTitleRejected ] = useState(false)
    const [ refreshOccurrences, setRefreshOccurrences ] = useState(false)

    /* Queries */

    /*
     * Selected Task Query
     * Fetches the task data for the currently selected task
     */
    const { data: selectedTaskData } = useQuery({
        queryKey: ['selectedTask', selectedTaskId],
        queryFn: async () => {
            const response = await fetch(`/api/tasks/${selectedTaskId}`)
            const selectedTaskResponse = await response.json()

            return { ...selectedTaskResponse, status: response.status, statusText: response.statusText }
        },
        refetchInterval: 1000,
        refetchOnMount: 'always',
        enabled: !!selectedTaskId
    })

    const outputs = selectedTaskData?.task?.subtasks?.find((subtask) => subtask.type === 'stewardshipReport')?.outputs
    const taskFinished = ['Completed', 'Failed'].includes(selectedTaskData?.task?.status)

    /*
     * Downloads Query
     * Generates download links for each output file of the stewardship report subtask
     */
    const { data: downloads } = useQuery({
        queryKey: ['downloads', outputs],
        queryFn: async () => {
            const downloads = []

            for (const output of outputs) {
                const response = await axios.get(output.uri, { responseType: 'blob' }).catch((error) => {
                    return { status: error.status }
                })

                const download = {
                    fileName: output.fileName,
                    type: output.type,
                    responseStatus: response.status
                }
                if (response.status === 200) {
                    download.url = URL.createObjectURL(response.data)
                }
                downloads.push(download)
            }

            return downloads
        },
        refetchOnMount: 'always',
        enabled: !!outputs
    })

    /* Handler Functions */

    /*
     * handleSubmit()
     * Queries the server based on the form data
     */
    function handleSubmit(event) {
        event.preventDefault()

        setFormDisabled(true)
        setQueryResponse(null)
        setSelectedTaskId(null)

        const formData = new FormData()

        if (inputType === 'upload') {
            const file = event.target.stewardshipReportFileUpload.files[0]
            if (file) formData.append('file', file)
        }

        const subtasks = [
            {
                type: 'stewardshipReport',
                input: inputType,
                url: inputType === 'url' ? url : undefined,
                title,
                refreshOccurrences
            }
        ]
        formData.append('subtasks', JSON.stringify(subtasks))

        axios.postForm('/api/tasks', formData).then((res) => {
            setFormDisabled(false)
            setQueryResponse({ status: res.status, data: res.data })

            const postedTaskId = res.data?.uri?.replace('/api/tasks/', '')
            setSelectedTaskId(postedTaskId)
        }).catch((err) => {
            setFormDisabled(false)
            setQueryResponse({ status: err.response?.status, error: err.response?.data?.error ?? err.message })
        })
    }

    /*
     * handleTitleChange()
     * Updates the title, dropping characters the server would strip out
     */
    function handleTitleChange(event) {
        const enteredTitle = event.target.value.replace(/[‘’]/g, "'")
        const allowedTitle = enteredTitle.replace(disallowedTitleCharacters, '').replace(/^[\s.]+/, '')

        setTitleRejected(allowedTitle !== enteredTitle)
        setTitle(allowedTitle)
    }

    /*
     * handleReset()
     * Resets the form
     */
    function handleReset(event) {
        event.preventDefault()

        setQueryResponse(null)
        setSelectedTaskId(null)
    }

    return (
        <StewardshipReportFormContainer>
            <h2>Stewardship Report Script</h2>

            { !queryResponse ? (
                <form onSubmit={ handleSubmit }>
                    <fieldset disabled={formDisabled}>
                        <p>Creates a stewardship report from iNaturalist plant observations and the occurrences database</p>

                        <div className='ioPanel'>
                            <fieldset className='inputFileFieldset'>
                                <legend>Input:</legend>
                                <div className='inputOption'>
                                    <input
                                        type='radio'
                                        id='stewardshipReportInput-url'
                                        name='stewardshipReportInput'
                                        value='url'
                                        checked={inputType === 'url'}
                                        onChange={(event) => setInputType(event.target.value)}
                                    />
                                    <label htmlFor='stewardshipReportInput-url'>iNaturalist URL (project or map area)</label>
                                    { inputType === 'url' &&
                                        <input
                                            type='url'
                                            id='stewardshipReportUrl'
                                            placeholder='https://www.inaturalist.org/projects/...'
                                            value={url}
                                            onChange={(event) => setUrl(event.target.value)}
                                            required
                                        />
                                    }
                                </div>
                                <div className='inputOption'>
                                    <input
                                        type='radio'
                                        id='stewardshipReportInput-upload'
                                        name='stewardshipReportInput'
                                        value='upload'
                                        checked={inputType === 'upload'}
                                        onChange={(event) => setInputType(event.target.value)}
                                    />
                                    <label htmlFor='stewardshipReportInput-upload'>Upload (iNaturalist observations export)</label>
                                    { inputType === 'upload' &&
                                        <input
                                            type='file'
                                            id='stewardshipReportFileUpload'
                                            accept='.csv'
                                            required
                                        />
                                    }
                                </div>
                            </fieldset>

                            <div className='tipContainer'>
                                <h3>Outputs:</h3>
                                <ul>
                                    { Object.entries(outputLabels).map(([type, label]) =>
                                        <li key={type} className={`fileTip ${type}FileTip`}>{label} file</li>
                                    )}
                                </ul>
                            </div>
                        </div>

                        <fieldset className='subtaskSettingsFieldset'>
                            <legend>Report settings:</legend>
                            <div className='subtaskSetting'>
                                <label htmlFor='stewardshipReportTitle'>Title:</label>
                                <input
                                    type='text'
                                    id='stewardshipReportTitle'
                                    placeholder={defaultTitle}
                                    maxLength={60}
                                    value={title}
                                    onChange={handleTitleChange}
                                />
                            </div>
                            { titleRejected &&
                                <p>
                                    <span className='titleNotice'>Notice: </span>
                                    Titles can only contain letters, numbers, spaces, apostrophes ('), hyphens (-), and periods (.)
                                </p>
                            }
                            <div className='subtaskSetting'>
                                <input
                                    type='checkbox'
                                    id='stewardshipReportRefreshOccurrences'
                                    autoComplete='off'
                                    checked={refreshOccurrences}
                                    onChange={(event) => setRefreshOccurrences(event.target.checked)}
                                />
                                <label htmlFor='stewardshipReportRefreshOccurrences'>Force re-export of occurrences from the database</label>
                            </div>
                        </fieldset>

                        <input type='submit' id='submitStewardshipReport' value='Submit' />
                    </fieldset>
                </form>
            ) : (
                <div id='stewardshipReportQueryResults'>
                    { selectedTaskData?.task &&
                        <>
                            { selectedTaskData.task.status &&
                                <p>Status: {selectedTaskData.task.status}</p>
                            }
                            { selectedTaskData.task.progress?.currentStep &&
                                <p>Current Step: {selectedTaskData.task.progress.currentStep}</p>
                            }
                            { selectedTaskData.task.progress?.percentage &&
                                <p>{selectedTaskData.task.progress.percentage}</p>
                            }
                            { downloads?.map((d) => {
                                if (d.responseStatus === 200) {
                                    return <a key={d.fileName} href={d.url} download={d.fileName}>Download {outputLabels[d.type] ?? d.type} file</a>
                                } else if (d.responseStatus === 401) {
                                    return <p key={d.fileName} className='authRequiredDownloadMessage'>Authentication Required</p>
                                } else {
                                    return <p key={d.fileName}>Error {d.responseStatus}</p>
                                }
                            })}
                        </>
                    }
                    { queryResponse.error &&
                        <p>Error: {queryResponse.error}</p>
                    }
                    { selectedTaskData?.error &&
                        <p>Error: {selectedTaskData.status} {selectedTaskData.statusText}</p>
                    }

                    { (taskFinished || queryResponse.error || selectedTaskData?.error) &&
                        <button
                            id='resetButton'
                            onClick={ handleReset }
                        >New Query</button>
                    }
                </div>
            )}
        </StewardshipReportFormContainer>
    )
}
