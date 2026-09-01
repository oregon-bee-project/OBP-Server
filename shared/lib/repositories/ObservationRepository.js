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

    /*
     * distinctPlaceIds()
     * Returns every distinct place ID referenced by observations matching the filter.
     * Computed in the database so full observation documents never enter memory.
     */
    async distinctPlaceIds(filter = {}) {
        const response = await this.aggregate([
            { $match: { ...filter, place_ids: { $exists: true, $ne: null } } },
            { $unwind: '$place_ids' },
            { $group: { _id: '$place_ids' } }
        ])

        return response?.map((doc) => doc._id) ?? []
    }

    /*
     * distinctTaxonIds()
     * Returns every distinct taxon ID referenced by observations matching the filter, drawn
     * from each taxon's ancestry (min_species_ancestry) and its synonymous taxon IDs. IDs are
     * returned as strings to match the keys used in the local taxonomy data.
     */
    async distinctTaxonIds(filter = {}) {
        const response = await this.aggregate([
            { $match: { ...filter, taxon: { $exists: true, $ne: null } } },
            {
                $project: {
                    ids: {
                        $concatArrays: [
                            {
                                $cond: [
                                    { $ifNull: [ '$taxon.min_species_ancestry', false ] },
                                    { $split: [ '$taxon.min_species_ancestry', ',' ] },
                                    []
                                ]
                            },
                            {
                                $map: {
                                    input: { $ifNull: [ '$taxon.current_synonymous_taxon_ids', [] ] },
                                    as: 'id',
                                    in: { $toString: '$$id' }
                                }
                            }
                        ]
                    }
                }
            },
            { $unwind: '$ids' },
            { $group: { _id: '$ids' } }
        ])

        return response?.map((doc) => doc._id) ?? []
    }
}