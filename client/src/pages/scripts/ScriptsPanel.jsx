import { useState } from 'react'
import styled from '@emotion/styled'
import ScriptsMenu from './ScriptsMenu'
import StewardshipReportForm from './StewardshipReportForm'

const ScriptsPanelContainer = styled.div`
    display: grid;
    grid-template-columns: 3fr 9fr;
    grid-column-gap: 10px;
`

export default function ScriptsPanel() {
    const [ selectedScript, setSelectedScript ] = useState('stewardshipReport')

    return (
        <ScriptsPanelContainer>
            <ScriptsMenu selectedScript={selectedScript} setSelectedScript={setSelectedScript} />

            { selectedScript === 'stewardshipReport' &&
                <StewardshipReportForm />
            }
        </ScriptsPanelContainer>
    )
}
