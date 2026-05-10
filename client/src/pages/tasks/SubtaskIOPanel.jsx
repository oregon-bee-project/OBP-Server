import styled from '@emotion/styled'
import { useEffect, useState } from 'react'

import { useFlow } from '../../FlowProvider'

const SubtaskIOPanelContainer = styled.div`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: stretch;
    gap: 10px;

    white-space: nowrap;

    .inputFileFieldset {
        display: flex;
        flex-direction: column;
        gap: 5px;

        div {
            display: flex;
            flex-direction: row;
            justify-content: start;
            align-items: center;
            gap: 5px;

            font-size: 12pt;

            input[type='radio'] {
                margin: 0px;

                width: 15px;
                height: 15px
            }

            label {
                display: flex;
                flex-direction: row;
                justify-content: start;
                align-items: center;
                gap: 5px;
            }
        }

        .uploadInput {
            display: grid;
            grid-template-columns: 15px 1fr;
            grid-row-gap: 5px;

            input[type='file'] {
                grid-column: 1 / 3;
            }
        }

        .warningMessage {
            color: firebrick;
            font-weight: bold;
        }
    }

    .tipContainer {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0px;

        padding: 0px;
        padding-right: 25px;

        h3 {
            margin: 0px;

            font-size: 12pt;
        }

        ul {
            margin: 0px;
            padding-left: 25px;
        }
    }
`

function capitalize(text) {
    if (!text) return ''
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export default function SubtaskIOPanel({ type, taskState, pipelineState, setPipelineState }) {
    const { results } = useFlow()

    const io = taskState.subtaskIO[type]
    const inputOptions = taskState.getInputOptions(type)
    const subtaskIndex = (taskState.getSubtaskOrdinal(type) - 1).toString()
    const hoveredIndex = pipelineState.hoveredFile.split('_').at(0) ?? ''
    const hoveredFileType = pipelineState.hoveredFile.split('_').at(1) ?? ''

    const selectionAvailable = io?.inputs?.includes('occurrences') && results?.pagination?.totalDocuments > 0
    const defaultInputFile = inputOptions?.find((option) => !!option.default)?.key || (selectionAvailable && 'selection') || (io.inputs.length > 0 && 'upload')
    const [ selectedInputFile, setSelectedInputFile ] = useState(defaultInputFile)

    // Select the default file when it changes (when the input options change)
    useEffect(() => {
        setSelectedInputFile(defaultInputFile)
    }, [defaultInputFile])

    return (
        <SubtaskIOPanelContainer>
            <fieldset className='inputFileFieldset'>
                <legend>Input:</legend>
                { inputOptions?.map((option) =>
                    <div
                        onMouseEnter={() => setPipelineState({ ...pipelineState, hoveredFile: option.key })}
                        onMouseLeave={() => setPipelineState({ ...pipelineState, hoveredFile: '' })}
                    >
                        <input
                            type='radio'
                            id={`${type}Input-${option.key}`}
                            name={`${type}Input`}
                            value={option.key}
                            checked={selectedInputFile === option.key}
                            onChange={(event) => setSelectedInputFile(event.target.value)}
                        />
                        <label htmlFor={`${type}Input-${option.key}`}>
                            {capitalize(option.subtask)} subtask ({option.subtaskIndex + 1}):
                            <span className={`fileTip ${option.output}FileTip ${pipelineState.hoveredFile === option.key ? 'hoveredFileTip' : ''}`}>{option.output} file</span>
                        </label>
                    </div>
                )}
                { selectionAvailable &&
                    <div>
                        <input
                            type='radio'
                            id={`${type}Input-selection`}
                            name={`${type}Input`}
                            value='selection'
                            checked={selectedInputFile === 'selection'}
                            onChange={(event) => setSelectedInputFile(event.target.value)}
                        />
                        <label htmlFor={`${type}Input-selection`}>Selection ({results?.pagination?.totalDocuments?.toLocaleString('en-US') ?? '0'} occurrences)</label>
                    </div>
                }
                { defaultInputFile &&
                    <div className='uploadInput'>
                        <input
                            type='radio'
                            id={`${type}Input-upload`}
                            name={`${type}Input`}
                            value='upload'
                            checked={selectedInputFile === 'upload'}
                            onChange={(event) => setSelectedInputFile(event.target.value)}
                        />
                        <label htmlFor={`${type}Input-upload`}>
                            Upload ({ io?.inputs?.map((input) =>
                                input !== 'none' && <span className={`fileTip ${input}FileTip`}>{input}</span>
                            )})
                        </label>
                        { selectedInputFile === 'upload' &&
                            <input
                                type='file'
                                id={`${type}Input-file`}
                                name='fileUpload'
                                accept='.csv'
                                required={true}
                            />
                        }
                    </div>
                }
                { io?.inputs?.includes('none') &&
                    <div>
                        <input
                            type='radio'
                            id={`${type}Input-none`}
                            name={`${type}Input`}
                            value='none'
                            checked={selectedInputFile === 'none'}
                            onChange={(event) => setSelectedInputFile(event.target.value)}
                        />
                        <label htmlFor={`${type}Input-none`}>None</label>
                    </div>
                }
                { !defaultInputFile && io.inputs.length > 0 &&
                    <div>
                        <p className='warningMessage'>No valid input files</p>
                    </div>
                }
            </fieldset>

            { io &&
                <div className='tipContainer'>
                    <h3>Outputs:</h3>
                    { io?.outputs?.length > 0 &&
                        <ul>
                            {
                                io?.outputs?.map((output) =>
                                    <li
                                        className={`fileTip ${output}FileTip ${hoveredIndex === subtaskIndex && hoveredFileType === output ? 'hoveredFileTip' : ''}`}
                                        key={output}
                                        onMouseEnter={() => setPipelineState({ ...pipelineState, hoveredFile: `${subtaskIndex}_${output}` })}
                                        onMouseLeave={() => setPipelineState({ ...pipelineState, hoveredFile: '' })}
                                    >{output} file</li>
                                )
                            }
                        </ul>
                    }
                </div>
            }
        </SubtaskIOPanelContainer>
    )
}
