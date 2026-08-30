import { fieldNames } from '../utils/constants.js'
import BaseRepository from './BaseRepository.js'

export default class ObservationRepository extends BaseRepository {
    constructor() {
        super('observations')
    }

    /* CRUD Operations */

    // Read
    async distinctCoordinates() {
        // Occurrences are built from the private coordinates where we have them, so
        //  elevations must be looked up for those; keying off the public geojson
        //  alone leaves every trusted obscured record without an elevation
        const coordinatesField = { $ifNull: [ '$private_geojson.coordinates', '$geojson.coordinates' ] }

        const response = await this.aggregate([
            {
                $match: {
                    $or: [
                        { 'private_geojson.coordinates': { $exists: true, $ne: null } },
                        { 'geojson.coordinates': { $exists: true, $ne: null } }
                    ]
                }
            },
            {
                $group: {
                    _id: {
                        $concat: [
                            { $toString: { $round: [{ $arrayElemAt: [ coordinatesField, 1 ] }, 4] } },
                            ',',
                            { $toString: { $round: [{ $arrayElemAt: [ coordinatesField, 0 ] }, 4] } }
                        ]
                    }
                }
            }
        ])
        const coordinates = response?.map((doc) => doc._id) ?? []

        return coordinates
    }

    async findUnmatched() {
        return await this.findMany({ matched: false })
    }
}