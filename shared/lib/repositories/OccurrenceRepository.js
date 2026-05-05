import { fieldNames, occurrences } from '../utils/constants.js'
import BaseRepository from './BaseRepository.js'

export default class OccurrenceRepository extends BaseRepository {
    constructor() {
        super('occurrences')
        this.sortConfig = occurrences.sortConfig
    }

    /* Helper Methods */

    numberToSortableString(number, maxDigits = 16) {
        if (number === null || number === undefined || number === '') {
            return 'z'.repeat(maxDigits)    // Blanks sorted last
        }

        const value = parseFloat(number)
        if (isNaN(value)) {
            return 'z'.repeat(maxDigits)    // Invalid numbers sorted last
        }

        return value.toString().padStart(maxDigits, '0')
    }

    setSortField(document, sortConfig) {
        const processedDocument = { ...document }

        // Assemble a single composite sort string
        const compositeParts = []
        sortConfig.forEach((config) => {
            const { field, type = 'string' } = config
            const value = document[field]

            if (type === 'number') {
                compositeParts.push(this.numberToSortableString(value, 16))
            } else {
                const sortValue = value || 'z'.repeat(16)   // Blanks sorted last
                compositeParts.push(sortValue)
            }
        })

        processedDocument.composite_sort = compositeParts.join('|')
        return processedDocument
    }

    setDateField(document) {
        const processedDocument = { ...document }

        let year = parseInt(processedDocument[fieldNames.year] ?? '')
        year = isNaN(year) ? 2100 : year    // Sort blank years at end; hopefully 2100 is far enough in the future

        let monthIndex = parseInt(processedDocument[fieldNames.month] ?? '') - 1
        monthIndex = isNaN(monthIndex) ? 11 : monthIndex   // Sort blank months at end of year

        let day = parseInt(processedDocument[fieldNames.day] ?? '')
        day = isNaN(day) ? new Date(year, monthIndex + 1, 0).getDate() : day    // Sort blank days at end of month; day 0 of the following month is the last day of the current month

        processedDocument.date = new Date(year, monthIndex, day, 12, 0, 0, 0)    // Set time to noon UTC to avoid timezone issues

        return processedDocument
    }

    /* CRUD Operations */

    // Create
    async create(document) {
        let processedDocument = this.setSortField(document, this.sortConfig)
        processedDocument = this.setDateField(processedDocument)

        return await super.create(processedDocument)
    }

    async createMany(documents) {
        let processedDocuments = documents.map((doc) => this.setSortField(doc, this.sortConfig))
        processedDocuments = processedDocuments.map((doc) => this.setDateField(doc))

        return await super.createMany(processedDocuments)
    }

    // Read
    async distinctCoordinates(filter = {}) {
        // Group by unique latitude-longitude combinations and convert to floats
        const response = await this.aggregate([
            {
                $match: {
                    ...filter,
                    $and: [
                        { [fieldNames.latitude]: { $exists: true, $nin: [ null, '' ] } },
                        { [fieldNames.longitude]: { $exists: true, $nin: [ null, '' ] } }
                    ]
                }
            },
            {
                $group: {
                    _id: {
                        latitude: `$${fieldNames.latitude}`,
                        longitude: `$${fieldNames.longitude}`
                    }
                }
            },
            {
                $project: {
                    _id: 0,
                    latitude: {
                        $convert: {
                            input: '$_id.latitude',
                            to: 'double',
                            onError: null,
                            onNull: null
                        }
                    },
                    longitude: {
                        $convert: {
                            input: '$_id.longitude',
                            to: 'double',
                            onError: null,
                            onNull: null
                        }
                    }
                }
            }
        ])

        // Round the latitudes and longitudes to 4 decimal places and join them with a comma
        const formattedCoordinates = response.filter((doc) => doc.latitude && doc.longitude)
                                             .map((doc) => `${doc.latitude.toFixed(4)},${doc.longitude.toFixed(4)}`)

        return formattedCoordinates
    }

    async maxFieldNumber(filter = {}) {
        const response = await this.aggregate([
            {
                $match: {
                    ...filter,
                    [fieldNames.fieldNumber]: { $exists: true, $nin: [ null, '' ] }
                }
            },
            {
                $addFields: {
                    fieldNumberInt: {
                        $convert: {
                            input: `$${fieldNames.fieldNumber}`,
                            to: 'int',
                            onError: null,
                            onNull: null
                        }
                    }
                }
            },
            {
                $match: {
                    fieldNumberInt: { $ne: null }
                }
            },
            {
                $group: {
                    _id: null,
                    maxFieldNumber: { $max: "$fieldNumberInt" }
                }
            }
        ])

        const maxFieldNumber = response[0]?.maxFieldNumber

        return maxFieldNumber
    }

