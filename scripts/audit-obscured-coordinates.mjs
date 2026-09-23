// Measures how many stored occurrences hold an iNaturalist stand-in point in
// place of the true one. See docs/obscured-coordinates.md, "Measuring the
// stored population", for what the verdicts mean and how to read the result.
//
// Runs inside the worker container, which has the app's dependencies, its
// iNaturalist token and its Mongo credentials:
//
//   docker cp scripts/audit-obscured-coordinates.mjs worker:/app/
//   docker exec worker npx tsx /app/audit-obscured-coordinates.mjs
//
// Read-only. It asks iNaturalist which observations in the source projects are
// obscured today -- production's own geoprivacy fields are not a usable filter,
// see the document -- then compares every matching occurrence against the
// private point the token is granted.

import ApiService from './shared/lib/services/ApiService.js'
import DatabaseManager from './shared/lib/database/DatabaseManager.js'
import { fieldNames } from './shared/lib/utils/constants.js'

const PROJECTS = { '18521': 'Oregon Bee Atlas', '166376': 'Washington Bee Atlas', '99706': 'Master Melittologist' }
const FILTERS = ['geoprivacy=obscured%2Cprivate', 'taxon_geoprivacy=obscured%2Cprivate']
const TRUE_WITHIN_KM = 0.1
const STAND_IN_BEYOND_KM = 5

const apiToken = await ApiService.fetchINaturalistApiToken()
if (!apiToken) {
    console.error('No API token; the comparison needs the private points a curator token is granted')
    process.exit(1)
}

// Every currently obscured observation in the source projects, keyed by id,
// remembering which projects (atlases) each was found in
const observations = new Map()
for (const project of Object.keys(PROJECTS)) {
    for (const filter of FILTERS) {
        let idAbove = 0
        for (;;) {
            const url = `https://api.inaturalist.org/v1/observations?project_id=${project}&${filter}&per_page=200&order_by=id&order=asc&id_above=${idAbove}`
            const response = await fetch(url, { headers: { Authorization: apiToken } })
            if (!response.ok) {
                console.error(`Fetch failed: ${response.status} for project ${project}, ${filter}`)
                process.exit(1)
            }
            const { results } = await response.json()
            for (const observation of results) {
                const known = observations.get(observation.id) ?? { ...observation, atlases: new Set() }
                known.atlases.add(PROJECTS[project])
                observations.set(observation.id, known)
            }
            if (results.length < 200) break
            idAbove = results.at(-1).id
            await new Promise((resolve) => setTimeout(resolve, 1100))
        }
    }
}

await DatabaseManager.initialize({ skipIndexes: true, skipViews: true })
const occurrences = DatabaseManager.getCollection('occurrences')

// Equirectangular distance, good to well under 1% at these scales
const km = (lat1, lon1, lat2, lon2) =>
    111.2 * Math.sqrt((lat1 - lat2) ** 2 + ((lon1 - lon2) * Math.cos(lat2 * Math.PI / 180)) ** 2)
// iNaturalist draws a stand-in uniformly within the 0.2-degree cell holding the
// true point. Stored pairs are rounded to four decimals, so one can sit exactly
// on a cell edge; allow that rounding when asking whether it is inside.
const CELL = 0.2
const ROUNDING = 0.0001
const inCell = (value, trueValue) => {
    const low = Math.floor(trueValue / CELL) * CELL
    return value >= low - ROUNDING && value <= low + CELL + ROUNDING
}
const sameCell = (lat, lon, trueLat, trueLon) => inCell(lat, trueLat) && inCell(lon, trueLon)

const tally = {}
const count = (verdict, printed) => {
    tally[verdict] ??= { specimens: 0, printed: 0 }
    tally[verdict].specimens++
    if (printed) tally[verdict].printed++
}
const wrong = []
const unsettled = []
let matchedObservations = 0

for (const observation of observations.values()) {
    const records = await occurrences.find(
        { [fieldNames.iNaturalistUrl]: observation.uri },
        { projection: { [fieldNames.fieldNumber]: 1, [fieldNames.latitude]: 1, [fieldNames.longitude]: 1, [fieldNames.locality]: 1, [fieldNames.stateProvince]: 1, [fieldNames.year]: 1, [fieldNames.iNaturalistAlias]: 1, [fieldNames.dateLabelPrint]: 1 } }
    ).toArray()
    if (records.length === 0) continue
    matchedObservations++

    const publicPoint = observation.geojson?.coordinates
    const privatePoint = observation.private_geojson?.coordinates

    for (const record of records) {
        const latitude = parseFloat(record[fieldNames.latitude])
        const longitude = parseFloat(record[fieldNames.longitude])
        const printed = !!record[fieldNames.dateLabelPrint]

        let verdict
        let distance
        if (!isFinite(latitude) || !isFinite(longitude)) {
            verdict = '0 no stored coordinates'
        } else if (publicPoint && latitude.toFixed(4) === publicPoint[1].toFixed(4) && longitude.toFixed(4) === publicPoint[0].toFixed(4)) {
            verdict = '1 current stand-in'
        } else if (!privatePoint) {
            verdict = '4 no private point available'
        } else {
            distance = km(latitude, longitude, privatePoint[1], privatePoint[0])
            verdict = distance < TRUE_WITHIN_KM ? '3 true'
                : distance >= STAND_IN_BEYOND_KM ? (sameCell(latitude, longitude, privatePoint[1], privatePoint[0]) ? '2 older stand-in' : '2 far, different cell')
                : '5 between'
        }
        count(verdict, printed)
        const row = {
            fieldNumber: record[fieldNames.fieldNumber],
            labelPrinted: record[fieldNames.dateLabelPrint] || '',
            collectionYear: record[fieldNames.year],
            collector: record[fieldNames.iNaturalistAlias],
            atlas: [...observation.atlases].join('; '),
            stateOnLabel: record[fieldNames.stateProvince],
            localityOnLabel: record[fieldNames.locality],
            latitudeOnLabel: record[fieldNames.latitude],
            longitudeOnLabel: record[fieldNames.longitude],
            kmFromTruePoint: distance?.toFixed(1) ?? '',
            verdict: verdict.slice(2),
            observation: observation.uri
        }
        if (verdict.startsWith('1') || verdict.startsWith('2')) wrong.push(row)
        if (verdict.startsWith('4') || verdict.startsWith('5')) unsettled.push(row)
    }
}

console.log(JSON.stringify({
    measuredOn: new Date().toISOString().slice(0, 10),
    obscuredObservationsInProjects: observations.size,
    withPrivatePoint: [...observations.values()].filter((observation) => observation.private_geojson).length,
    matchedToOccurrences: matchedObservations,
    tally
}, null, 2))

// Two lists: the stand-ins, for whoever decides about the pinned labels, and
// the specimens that cannot be settled until their observer grants access.
// Stand-in points are what iNaturalist publishes, so nothing here reveals a
// true location.
const fs = await import('node:fs')
const writeCsv = (name, rows) => {
    const header = Object.keys(rows[0] ?? { fieldNumber: 1 })
    const csv = [header.join(','), ...rows.map((row) => header.map((key) => JSON.stringify(row[key] ?? '')).join(','))].join('\n')
    fs.writeFileSync(name, csv + '\n')
    console.error(`${rows.length} specimens written to ${name}`)
}
writeCsv('audit-wrong-points.csv', wrong)
writeCsv('audit-unsettled-points.csv', unsettled)

process.exit(0)
