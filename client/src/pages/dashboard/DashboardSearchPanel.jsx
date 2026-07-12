import { useState } from 'react'
import styled from '@emotion/styled'

import closeIcon from '/src/assets/close.svg'
import addIcon from '/src/assets/add.svg'
import { useAuth } from '../../AuthProvider'
import { useFlow } from '../../FlowProvider'

const DashboardSearchPanelFieldset = styled.fieldset`
    display: flex;
    flex-direction: column;
    gap: 10px;

    margin: 0px;

    border: 1px solid gray;

    padding: 10px;

    &.unsubmitted {
        border-color: dodgerblue;
        box-shadow: 0px 0px 5px dodgerblue;
    }

    h3 {
        margin: 0px;

        font-size: 14pt;
    }

    p {
        margin: 0px;

        font-size: 12pt;
    }

    .iconButton {
        display: flex;
        justify-content: center;
        align-items: center;

        border: 1px solid gray;
        border-radius: 5px;

        padding: 0px;

        width: 25px;
        height: 25px;

        background-color: white;

        &:hover {
            background-color: #efefef;
        }

        img {
            width: 20px;
            height: 20px;
        }
    }

    #dateFilters {
        display: grid;
        grid-template-columns: 1fr 5fr 25px;
        grid-column-gap: 10px;
        grid-row-gap: 5px;

        padding: 0px;

        p {
            grid-column: 1 / 4;
        }

        label {
            grid-column: 1 / 2;

            margin-left: 15px;
        }

        input {
            grid-column: 2 / 3;
            justify-self: end;

            border: 1px solid gray;
            border-radius: 5px;

            padding: 3px;

            width: 175px;
            height: 17px;
        }

        .iconButton {
            grid-column: 3 / 4;
        }
    }

    #fieldValueFilters {
        display: grid;
        grid-template-columns: 1fr 1fr 25px;
        grid-column-gap: 10px;
        grid-row-gap: 5px;

        padding: 0px;

        p {
            grid-column: 1 / 3;
        }

        #fieldNameSelection {
            grid-column: 1 / 2;

            border: 1px solid gray;
            border-radius: 5px;

            width: 90px;
            height: 25px;

            background-color: white;
            
            &:hover {
                background-color: #efefef;
            }
        }

        #queryText {
            grid-column: 2 / 3;
            justify-self: end;

            border: 1px solid gray;
            border-radius: 5px;

            padding: 3px;

            width: 150px;
            height: 17px;
        }

        .iconButton {
            grid-column: 3 / 4;
        }
    }

    #activeFilters {
        display: flex;
        flex-wrap: wrap;
        justify-content: start;
        align-items: center;
        column-gap: 10px;
        row-gap: 5px;

        max-height: 200px;

        overflow-x: hidden;
        overflow-y: scroll;

        .filterPill {
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            gap: 5px;

            border: 1px solid #222;
            border-radius: 5px;

            padding: 2px 5px;

            background-color: white;

            &:hover {
                background-color: #efefef;
            }
            
            p {
                display: flex;
                justify-content: center;
                align-items: center;
                
                margin: 0px;

                font-size: 10pt;
            }

            img {
                height: 12px;
                width: 12px;
            }
        }
    }

    #dashboardSubmitButton {
        border: 1px solid gray;
        border-radius: 5px;

        padding: 5px;

        font-size: 10pt;

        background-color: white;

        &:hover {
            background-color: #efefef;
        }
    }
`