    async stateCollectorBeeCounts(filter = {}) {
        return await this.aggregate([
            {
                $match: {
                    ...filter,
                    [fieldNames.stateProvince]: { $exists: true, $nin: [ null, '' ] },
                    [fieldNames.recordedBy]: { $exists: true, $nin: [ null, '' ] }
                }
            },
            {
                $group: {
                    _id: {
                        stateProvince: `$${fieldNames.stateProvince}`,
                        recordedBy: `$${fieldNames.recordedBy}`
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.stateProvince',
                    totalCount: { $sum: '$count' },
                    collectors: {
                        $push: {
                            recordedBy: '$_id.recordedBy',
                            count: '$count'
                        }
                    }
                }
            },
            {
                $addFields: {
                    collectors: {
                        $sortArray: {
                            input: '$collectors',
                            sortBy: { 'count': -1 }
                        }
                    }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ])
    }

    async stateCollectorCountyCounts(filter = {}) {
        return await this.aggregate([
            {
                $match: {
                    ...filter,
                    [fieldNames.stateProvince]: { $exists: true, $nin: [ null, '' ] },
                    [fieldNames.recordedBy]: { $exists: true, $nin: [ null, '' ] },
                    [fieldNames.county]: { $exists: true, $nin: [ null, '' ] }
                }
            },
            {
                $group: {
                    _id: {
                        stateProvince: `$${fieldNames.stateProvince}`,
                        recordedBy: `$${fieldNames.recordedBy}`
                    },
                    uniqueCounties: { $addToSet: `$${fieldNames.county}` }
                }
            },
            {
                $group: {
                    _id: '$_id.stateProvince',
                    collectors: {
                        $push: {
                            recordedBy: '$_id.recordedBy',
                            count: { $size: '$uniqueCounties' }
                        }
                    }
                }
            },
            {
                $addFields: {
                    collectors: {
                        $sortArray: {
                            input: '$collectors',
                            sortBy: { 'count': -1 }
                        }
                    }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ])
    }

    async stateGenusBeeCounts(filter = {}) {
        return await this.aggregate([
            {
                $match: {
                    ...filter,
                    [fieldNames.stateProvince]: { $exists: true, $nin: [ null, '' ] },
                    [fieldNames.plantGenus]: { $exists: true, $nin: [ null, '' ] }
                }
            },
            {
                $group: {
                    _id: {
                        stateProvince: `$${fieldNames.stateProvince}`,
                        plantGenus: `$${fieldNames.plantGenus}`
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.stateProvince',
                    totalCount: { $sum: '$count' },
                    genera: {
                        $push: {
                            plantGenus: '$_id.plantGenus',
                            count: '$count'
                        }
                    }
                }
            },
            {
                $addFields: {
                    genera: {
                        $sortArray: {
                            input: '$genera',
                            sortBy: { 'count': -1 }
                        }
                    }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ])
    }

    // Update
    async updateById(id, updateDocument = {}, options = {}) {
        // Find the existing document and assign the update values to it
        const document = await this.findById(id)
        if (!document && options.upsert === true) {
            return this.create(updateDocument)

        } else if (!document) return
        
        let processedDocument = Object.assign(document, updateDocument)

        // Set meta fields
        processedDocument = this.setSortField(processedDocument, this.sortConfig)
        processedDocument = this.setDateField(processedDocument)
        processedDocument = { ...updateDocument, composite_sort: processedDocument.composite_sort, date: processedDocument.date }

        // Update the document
        return await super.updateById(id, { $set: processedDocument }, options)
    }

    async updateMany(filter = {}, updateDocument = {}) {
        // Page through matching documents and assign update values and meta fields
        let pageNumber = 1
        let page = await this.paginate({ page: pageNumber, filter })
        let modifiedCount = 0
        const initialTotalDocuments = page.pagination.totalDocuments
        while (pageNumber <= page.pagination.totalPages) {
            for (const document of page.data) {
                // Assign update values
                let processedDocument = Object.assign(document, updateDocument)

                // Set meta fields
                processedDocument = this.setSortField(processedDocument, this.sortConfig)
                processedDocument = this.setDateField(processedDocument)
                processedDocument = { ...updateDocument, composite_sort: processedDocument.composite_sort, date: processedDocument.date }

                const response = await super.updateById(document._id, { $set: processedDocument })
                modifiedCount += response?.modifiedCount ?? 0
            }

            page = await this.paginate({ page: ++pageNumber, filter })

            // Handle changes to the number of queried documents between pages
            if (page.pagination.totalDocuments > initialTotalDocuments) {
                throw new Error('Infinite update loop')
            } else if (page.pagination.totalDocuments < initialTotalDocuments) {
                // Reset page if the update reduced the number of queried documents to avoid stepping over documents
                pageNumber = 1
                page = await this.paginate({ page: pageNumber, filter })
            }
        }

        return modifiedCount
    }

    async replaceById(id, replacement, options = {}) {
        let processedDocument = this.setSortField(replacement, this.sortConfig)
        processedDocument = this.setDateField(processedDocument)

        return await super.replaceById(id, processedDocument, options)
    }
}
