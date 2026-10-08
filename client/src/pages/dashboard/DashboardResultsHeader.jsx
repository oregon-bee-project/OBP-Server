import styled from '@emotion/styled'

import chevronLeftIcon from '/src/assets/chevron_left.svg'
import chevronRightIcon from '/src/assets/chevron_right.svg'
import DownloadButton from './DownloadButton'
import { useFlow } from '../../FlowProvider'

const DashboardResultsHeaderContainer = styled.fieldset`
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 10px;

    border: 1px solid #222;
    border-radius: 5px;

    padding: 15px;

    margin: 0px;

    white-space: nowrap;

    #sortDirContainer {
        display: flex;
        flex-direction: row;
        justify-content: center;
        align-items: center;
        gap: 10px;

        label {
            margin: 0px;

            font-size: 12pt;
        }

        select {
            border: 1px solid gray;
            border-radius: 5px;

            height: 25px;

            background-color: white;
        
            &:hover {
                background-color: #efefef;
            }
        }
    }

    #resultsHeaderRight {
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: center;
        gap: 15px;

        #resultsPagination {
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            gap: 20px;

            p {
                margin: 0px;

                font-size: 12pt;
            }

            #resultsPageSelector {
                display: flex;
                flex-direction: row;
                justify-content: center;
                align-items: center;
                gap: 5px;

                input[type='number'] {
                    text-align: center;

                    border: 1px solid gray;
                    border-radius: 5px;

                    padding: 5px;

                    width: 50px;

                    font-size: 10pt;

                    appearance: textfield;
                    -moz-appearance: textfield;
                    &::-webkit-inner-spin-button, &::-webkit-outer-spin-button {
                        -webkit-appearance: none;
                    }
                }

                .pageIncrementButton {
                    display: flex;
                    justify-content: center;
                    align-items: center;

                    border: 1px solid gray;
                    border-radius: 5px;

                    padding: 0px;

                    width: 32px;
                    height: 32px;

                    background-color: white;

                    &:hover {
                        background-color: #efefef;
                    }
                    
                    img {
                        width: 25px;
                        height: 25px;
                    }
                }
            }
        }

        #downloadResults {
            display: flex;
            justify-content: center;
            align-items: center;
        }
    }
`

export default function DashboardResultsHeader({ handleEnter, disabled }) {
    const { query, setQuery, results } = useFlow()

    let pageMax = results?.pagination?.totalPages ? results?.pagination?.totalPages : 0
    let currentPage = results?.pagination?.currentPage ?? 1
    let pageLength = results?.data?.length ?? 0
    let totalDocuments = results?.pagination?.totalDocuments ?? 0

    const recordsText = `Showing ${pageLength.toLocaleString('en-US')} of ${totalDocuments.toLocaleString('en-US')} records`
    const pagesText = `Page ${currentPage.toLocaleString('en-US')} of ${pageMax.toLocaleString('en-US')}`

    return (
        <DashboardResultsHeaderContainer disabled={disabled}>
            <div id='sortDirContainer'>
                <label htmlFor='sortBy'>Sort By:</label>
                <select
                    id='sortBy'
                    value={query.sort_by}
                    onChange={(event) => setQuery({ ...query, sort_by: event.target.value, unsubmitted: true })}
                >
                    <option value='fieldNumber'>fieldNumber</option>
                    <option value='date'>date</option>
                    <option value='dateLabelPrint'>dateLabelPrint</option>
                </select>
                <select
                    id='sortDir'
                    value={query.sort_dir}
                    onChange={(event) => setQuery({ ...query, sort_dir: event.target.value, unsubmitted: true })}
                >
                    <option value='asc'>ascending</option>
                    <option value='desc'>descending</option>
                </select>
            </div>
            <div id='resultsHeaderRight'>
                <div id='resultsPagination'>
                    <p>{recordsText} ({pagesText})</p>
                    <div id='resultsPageSelector'>
                        <button className='pageIncrementButton' onClick={() => setQuery({ ...query, page: Math.max(1, query.page - 1) })}>
                            <img src={chevronLeftIcon} alt='Prev' />
                        </button>
                        <input
                            id='resultsPage'
                            type='number'
                            value={query.page}
                            min={1}
                            max={Math.max(pageMax, 1)}
                            onKeyDown={(event) => { if (event.key === 'Enter') handleEnter(event) }}
                            onChange={(event) => setQuery({ ...query, page: parseInt(event.target.value) })}
                        />
                        <button className='pageIncrementButton' onClick={() => setQuery({ ...query, page: Math.max(1, (query.page + 1) % Math.max(pageMax + 1, 1)) })}>
                            <img src={chevronRightIcon} alt='Next' />
                        </button>
                    </div>
                </div>
                <div id='downloadResults'>
                    <DownloadButton searchParams={query.searchParams} />
                </div>
            </div>
        </DashboardResultsHeaderContainer>
    )
}
