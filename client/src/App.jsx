import styled from '@emotion/styled'

import CurrentUserButton from './components/CurrentUserButton.jsx'
import { Outlet, useNavigate } from 'react-router'
import { useAuth } from './AuthProvider.jsx'
import { FlowProvider } from './FlowProvider.jsx'

const devUsers = ['nora', 'dev']

const AppContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: stretch;

    min-width: 1440px;

    header {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;

        padding: 20px 100px;

        white-space: nowrap;

        background-color: ${props => devUsers.includes(props.admin) ? 
            `#33004e` 
            : `#222` };

        #appTitleText {
            display: flex;
            flex-direction: row;
            justify-content: start;
            align-items: center;

            #appTitle {
                display: flex;
                flex-direction: row;
                justify-content: start;
                align-items: center;

                border-right: 1px solid white;

                padding: 10px 20px;

                cursor: pointer;

                h1 {
                    margin: 0px;

                    font-size: 24pt;
                    color: #e5cb22;

                    white-space: nowrap;
                }
            }

            #appSubtitle {
                display: flex;
                flex-direction: row;
                justify-content: start;
                align-items: center;

                padding: 10px 20px;

                h3 {
                    margin: 0px;
                    
                    text-align: center;
                    font-weight: normal;
                    font-size: 16pt;
                    color: white;
                }
            }
        }
    }

    #oldBeelineNotice {
        margin: 0px;
        padding: 12px 100px;

        font-size: 14pt;
        color: #222;
        background-color: #e5cb22;

        a {
            color: inherit;
            font-weight: bold;
        }
    }

    main {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 10px;

        padding: 20px 100px;

        .loadingMessage {
            margin: 0px;

            font-size: 16pt;
        }
    }
`

function App({ children }) {
    const { admin, volunteer } = useAuth()
    const navigate = useNavigate()

    return (
        <AppContainer admin={admin}>
            <header id='head-banner'>
                <div id='appTitleText'>
                    <div id='appTitle' onClick={() => navigate('/') }>
                        <h1>Beeline</h1>
                    </div>
                    <div id='appSubtitle'>
                        <h3>The Bee Atlas Automated Interaction-Occurrence Data Pipeline</h3>
                    </div>
                </div>
                { (admin || volunteer) && <CurrentUserButton /> }
            </header>
            {/* New Beeline took melittologist.org at cutover on 3 November 2026; this
                interface stays at old.melittologist.org for volunteer determinations
                through February 2027. Remove the notice when it closes. */}
            <p id='oldBeelineNotice' role='note'>
                This is the old Beeline. You can keep entering your determinations here
                through February 2027. The new Beeline is at{' '}
                <a href='https://melittologist.org/'>melittologist.org</a>.
            </p>
            <main>
                <FlowProvider>
                    { children || <Outlet /> }
                </FlowProvider>
            </main>
        </AppContainer>
    )
}

export default App