export default function DashboardSearchPanel({ submitRef, disabled }) {
    const [ selectedFieldName, setSelectedFieldName ] = useState('')
    const [ queryText, setQueryText ] = useState('')
    const { volunteer } = useAuth()
    const { query, setQuery } = useFlow()

    // Occurrence field names
    const fieldNames = [
        'errorFlags',
        'dateLabelPrint',
        'fieldNumber',
        'catalogNumber',
        'occurrenceID',
        'userId',
        'userLogin',
        'firstName',
        'firstNameInitial',
        'lastName',
        'recordedBy',
        'sampleId',
        'specimenId',
        'day',
        'month',
        'year',
        'verbatimEventDate',
        'day2',
        'month2',
        'year2',
        'startDayofYear',
        'endDayofYear',
        'country',
        'stateProvince',
        'county',
        'locality',
        'verbatimElevation',
        'decimalLatitude',
        'decimalLongitude',
        'coordinateUncertaintyInMeters',
        'samplingProtocol',
        'relationshipOfResource',
        'resourceID',
        'relatedResourceID',
        'relationshipRemarks',
        'phylumPlant',
        'orderPlant',
        'familyPlant',
        'genusPlant',
        'speciesPlant',
        'taxonRankPlant',
        'url',
        'phylum',
        'class',
        'order',
        'family',
        'genus',
        'subgenus',
        'specificEpithet',
        'taxonomicNotes',
        'scientificName',
        'sex',
        'caste',
        'taxonRank',
        'identifiedBy',
        'familyVolDet',
        'genusVolDet',
        'speciesVolDet',
        'sexVolDet',
        'casteVolDet',
    ]

    /* Handler Functions */

    function handleEnter(event) {
        event.preventDefault()

        const element = submitRef.current
        if (!element) return

        element.click()
    }

    function handleClear(event, key) {
        event.preventDefault()

        setQuery({ ...query, [key]: '', unsubmitted: true })
    }

    function handleClearAll(event) {
        event.preventDefault()

        const newValueQueries = {}
        if (volunteer) newValueQueries['userLogin'] = volunteer

        setQuery({ ...query, start_date: '', end_date: '', valueQueries: newValueQueries, unsubmitted: true })
    }

    function handleAdd(event) {
        event?.preventDefault()

        // Prevent volunteers from adding other userLogin values
        if (volunteer && selectedFieldName === 'userLogin') {
            setSelectedFieldName('')
            setQueryText('')
            return
        }

        // Don't query by blank field names
        if (!selectedFieldName) {
            setQueryText('')
            return
        }

        const values = query.valueQueries[selectedFieldName]?.split(',') ?? []
        const queryTextValues = queryText.split(',').map((value) => value.trim())
        const newValues = values.concat(queryTextValues).join(',')

        setQuery({ ...query, valueQueries: { ...query.valueQueries, [selectedFieldName]: newValues }, unsubmitted: true })
        setSelectedFieldName('')
        setQueryText('')
    }

    function handleRemove(event, fieldName, removeValue) {
        event?.preventDefault()

        // Prevent volunteers from remove userLogin values
        if (volunteer && fieldName === 'userLogin') return

        if (Object.keys(query.valueQueries).includes(fieldName)) {
            const values = query.valueQueries[fieldName]?.split(',') ?? []
            const valueRemoved = values.filter((value) => value !== removeValue)

            if (valueRemoved.length > 0) {
                setQuery({ ...query, valueQueries: { ...query.valueQueries, [fieldName]: valueRemoved.join(',') }, unsubmitted: true })
            } else {
                // Remove fieldName from the query.valueQueries object using destructuring
                const { [fieldName]: _, ...newValueQueries } = query.valueQueries
                setQuery({ ...query, valueQueries: newValueQueries, unsubmitted: true })
            }
        }
    }

    return (
        <DashboardSearchPanelFieldset className={query.unsubmitted ? 'unsubmitted' : ''} disabled={disabled}>
            <h3>Search Records{query.unsubmitted && <span style={{ color: 'dodgerblue' }}>*</span>}</h3>

            <div id='dateFilters'>
                <p>Date</p>

                <label>From</label>
                <input
                    id='minDate'
                    type='date'
                    value={query.start_date}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleEnter(event) }}
                    onChange={(event) => setQuery({ ...query, start_date: event.target.value, unsubmitted: true })}
                />
                <button className='iconButton' onClick={(event) => handleClear(event, 'start_date')}>
                    <img src={closeIcon} alt='Clear' />
                </button>

                <label>Through</label>
                <input
                    id='maxDate'
                    type='date'
                    value={query.end_date}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleEnter(event) }}
                    onChange={(event) => setQuery({ ...query, end_date: event.target.value, unsubmitted: true })}
                />
                <button className='iconButton' onClick={(event) => handleClear(event, 'end_date')}>
                    <img src={closeIcon} alt='Clear' />
                </button>
            </div>

            <div id='fieldValueFilters'>
                <p>Field Values</p>

                <select
                    id='fieldNameSelection'
                    value={selectedFieldName}
                    onChange={(event) => {
                        setSelectedFieldName(event.target.value)
                        setQuery({ ...query, unsubmitted: true })
                    }}
                >
                    <option key='select' value=''>Field...</option>
                    {fieldNames.map((fieldName) => <option key={fieldName} value={fieldName}>{fieldName}</option>)}
                </select>

                <input
                    id='queryText'
                    type='text'
                    placeholder='Enter a query value...'
                    list='queryTextSuggestions'
                    autoComplete='off'
                    value={queryText}
                    onKeyDown={(event) => { if (event.key === 'Enter') handleAdd(event) }}
                    onChange={(event) => {
                        setQueryText(event.target.value)
                        setQuery({ ...query, unsubmitted: true })
                    }}
                />
                <datalist id='queryTextSuggestions'>
                    <option>(empty)</option>
                    <option>(non-empty)</option>
                </datalist>

                <button className='iconButton' onClick={(event) => handleAdd(event)}>
                    <img src={addIcon} alt='Add' />
                </button>
            </div>

            <div id='activeFilters'>
                {(
                    query.start_date ||                                             // Show if a date query is defined
                    query.end_date || 
                    Object.keys(query.valueQueries)
                        .filter((field) => !(volunteer && field === 'userLogin'))   // Ignore userLogin if volunteer is logged in
                        .length > 0                                                 // Show if at least one value query is defined
                ) &&
                    <button className='filterPill' onClick={(event) => handleClearAll(event)}>
                        <p>Clear All</p>
                        <img src={closeIcon} alt='Clear' />
                    </button>
                }
                { query.start_date &&
                    <button className='filterPill' onClick={(event) => handleClear(event, 'start_date')}>
                        <p>From {query.start_date}</p>
                        <img src={closeIcon} alt='Clear' />
                    </button>
                }
                { query.end_date &&
                    <button className='filterPill' onClick={(event) => handleClear(event, 'end_date')}>
                        <p>Through {query.end_date}</p>
                        <img src={closeIcon} alt='Clear' />
                    </button>
                }
                { Object.entries(query.valueQueries).map(([ fieldName, values ]) => values?.split(',')?.map((value) =>
                    <button
                        key={value}
                        className='filterPill'
                        onClick={(event) => handleRemove(event, fieldName, value)}
                    >
                        <p>{fieldName}: {value === '' ? '(empty)' : value}</p>
                        <img src={closeIcon} alt='Clear' />
                    </button>)
                )}
            </div>

            <button
                id='dashboardSubmitButton'
                type='submit'
                value='search'
                ref={submitRef}
                onClick={() => handleAdd()}
            >Search</button>
        </DashboardSearchPanelFieldset>
    )
}