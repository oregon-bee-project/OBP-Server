import styled from '@emotion/styled'
import { useState } from 'react'

import ProjectSelection from './ProjectSelection'
import SubtaskIOPanel from './SubtaskIOPanel'

const SubtaskCardFormContainer = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    flex-grow: 1;
    gap: 15px;

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

        p {
            margin: 0px;
        }

        .subtaskSettingsFieldset {
            gap: 5px;
            margin-top: 5px;
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

            input[type='date'] {
                border: 1px solid gray;
                border-radius: 5px;

                padding: 3px;
            }

            input[type='checkbox'] {
                margin: 0px;

                border: 1px solid gray;
                border-radius: 5px;

                width: 15px;
                height: 15px;
            }
        }

        .excludeOutputNotice {
            color: goldenrod;

            font-weight: bold;
        }
    }

    #removeSubtask {
        height: 35px;

        font-size: 12pt;
    }
`

export default function SubtaskCardForm({ type, taskState, pipelineState, setPipelineState }) {
    const subtasksWithSettings = ['occurrences', 'observations', 'labels', 'addresses']
    const firstDay = new Date(new Date().getFullYear(), 0, 1)
    const firstDayFormatted = `${firstDay.getFullYear()}-${(firstDay.getMonth() + 1).toString().padStart(2, '0')}-${firstDay.getDate().toString().padStart(2, '0')}`
    const currentDate = new Date()
    const currentDateFormatted = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`
    const [ minDate, setMinDate ] = useState(firstDayFormatted)
    const [ maxDate, setMaxDate ] = useState(currentDateFormatted)
    const [ excludeOutput, setExcludeOutput ] = useState(false)
    const [ includeUnprintedRows, setIncludeUnprintedRows ] = useState(false)
    const [ overwriteValidLocations, setOverwriteValidLocations ] = useState(false)

    const descriptions = {
        'occurrences': 'Formats and updates an occurrences file',
        'observations': 'Pulls observations from iNaturalist and merges them into an occurrences file',
        'overwrite': 'Overwrites existing occurrences with a matching field number',
        'labels': 'Creates a sheet of labels from an occurrences or pulls file',
        'addresses': 'Compiles a list of mailing addresses from an occurrences or pulls file',
        'emails': 'Compiles a list of emails categorized by error type from a flags file',
        'pivots': 'Creates pivot tables from an occurrences or pulls file'
    }

    return (
        <SubtaskCardFormContainer>
            <fieldset>
                <p>{descriptions[type]}</p>

                <SubtaskIOPanel
                    type={type}
                    taskState={taskState}
                    pipelineState={pipelineState}
                    setPipelineState={setPipelineState}
                />
                <fieldset className="subtaskSettingsFieldset">
                    { subtasksWithSettings.includes(type) &&
                        <legend>Subtask settings:</legend>
                    }
                    { (type === 'occurrences') &&
                        <div className='subtaskSetting'>
                            <input
                                id={`${type}OverwriteValidLocations`}
                                type='checkbox'
                                autoComplete='off'
                                checked={overwriteValidLocations}
                                onChange={(event) => setOverwriteValidLocations(event.target.checked)}
                            />
                            <label
                                htmlFor={`${type}OverwriteValidLocations`}
                            >Overwrite valid GPS coordinates and localities</label>
                        </div>
                    }
                    { type === 'observations' &&
                        <>
                            <ProjectSelection />
                            
                            <div className='subtaskSetting'>
                                <label htmlFor='minDate'>From:</label>
                                <input id='minDate' type='date' value={minDate} onChange={(e) => setMinDate(e.target.value)} required />
                            </div>
                            <div className='subtaskSetting'>
                                <label htmlFor='maxDate'>Through:</label>
                                <input id='maxDate' type='date' value={maxDate} onChange={(e) => setMaxDate(e.target.value)} required />
                            </div>
                        </>
                    }
                    { (type === 'labels') &&
                        <div className='subtaskSetting'>
                            <input
                                id={`${type}IgnoreDateLabelPrint`}
                                type='checkbox'
                                autoComplete='off'
                                checked={pipelineState.ignoreDateLabelPrint}
                                onChange={(event) => setPipelineState({ ...pipelineState, ignoreDateLabelPrint: event.target.checked })}
                            />
                            <label
                                htmlFor={`${type}IgnoreDateLabelPrint`}
                            >Ignore dateLabelPrint field</label>
                        </div>
                    }
                    { (type === 'addresses') &&
                        <div className='subtaskSetting'>
                            <input
                                id={`${type}IncludeUnprintedRows`}
                                type='checkbox'
                                autoComplete='off'
                                checked={includeUnprintedRows}
                                onChange={(event) => setIncludeUnprintedRows(event.target.checked)}
                            />
                            <label
                                htmlFor={`${type}IncludeUnprintedRows`}
                            >Output occurrences with blank dateLabelPrint field</label>
                        </div>
                    }
                    { type !== 'overwrite' 
                      && taskState.subtaskIO[type].outputs.includes('occurrences') &&
                        <div className='subtaskSetting'>
                            <input
                                id={`${type}ExcludeOutput`}
                                type='checkbox'
                                autoComplete='off'
                                checked={excludeOutput}
                                onChange={(event) => setExcludeOutput(event.target.checked)}
                            />
                            <label
                                htmlFor={`${type}ExcludeOutput`}
                            >Exclude output from database</label>
                        </div>
                    }
                </fieldset>
                { excludeOutput &&
                    <p>
                        <span className='excludeOutputNotice'>Notice: </span>
                        Any input occurrences that match an existing database record will be ignored for this subtask.
                        Output occurrences will not be merged with the database.
                    </p>
                }
            </fieldset>
        </SubtaskCardFormContainer>
    )   
}
