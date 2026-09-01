import { fieldNames } from '../utils/constants.js'
import BaseRepository from './BaseRepository.js'

export default class ObservationRepository extends BaseRepository {
    constructor() {
        super('observations')
    }

    /* CRUD Operations */

    // Read
    async distinctCoordinates() {
        // This warms an elevation cache keyed by coordinate, so it takes both points
        //  rather than choosing between them. Which one an occurrence uses is
        //  getObservationLocation's decision and depends on that record's geoprivacy;
        //  the create path reads `elevations[coordinate] || ''` with no fallback, so
        //  caching the wrong one leaves the record with no elevation at all.
        const coordinatePairs = {
            $setUnion: [
                { $cond: [ { $ifNull: [ '$geojson.coordinates', false ] }, [ '$geojson.coordinates' ], [] ] },
                { $cond: [ { $ifNull: [ '$private_geojson.coordinates', false ] }, [ '$private_geojson.coordinates' ], [] ] }
            ]
        }

        const response = await this.aggregate([
            {
                $match: {
                    $or: [
                        { 'private_geojson.coordinates': { $exists: true, $ne: null } },
                        { 'geojson.coordinates': { $exists: true, $ne: null } }
                    ]
                }
            },
            { $project: { coordinates: coordinatePairs } },
            { $unwind: '$coordinates' },
            {
                $group: {
                    _id: {
                        $concat: [
                            { $toString: { $round: [{ $arrayElemAt: [ '$coordinates', 1 ] }, 4] } },
                            ',',
                            { $toString: { $round: [{ $arrayElemAt: [ '$coordinates', 0 ] }, 4] } }
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
        // This warms a name cache keyed by place ID, so it takes the union of both
        //  lists rather than choosing between them. Which list an occurrence actually
        //  reads is getObservationLocation's decision and depends on the record's
        //  geoprivacy; caching the name of a place we end up not using costs one
        //  entry, while missing one leaves a record with no county at all.
        const placeIdsField = {
            $setUnion: [
                { $ifNull: [ '$place_ids', [] ] },
                { $ifNull: [ '$private_place_ids', [] ] }
            ]
        }

        const response = await this.aggregate([
            {
                $match: {
                    $and: [
                        filter,
                        {
                            $or: [
                                { private_place_ids: { $exists: true, $ne: null } },
                                { place_ids: { $exists: true, $ne: null } }
                            ]
                        }
                    ]
                }
            },
            { $project: { placeIds: placeIdsField } },
            { $unwind: '$placeIds' },
            { $group: { _id: '$placeIds' } }
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