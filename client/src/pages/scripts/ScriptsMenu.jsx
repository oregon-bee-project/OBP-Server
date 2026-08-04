import styled from '@emotion/styled'

const ScriptsMenuContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;

    border: 1px solid #222;
    border-radius: 5px;

    padding: 15px;

    h2 {
        margin: 0px;

        font-size: 16pt;
    }

    .scriptList {
        display: flex;
        flex-direction: column;
        align-items: start;
        gap: 10px;

        margin: 0px;
        margin-bottom: 10px;

        padding: 0px;
        padding-left: 10px;

        button {
            border: 0px;

            padding: 0px;

            font-size: 14pt;

            background-color: transparent;

            cursor: pointer;

            &:hover {
                text-decoration: underline;
                color: #444;
            }
        }

        .selectedScript {
            text-decoration: underline;
        }
    }
`

export default function ScriptsMenu({ selectedScript, setSelectedScript }) {
    return (
        <ScriptsMenuContainer>
            <h2>Scripts</h2>

            <div className='scriptList'>
                <button
                    className={ selectedScript === 'stewardshipReport' ? 'selectedScript' : '' }
                    onClick={() => setSelectedScript('stewardshipReport')}
                >Stewardship Report</button>
                <button
                    className={ selectedScript === 'studentReport' ? 'selectedScript' : '' }
                    onClick={() => setSelectedScript('studentReport')}
                >Student Report</button>
            </div>
        </ScriptsMenuContainer>
    )
}
