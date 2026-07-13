import styled from '@emotion/styled'

import SubtaskStatus from './SubtaskStatus'
import SubtaskCardForm from './SubtaskCardForm'

const SubtaskCardContainer = styled.div`
    display: flex;
    flex-direction: column;
    flex: 0 0 350px;
    gap: 15px;

    border: 1px solid gray;
    border-radius: 5px;

    padding: 10px;

    h2 {
        margin: 0px;

        font-size: 16pt;
    }

    p {
        margin: 0px;

        font-size: 12pt;
    }

    .fileTip {
        font-weight: bold;
    }

    .hoveredFileTip {
        text-decoration: underline;
    }

    .occurrencesFileTip {
        color: var(--occurrences-file-color);
    }

    .duplicatesFileTip {
        color: var(--duplicates-file-color);
    }

    .pullsFileTip {
        color: var(--pulls-file-color);
    }

    .flagsFileTip {
        color: var(--flags-file-color);
    }

    .labelsFileTip {
        color: var(--labels-file-color);
    }

    .addressesFileTip {
        color: var(--addresses-file-color);
    }

    .emailsFileTip {
        color: var(--emails-file-color);
    }

    .pivotsFileTip {
        color: var(--pivots-file-color);
    }

    .mismatchesFileTip {
        color: var(--mismatches-file-color);
    }

    .revisionsFileTip {
        color: var(--revisions-file-color);
    }
`

function capitalize(text) {
    if (!text) return ''
    return text.charAt(0).toUpperCase() + text.slice(1)
}

export default function SubtaskCard({ type, taskState, pipelineState, setPipelineState, selectedTaskData, downloads }) {
    const ordinal = taskState.getSubtaskOrdinal(type)

    return (
        <SubtaskCardContainer>
            <h2>{ordinal}. {capitalize(type)} Subtask</h2>

            { !selectedTaskData ? (
                <SubtaskCardForm
                    type={type}
                    taskState={taskState}
                    pipelineState={pipelineState}
                    setPipelineState={setPipelineState}
                />
            ) : (
                <SubtaskStatus
                    type={type}
                    taskState={taskState}
                    selectedTaskData={selectedTaskData}
                    downloads={downloads}
                />
            )}
        </SubtaskCardContainer>
    )
}
