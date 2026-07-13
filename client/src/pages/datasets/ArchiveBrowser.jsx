import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import styled from '@emotion/styled'

import folderIcon from '/src/assets/folder.svg'
import folderZipIcon from '/src/assets/folder_zip.svg'
import csvIcon from '/src/assets/csv.svg'
import fileIcon from '/src/assets/file.svg'
import downloadingIcon from '/src/assets/downloading.svg'

const ArchiveBrowserContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: 10px;

    border: 1px solid #222;
    border-radius: 5px;

    padding: 20px;

    min-width: 400px;

    h2 {
        margin: 0px;
        margin-bottom: 5px;

        font-size: 16pt;
    }

    .directory {
        display: grid;
        grid-template-columns: repeat(10, 100px);
        gap: 10px;

        .directoryItem {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;

            border: 1px solid transparent;
            border-radius: 5px;

            padding: 0px 5px 5px 5px;

            color: #222;
            text-decoration: none;

            background-color: white;

            cursor: pointer;

            &:hover {
                background-color: #efefef;
            }

            &:focus {
                border: 1px solid gray;
            }

            img {
                width: 50px;
                height: 50px;
            }

            label {
                font-size: 12px;

                text-align: center;
                word-break: break-all;

                cursor: pointer;
            }
        }

        .downloading {
            cursor: not-allowed;

            label {
                cursor: not-allowed;
            }
        }
    }
`

export default function ArchiveBrowser() {
    const [ selectedFileType, setSelectedFileType ] = useState()

    const directories = [
        { name: 'Addresses', endpoint: 'addresses' },
        { name: 'Backups', endpoint: 'backups' },
        { name: 'Duplicates', endpoint: 'duplicates' },
        { name: 'Emails', endpoint: 'emails' },
        { name: 'Flags', endpoint: 'flags' },
        { name: 'Labels', endpoint: 'labels' },
        { name: 'Observations', endpoint: 'observations' },
        { name: 'Occurrences', endpoint: 'occurrences' },
        { name: 'Mismatches', endpoint: 'mismatches' },
        { name: 'Pivots', endpoint: 'pivots' },
        { name: 'Pulls', endpoint: 'pulls' },
        { name: 'Reports', endpoint: 'reports' },
        { name: 'Uploads', endpoint: 'uploads' }
    ]

    const { error: archiveQueryError, data: archiveData } = useQuery({
        queryKey: ['archiveData', selectedFileType],
        queryFn: async () => {
            const res = await fetch(`/api/archive/${selectedFileType}`)
            const resJSON = await res.json()

            return resJSON
        },
        refetchInterval: selectedFileType ? 1000 : false,
        refetchOnMount: 'always',
        enabled: !!selectedFileType
    })

    const { data: downloads } = useQuery({
        queryKey: ['archiveDownloads', archiveData],
        queryFn: async () => {
            const downloads = []

            for (const file of archiveData.files) {
                const response = await axios.get(file.uri, { responseType: 'blob' }).catch((error) => {
                    return { status: error.status }
                })
                const download = {
                    fileName: file.fileName,
                    type: selectedFileType,
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
        enabled: !!archiveData
    })

    return (
        <ArchiveBrowserContainer>
            <h2>Archive Browser</h2>

            { !selectedFileType ? (
                <div className='directory'>
                    { directories.map((directory) =>
                        <button
                            className='directoryItem'
                            key={directory.endpoint}
                            onClick={() => setSelectedFileType(directory.endpoint)}
                        >
                            <img src={folderIcon} alt={`${directory.name} file`} />
                            <label>{directory.name}</label>
                        </button>
                    )}
                </div>
            ) : (
                <div className='directory'>
                    <button
                        className='directoryItem'
                        onClick={() => setSelectedFileType(null)}
                    >
                        <img src={folderIcon} alt='Parent directory' />
                        <label>Parent directory</label>
                    </button>

                    { archiveData?.files && !downloads && archiveData.files.map(({ fileName }) =>
                        <button
                            className='directoryItem downloading'
                            key={fileName}
                            disabled
                        >
                            <img src={downloadingIcon} alt={fileName} />
                            <label>{fileName}</label>
                        </button>
                    )}
                    
                    { downloads?.map(({ fileName, url }) => {
                        let icon = fileIcon
                        if (fileName.endsWith('.csv')) icon = csvIcon
                        if (fileName.endsWith('.zip')) icon = folderZipIcon

                        return (
                            <a
                                className='directoryItem'
                                key={fileName}
                                href={url}
                                download={fileName}
                            >
                                <img src={icon} alt={fileName} />
                                <label>{fileName}</label>
                            </a>
                        )
                    })}
                </div>
            )}
        </ArchiveBrowserContainer>
    )
}
