import path from 'path'
import fs from 'fs'
import { google } from 'googleapis'

import { delay, encryptObject, decryptObject } from '../utils/utilities.js'
import { Google } from '../config/environment.js'
import FileManager from '../utils/FileManager.js'

class ApiService {
    constructor() {
        this.initialBackoffMs = 1000
        this.backoffLimitMs = 8000
        this.defaultPageSize = 200
        this.iNaturalistApiToken = ''
        this.iNaturalistApiTokenExpiresAt = 0
    }

    // Decode a JWT's 'exp' claim (as milliseconds since epoch) without verifying its signature
    // Returns 0 if the token cannot be parsed
    #getApiTokenExpiry(token) {
        try {
            const payload = token.split('.')[1]
            const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
            return Number.isFinite(exp) ? exp * 1000 : 0
        } catch {
            return 0
        }
    }

    async fetchINaturalistApiToken() {
        // iNaturalist API tokens are JWTs valid for ~24 hours; reuse the cached token until it nears
        // expiration (60-second safety margin) instead of minting a new one on every request
        if (this.iNaturalistApiToken && Date.now() < this.iNaturalistApiTokenExpiresAt - 60_000) {
            return this.iNaturalistApiToken
        }

        // The cached token is missing or (nearly) expired; reset it before attempting to fetch a new one
        this.iNaturalistApiToken = ''
        this.iNaturalistApiTokenExpiresAt = 0

        // Read the stored OAuth access token from the local file
        const { encryptedToken } = FileManager.readJSON(path.resolve('./shared/data/iNaturalistToken.json'), { encryptedToken: {} })
        const access_token = decryptObject(encryptedToken)

        if (!access_token) {
            console.error('No iNaturalist OAuth access token found; API requests will be unauthenticated')
            return this.iNaturalistApiToken
        }

        // Exchange the OAuth access token for a temporary API token
        try {
            const response = await fetch('https://www.inaturalist.org/users/api_token', {
                headers: { 'Authorization': `Bearer ${access_token}` }
            })

            if (!response.ok) {
                console.error(`Failed to fetch iNaturalist API token: ${response.status} ${response.statusText}`)
                return this.iNaturalistApiToken
            }

            const { api_token } = await response.json()
            this.iNaturalistApiToken = api_token ?? ''
            // Fall back to a conservative 12-hour lifetime if the expiration cannot be read from the token
            this.iNaturalistApiTokenExpiresAt = this.#getApiTokenExpiry(this.iNaturalistApiToken) || (Date.now() + 12 * 60 * 60 * 1000)
        } catch (error) {
            console.error('Error while fetching iNaturalist API token:', error)
        }

        return this.iNaturalistApiToken
    }

    async fetchUrl(url) {
        // Get a temporary iNaturalist API token
        await this.fetchINaturalistApiToken()

        // Fetch and concatenate the data, catching errors
        try {
            // Make requests with exponential backoff to avoid API throttling
            for (let i = this.initialBackoffMs; i <= this.backoffLimitMs; i *= 2) {
                const config = {}
                if (this.iNaturalistApiToken) config.headers = { 'Authorization': `Bearer ${this.iNaturalistApiToken}` }
                const response = await fetch(url, config)

                if (response.ok) {
                    return await response.json()
                } else if (response.status === 429) {    // 'Too Many Requests'
                    console.error(`Hit API request limit. Waiting ${i} milliseconds...`)
                    await delay(i)
                } else {
                    console.error(`Bad response while fetching '${url}':`, response)
                    break
                }
            }
        } catch (error) {
            console.error(`Error while fetching ${url}:`, error)
        }
    }

    async fetchUrlByIds(buildUrl, pageSize, ids, updateProgress) {
        await updateProgress(0)

        // ids can be a very long list, so batch requests to avoid iNaturalist API refusal
        const totalPages = Math.ceil(ids.length / pageSize)
        let pageStart = 0
        let pageEnd = Math.min(pageSize, ids.length)

        // Gather results until all pages are complete
        let results = []
        for (let i = 0; i < totalPages; i++) {
            const requestUrl = await buildUrl(ids.slice(pageStart, pageEnd).join(','))

            const response = await this.fetchUrl(requestUrl)
            results = results.concat(response?.results ?? [])

            // Increment page
            pageStart = pageEnd
            pageEnd = Math.min(pageEnd + pageSize, ids.length)

            await updateProgress(100 * (i + 1) / totalPages)
        }

        return results
    }

    async fetchUrlPages(url, updateProgress) {
        if (!url) return []
        
        await updateProgress(0)

        const pagedUrl = (page) => {
            const urlObj = new URL(url)
            const params = urlObj.searchParams

            urlObj.hostname = 'api.inaturalist.org'
            urlObj.pathname = '/v1/observations'

            params.delete('per_page')
            params.delete('page')

            params.set('per_page', '200')
            params.set('page', page ? page.toString() : '1')

            return urlObj.toString()
        }

        let response = await this.fetchUrl(pagedUrl(1))
        let results = response?.results ?? []

        const totalResults = parseInt(response?.total_results ?? '0')
        let totalPages = Math.ceil(totalResults / 200)

        await updateProgress(100 / totalPages)

        for (let i = 2; i <= totalPages; i++) {
            response = await this.fetchUrl(pagedUrl(i))
            results = results.concat(response?.results ?? [])
            await updateProgress(100 * i / totalPages)
        }

        return results
    }

    async fetchObservations(sourceId, minDate, maxDate, page = 1, pageSize = this.defaultPageSize) {
        const requestUrl = `https://api.inaturalist.org/v1/observations?project_id=${sourceId}&d1=${minDate}&d2=${maxDate}&per_page=${pageSize}&page=${page}`

        return await this.fetchUrl(requestUrl)
    }

    async fetchObservationsByIds(observationIds, updateProgress) {
        return await this.fetchUrlByIds(
            (ids) => `https://api.inaturalist.org/v1/observations?per_page=${200}&id=${ids}`,
            200,
            observationIds,
            updateProgress
        )
    }

    async fetchPlacesByIds(placeIds, updateProgress) {
        return await this.fetchUrlByIds(
            (ids) => `https://api.inaturalist.org/v1/places/${ids}`,
            200,
            placeIds,
            updateProgress
        )
    }

    async fetchTaxaByIds(taxaIds, updateProgress) {
        return await this.fetchUrlByIds(
            (ids) => `https://api.inaturalist.org/v1/taxa/${ids}`,
            30,
            taxaIds,
            updateProgress
        )
    }

    async *fetchObservationsBySourceChunks(sourceId, minDate, maxDate, updateProgress) {
        await updateProgress(0)

        let chunk = []
        const chunkSize = 5000

        // Break date range into 6-month partitions to avoid iNaturalist API search window restrictions
        const d1 = new Date(minDate + 'T12:00Z')    // Use noon GMT so every location is the same calendar date
        const d2 = new Date(maxDate + 'T12:00Z')

        let partitionStart = new Date(d1)
        let sixMonths = new Date(d1)
        sixMonths.setMonth(sixMonths.getMonth() + 6)
        sixMonths.setDate(sixMonths.getDate() - 1)  // Subtract one day to avoid overlapping partitions
        let partitionEnd = new Date(Math.min(d2, sixMonths))

        // Precalculate partitions and fetch first page to get total page count
        let totalPages = 0
        const partitions = []
        while (partitionStart <= d2) {
            // Format parition boundaries to iNaturalist query strings (YYYY-MM-DD)
            const partitionStartString = partitionStart.toISOString().slice(0, 10)
            const partitionEndString = partitionEnd.toISOString().slice(0, 10)

            // Fetch first page
            let response = await this.fetchObservations(sourceId, partitionStartString, partitionEndString, 1, 200)

            const observationCount = parseInt(response?.total_results ?? '0')
            const pageCount = Math.ceil(observationCount / 200)
            totalPages += pageCount
            partitions.push({
                start: partitionStart.toISOString().slice(0, 10),
                end: partitionEnd.toISOString().slice(0, 10),
                firstPage: response?.results ?? [],
                observationCount,
                pageCount
            })

            // Increment partition
            partitionStart = new Date(partitionEnd)
            partitionStart.setDate(partitionStart.getDate() + 1)    // Add one day to avoid overlapping partitions
            sixMonths = new Date(partitionStart)
            sixMonths.setMonth(sixMonths.getMonth() + 6)
            sixMonths.setDate(sixMonths.getDate() - 1)              // Subtract one day to avoid overlapping partitions
            partitionEnd = new Date(Math.min(d2, sixMonths))
        }

        // Fetch remaining pages of each partition
        let k = 0   // Total page index across all partitions
        for (let i = 0; i < partitions.length; i++) {
            // Add first page of current partition to chunk
            chunk = chunk.concat(partitions[i].firstPage)
            // If the chunk is large enough, yield it and reset the chunk for the next call
            if (chunk.length >= chunkSize) {
                yield chunk
                chunk = []
            }

            await updateProgress(100 * (++k) / totalPages)

            for (let j = 2; j <= partitions[i].pageCount; j++) {
                const response = await this.fetchObservations(sourceId, partitions[i].start, partitions[i].end, j, 200)
                chunk = chunk.concat(response?.results ?? [])
                await updateProgress(100 * (++k) / totalPages)

                // If the chunk is large enough, yield it and reset the chunk for the next call
                if (chunk.length >= chunkSize) {
                    yield chunk
                    chunk = []
                }
            }
        }

        // Yield any remaining observations (a partial chunk)
        if (chunk.length > 0) {
            yield chunk
        }
    }

    async getGoogleDriveClient() {
        // Read an OAuth token information from the local file
        const { encryptedToken } = FileManager.readJSON(path.resolve('./shared/data/GoogleToken.json'), { encryptedToken: {} })
        const tokens = decryptObject(encryptedToken)

        if (!tokens) return

        // Read credentials file and create an OAuth client
        const encryptedCredentials = FileManager.readJSON(path.resolve('./shared/data/credentials.json'))
        const credentials = decryptObject(encryptedCredentials)
        const { client_id, client_secret, redirect_uris } = credentials?.web ?? {}

        const GoogleOAuthClient = new google.auth.OAuth2(
            client_id,
            client_secret,
            redirect_uris[0]
        )
        GoogleOAuthClient.setCredentials(tokens)

        // Refresh token if expired
        GoogleOAuthClient.on('tokens', (newTokens) => {
            const updatedTokens = { ...tokens, ...newTokens }
            const encryptedTokens = encryptObject(updatedTokens)
            FileManager.writeJSON(path.resolve('./shared/data/GoogleToken.json'), { encryptedToken: encryptedTokens ?? {} })
        })

        // Return a new Drive client using the OAuth client
        return google.drive({ version: 'v3', auth: GoogleOAuthClient })
    }

    async uploadFileToGoogleDrive(filePath, updateProgress = null) {
        try {
            const GoogleDriveClient = await this.getGoogleDriveClient()
            if (!GoogleDriveClient) throw new Error('Unable to create Google Drive client')

            const resolvedPath = path.resolve(filePath)
            const fileName = path.basename(resolvedPath)
            const mimeTypes = {
                'csv': 'text/csv',
                'pdf': 'application/pdf',
                'json': 'application/json'
            }
            const extension = path.extname(resolvedPath)
            const mimeType = mimeTypes[extension] || 'application/octet-stream'
            const fileSize = fs.statSync(resolvedPath).size
            const folderId = Google.backupDriveId

            const response = await GoogleDriveClient.files.create(
                {
                    requestBody: {
                        name: fileName,
                        parents: [ folderId ]
                    },
                    media: {
                        mimeType,
                        body: fs.createReadStream(resolvedPath)
                    },
                    fields: 'id, name, webViewLink',
                    supportsAllDrives: true
                },
                {
                    onUploadProgress: (event) => {
                        if (updateProgress) updateProgress(100 * (event.bytesRead ?? 0) / fileSize)
                    }
                }
            )

            return {
                fileId: response?.data?.id ?? '',
                fileName: response?.data?.name ?? '',
                uri: response?.data?.webViewLink ?? ''
            }
        } catch (error) {
            console.error('Failed to upload file:', error)
        }
    }
}

export default new ApiService()