import ApiService from './ApiService.js'
import FileManager from '../utils/FileManager.js'
import { abbreviations } from '../utils/constants.js'

class PlacesService {
    constructor() {
        this.filePath = './shared/data/places.json'
        this.places = {}

        this.readPlaces()
    }

    /*
     * writePlaces
     * Writes given place data to places.json; if no data provided, writes this.places
     */
    writePlaces(places) {
        const data = places || this.places
        const success = FileManager.writeJSON(this.filePath, data)

        // If wrote successfully, update this.places
        if (success) this.places = data

        return success
    }

    /*
     * readPlaces()
     * Reads and parses places.json; updates this.places
     */
    readPlaces() {
        const data = FileManager.readJSON(this.filePath, this.places)
        if (data) {
            this.places = data
            return data
        }
    }

    /*
     * getPlaces()
     * Searches placeIds for country, state/province, and county names using the place data
     */
    getPlaceNames(placeIds) {
        // Read place data if not defined
        if (!Object.keys(this.places).length === 0) {
            this.readPlaces()
        }

        // Default to empty strings
        let country = '', stateProvince = '', county = ''

        // Check that placeIds exists
        if (!placeIds) {
            return { country, stateProvince, county }
        }

        // Look up each place ID and set the appropriate output string
        for (const id of placeIds) {
            const place = this.places[id]

            // Set the country, stateProvince, or county output string based on the 'admin_level' value, assuming the place was found in places.json
            if (place?.at(0) === '0') country = place[1] ?? ''
            if (place?.at(0) === '10') stateProvince = place[1] ?? ''
            if (place?.at(0) === '20') county = place[1] ?? ''
        }

        // Remove 'County' or 'Co' or 'Co.' from the county field (case insensitive) before returning all values
        const countyRegex = new RegExp(/(?<![^,.\s])Co(?:unty)?\.?(?![^,.\s])+/ig)
        county = county.replace(countyRegex, '').trim()
        // Abbreviate county if necessary
        county = abbreviations.counties[county] ?? county
        
        return { country, stateProvince, county }
    }

    /*
     * updatePlacesFromIds()
     * Updates local place data from the given place IDs, fetching any not already known
     */
    async updatePlacesFromIds(placeIds, updateProgress) {
        // Read place data
        this.readPlaces()

        // Compile a list of unknown places from the given IDs
        const unknownPlaces = []
        for (const id of placeIds ?? []) {
            if (!(id in this.places) && !unknownPlaces.includes(id)) {
                unknownPlaces.push(id)
            }
        }

        // Fetch data for each unknown place from iNaturalist.org and combine it with the existing data
        if (unknownPlaces.length > 0) {
            const newPlaces = await ApiService.fetchPlacesByIds(unknownPlaces, updateProgress)
            for (const newPlace of newPlaces) {
                if (
                    newPlace['admin_level'] === 0 ||
                    newPlace['admin_level'] === 10 ||
                    newPlace['admin_level'] === 20
                ) {
                    this.places[newPlace['id']] = [
                        newPlace['admin_level'].toString(),
                        newPlace['name']
                    ]
                }
            }
        }

        // Store the updated place data
        this.writePlaces()
    }

    /*
     * updatePlacesFromObservations()
     * Updates local place data from the place IDs referenced by the given observations
     */
    async updatePlacesFromObservations(observations, updateProgress) {
        const placeIds = []
        for (const observation of observations) {
            for (const id of observation.place_ids ?? []) {
                placeIds.push(id)
            }
        }

        return await this.updatePlacesFromIds(placeIds, updateProgress)
    }
}

export default new PlacesService()