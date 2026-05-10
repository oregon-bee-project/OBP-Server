// Occurrence field names (local constants for consistency)
const ERROR_FLAGS = 'errorFlags'
const DATE_LABEL_PRINT = 'dateLabelPrint'
const FIELD_NO = 'fieldNumber'
const CATALOG_NO = 'catalogNumber'
const OCCURRENCE_ID = 'occurrenceID'
const INATURALIST_ID = 'userId'
const INATURALIST_ALIAS = 'userLogin'
const FIRST_NAME = 'firstName'
const FIRST_NAME_INITIAL = 'firstNameInitial'
const LAST_NAME = 'lastName'
const RECORDED_BY = 'recordedBy'
const SAMPLE_ID = 'sampleId'
const SPECIMEN_ID = 'specimenId'
const DAY = 'day'
const MONTH = 'month'
const YEAR = 'year'
const VERBATIM_DATE = 'verbatimEventDate'
const DAY2 = 'day2'
const MONTH2 = 'month2'
const YEAR2 = 'year2'
const START_DAY_OF_YEAR = 'startDayofYear'
const END_DAY_OF_YEAR = 'endDayofYear'
const COUNTRY = 'country'
const STATE_PROVINCE = 'stateProvince'
const COUNTY = 'county'
const LOCALITY = 'locality'
const ELEVATION = 'verbatimElevation'
const LATITUDE = 'decimalLatitude'
const LONGITUDE = 'decimalLongitude'
const ACCURACY = 'coordinateUncertaintyInMeters'
const SAMPLING_PROTOCOL = 'samplingProtocol'
const RESOURCE_RELATIONSHIP = 'relationshipOfResource'
const RESOURCE_ID = 'resourceID'
const RELATED_RESOURCE_ID = 'relatedResourceID'
const RELATIONSHIP_REMARKS = 'relationshipRemarks'
const PLANT_PHYLUM = 'phylumPlant'
const PLANT_ORDER = 'orderPlant'
const PLANT_FAMILY = 'familyPlant'
const PLANT_GENUS = 'genusPlant'
const PLANT_SPECIES = 'speciesPlant'
const PLANT_TAXON_RANK = 'taxonRankPlant'
const INATURALIST_URL = 'url'
const BEE_PHYLUM = 'phylum'
const BEE_CLASS = 'class'
const BEE_ORDER = 'order'
const BEE_FAMILY = 'family'
const BEE_GENUS = 'genus'
const BEE_SUBGENUS = 'subgenus'
const SPECIFIC_EPITHET = 'specificEpithet'
const TAXONOMIC_NOTES = 'taxonomicNotes'
const SCIENTIFIC_NAME = 'scientificName'
const SEX = 'sex'
const CASTE = 'caste'
const BEE_TAXON_RANK = 'taxonRank'
const IDENTIFIED_BY = 'identifiedBy'
const VOL_DET_FAMILY = 'familyVolDet'
const VOL_DET_GENUS = 'genusVolDet'
const VOL_DET_SPECIES = 'speciesVolDet'
const VOL_DET_SEX = 'sexVolDet'
const VOL_DET_CASTE = 'casteVolDet'

// Observation field names
const UUID = 'uuid'
const OBS_ID = 'id'
const POSITIONAL_ACCURACY = 'positional_accuracy'
const OBSERVED_ON = 'observed_on'
const PLACE_IDS = 'place_ids'
const MIN_SPECIES_ANCESTRY = 'min_species_ancestry'
const NATIVE = 'native'
const OBS_SCIENTIFIC_NAME = 'scientific_name'
const OBS_TAXON_RANK = 'taxon_rank'
const SYNONYMS = 'synonyms'
const COMMON_NAME = 'common_name'
const OBS_SAMPLE_ID = 'sample_id'
const BEES_COLLECTED = 'bees_collected'
const URI = 'uri'
const OBS_LATITUDE = 'latitude'
const OBS_LONGITUDE = 'longitude'
const USER_ID = 'user_id'
const USER_LOGIN = 'user_login'
const PLACE_GUESS = 'place_guess'

// Plant field names
const PLANT_LIST_SCIENTIFIC_NAME = 'Scientific_name'
const PLANT_LIST_SYNONYM = 'Synonym'
const PLANT_LIST_COMMON_NAME = 'Common_name'
const PLANT_LIST_BLOOM_START = 'Bloom_start'
const PLANT_LIST_BLOOM_END = 'Bloom_end'
const PLANT_LIST_LIFECYCLE = 'Lifecycle'
const PLANT_LIST_TAXON_NOTE = 'Taxon_note'
const PLANT_LIST_FLOWER_COLOR = 'Flower_color'
const PLANT_LIST_ORIGIN = 'Origin'
const PLANT_LIST_WEEDY = 'Weedy_species'
const PLANT_LIST_NOXIOUS = 'Noxious_weed'
const PLANT_LIST_GARDEN_TYPE = 'Garden_type'
const PLANT_LIST_HEIGHT_MIN = 'PlantHeightMinFeet'
const PLANT_LIST_HEIGHT_MAX = 'PlantHeightMaxFeet'
const PLANT_LIST_WIDTH_MIN = 'GardenPlantWidthMinFeet'
const PLANT_LIST_WIDTH_MAX = 'GardenPlantWidthMaxFeet'
const PLANT_LIST_SEEDS_LB = 'Seeds/Lb'
const PLANT_LIST_LBS_ACRE = 'Lbs/Acre'
const PLANT_LIST_PROPAGATION_PRIMARY = 'PropagationPrimary'
const PLANT_LIST_PROPAGATION_SECONDARY = 'PropagationSecondary'
const PLANT_LIST_FAMILY = 'Family'
const PLANT_LIST_ABSTRACT = 'PlantAbstract'
const PLANT_LIST_RECOMMENDED = 'OF_RecommendedPlants'
const PLANT_LIST_SUPER_BEE = 'SuperBeePlants'
const PLANT_LIST_URL = 'PlantURL'
const PLANT_LIST_WEED_URL = 'NoxiousWeedURL'

const constants = {
    // Maximum number of output files stored on the server for each output type
    fileLimits: {
        maxAddresses: 25,
        maxBackups: 5,
        maxDuplicates: 25,
        maxEmails: 25,
        maxFlags: 25,
        maxLabels: 25,
        maxOccurrences: 25,
        maxPivots: 25,
        maxPulls: 25,
        maxReports: 25,
        maxTaxonomy: 2,
        maxUploads: 25
    },
    auth: {
        saltLength: 10
    },
    tasks: {
        subtasks: [
            { type: 'addresses', authRequired: true },
            { type: 'determinations', authRequired: true },
            { type: 'download', authRequired: false },
            { type: 'emails', authRequired: true },
            { type: 'labels', authRequired: true },
            { type: 'observations', authRequired: true },
            { type: 'occurrences', authRequired: true },
            { type: 'pivots', authRequired: true },
            { type: 'plantList', authRequired: true },
            { type: 'stewardshipReport', authRequired: true },
            { type: 'syncOccurrences', authRequired: true },
            { type: 'upload', authRequired: true }
        ]
    },
    occurrences: {
        // Occurrence field names
        fieldNames: {
            errorFlags: ERROR_FLAGS,
            dateLabelPrint: DATE_LABEL_PRINT,
            fieldNumber: FIELD_NO,
            catalogNumber: CATALOG_NO,
            occurrenceId: OCCURRENCE_ID,
            iNaturalistId: INATURALIST_ID,
            iNaturalistAlias: INATURALIST_ALIAS,
            firstName: FIRST_NAME,
            firstNameInitial: FIRST_NAME_INITIAL,
            lastName: LAST_NAME,
            recordedBy: RECORDED_BY,
            sampleId: SAMPLE_ID,
            specimenId: SPECIMEN_ID,
            day: DAY,
            month: MONTH,
            year: YEAR,
            verbatimDate: VERBATIM_DATE,
            day2: DAY2,
            month2: MONTH2,
            year2: YEAR2,
            startDayOfYear: START_DAY_OF_YEAR,
            endDayOfYear: END_DAY_OF_YEAR,
            country: COUNTRY,
            stateProvince: STATE_PROVINCE,
            county: COUNTY,
            locality: LOCALITY,
            elevation: ELEVATION,
            latitude: LATITUDE,
            longitude: LONGITUDE,
            accuracy: ACCURACY,
            samplingProtocol: SAMPLING_PROTOCOL,
            resourceRelationship: RESOURCE_RELATIONSHIP,
            resourceId: RESOURCE_ID,
            relatedResourceId: RELATED_RESOURCE_ID,
            relationshipRemarks: RELATIONSHIP_REMARKS,
            plantPhylum: PLANT_PHYLUM,
            plantOrder: PLANT_ORDER,
            plantFamily: PLANT_FAMILY,
            plantGenus: PLANT_GENUS,
            plantSpecies: PLANT_SPECIES,
            plantTaxonRank: PLANT_TAXON_RANK,
            iNaturalistUrl: INATURALIST_URL,
            beePhylum: BEE_PHYLUM,
            beeClass: BEE_CLASS,
            beeOrder: BEE_ORDER,
            beeFamily: BEE_FAMILY,
            beeGenus: BEE_GENUS,
            beeSubgenus: BEE_SUBGENUS,
            specificEpithet: SPECIFIC_EPITHET,
            taxonomicNotes: TAXONOMIC_NOTES,
            scientificName: SCIENTIFIC_NAME,
            sex: SEX,
            caste: CASTE,
            beeTaxonRank: BEE_TAXON_RANK,
            identifiedBy: IDENTIFIED_BY,
            volDetFamily: VOL_DET_FAMILY,
            volDetGenus: VOL_DET_GENUS,
            volDetSpecies: VOL_DET_SPECIES,
            volDetSex: VOL_DET_SEX,
            volDetCaste: VOL_DET_CASTE
        },
        // Template object for occurrences; static values are provided as strings, data-dependent values are set to null
        template: {
            [ERROR_FLAGS]: null,
            [DATE_LABEL_PRINT]: '',
            [FIELD_NO]: null,
            [CATALOG_NO]: '',
            [OCCURRENCE_ID]: null,
            [INATURALIST_ID]: null,
            [INATURALIST_ALIAS]: null,
            [FIRST_NAME]: null,
            [FIRST_NAME_INITIAL]: null,
            [LAST_NAME]: null,
            [RECORDED_BY]: null,
            [SAMPLE_ID]: null,
            [SPECIMEN_ID]: null,
            [DAY]: null,
            [MONTH]: null,
            [YEAR]: null,
            [VERBATIM_DATE]: null,
            [DAY2]: '',
            [MONTH2]: '',
            [YEAR2]: '',
            [START_DAY_OF_YEAR]: '',
            [END_DAY_OF_YEAR]: '',
            [COUNTRY]: null,
            [STATE_PROVINCE]: null,
            [COUNTY]: null,
            [LOCALITY]: null,
            [ELEVATION]: null,
            [LATITUDE]: null,
            [LONGITUDE]: null,
            [ACCURACY]: null,
            [SAMPLING_PROTOCOL]: null,
            [RESOURCE_RELATIONSHIP]: null,
            [RESOURCE_ID]: null,
            [RELATED_RESOURCE_ID]: null,
            [RELATIONSHIP_REMARKS]: '',
            [PLANT_PHYLUM]: null,
            [PLANT_ORDER]: null,
            [PLANT_FAMILY]: null,
            [PLANT_GENUS]: null,
            [PLANT_SPECIES]: null,
            [PLANT_TAXON_RANK]: null,
            [INATURALIST_URL]: null,
            [BEE_PHYLUM]: '',
            [BEE_CLASS]: '',
            [BEE_ORDER]: '',
            [BEE_FAMILY]: '',
            [BEE_GENUS]: '',
            [BEE_SUBGENUS]: '',
            [SPECIFIC_EPITHET]: '',
            [TAXONOMIC_NOTES]: '',
            [SCIENTIFIC_NAME]: '',
            [SEX]: '',
            [CASTE]: '',
            [BEE_TAXON_RANK]: '',
            [IDENTIFIED_BY]: '',
            [VOL_DET_FAMILY]: '',
            [VOL_DET_GENUS]: '',
            [VOL_DET_SPECIES]: '',
            [VOL_DET_SEX]: '',
            [VOL_DET_CASTE]: ''
        },
        // A list of fields that should be flagged if empty
        nonEmptyFields: [
            FIRST_NAME,
            FIRST_NAME_INITIAL,
            LAST_NAME,
            SAMPLE_ID,
            SPECIMEN_ID,
            DAY,
            MONTH,
            YEAR,
            COUNTRY,
            STATE_PROVINCE,
            COUNTY,
            LOCALITY,
            LATITUDE,
            LONGITUDE,
            SAMPLING_PROTOCOL
        ],
        // Default sorting hierarchy used by the composite_sort field
        sortConfig: [
            { field: FIELD_NO, direction: 1, type: 'number' },
            { field: LAST_NAME, direction: 1, type: 'string' },
            { field: FIRST_NAME, direction: 1, type: 'string' },
            { field: MONTH, direction: 1, type: 'number' },
            { field: DAY, direction: 1, type: 'number' },
            { field: SAMPLE_ID, direction: 1, type: 'number' },
            { field: SPECIMEN_ID, direction: 1, type: 'number' }
        ]
    },
    observations: {
        // Observation field names (CSV)
        fieldNames: {
            uuid: UUID,
            id: OBS_ID,
            positionalAccuracy: POSITIONAL_ACCURACY,
            observedOn: OBSERVED_ON,
            placeIds: PLACE_IDS,
            minSpeciesAncestry: MIN_SPECIES_ANCESTRY,
            native: NATIVE,
            scientificName: OBS_SCIENTIFIC_NAME,
            taxonRank: OBS_TAXON_RANK,
            synonyms: SYNONYMS,
            commonName: COMMON_NAME,
            sampleId: OBS_SAMPLE_ID,
            beesCollected: BEES_COLLECTED,
            uri: URI,
            latitude: OBS_LATITUDE,
            longitude: OBS_LONGITUDE,
            userId: USER_ID,
            userLogin: USER_LOGIN,
            placeGuess: PLACE_GUESS
        },
        // Template object for observation CSV rows
        template: {
            [UUID]: '',
            [OBS_ID]: '',
            [POSITIONAL_ACCURACY]: '',
            [OBSERVED_ON]: '',
            [PLACE_IDS]: '',
            [MIN_SPECIES_ANCESTRY]: '',
            [NATIVE]: '',
            [OBS_SCIENTIFIC_NAME]: '',
            [OBS_TAXON_RANK]: '',
            [SYNONYMS]: '',
            [COMMON_NAME]: '',
            [OBS_SAMPLE_ID]: '',
            [BEES_COLLECTED]: '',
            [URI]: '',
            [OBS_LATITUDE]: '',
            [OBS_LONGITUDE]: '',
            [USER_ID]: '',
            [USER_LOGIN]: '',
            [PLACE_GUESS]: ''
        },
        // OFV names
        ofvs: {
            sampleId: 'sampleId',
            beesCollected: 'numberOfSpecimens'
        }
    },
    labels: {
        // List of mandatory fields for a label to be printed
        requiredFields: [
            FIELD_NO,
            FIRST_NAME_INITIAL,
            LAST_NAME,
            SAMPLE_ID,
            DAY,
            MONTH,
            YEAR,
            COUNTRY,
            STATE_PROVINCE,
            LOCALITY,
            LATITUDE,
            LONGITUDE,
            SAMPLING_PROTOCOL
        ]
    },
    usernames: {
        // Username field names
        fieldNames: {
            userLogin: 'userLogin',
            fullName: 'fullName',
            firstName: 'firstName',
            firstNameInitial: 'firstNameInitial',
            lastName: 'lastName',
            email: 'email',
            address: 'address',
            city: 'city',
            stateProvince: 'stateProvince',
            zipPostal: 'zipPostal',
            country: 'country'
        }
    },
    determinations: {
        // Determination field names
        fieldNames: {
            fieldNumber: FIELD_NO,
            beePhylum: BEE_PHYLUM,
            beeClass: BEE_CLASS,
            beeOrder: BEE_ORDER,
            beeFamily: BEE_FAMILY,
            beeGenus: BEE_GENUS,
            beeSubgenus: BEE_SUBGENUS,
            specificEpithet: SPECIFIC_EPITHET,
            taxonomicNotes: TAXONOMIC_NOTES,
            scientificName: SCIENTIFIC_NAME,
            sex: SEX,
            caste: CASTE,
            beeTaxonRank: BEE_TAXON_RANK,
            identifiedBy: IDENTIFIED_BY,
            volDetFamily: VOL_DET_FAMILY,
            volDetGenus: VOL_DET_GENUS,
            volDetSpecies: VOL_DET_SPECIES,
            volDetSex: VOL_DET_SEX,
            volDetCaste: VOL_DET_CASTE
        },
        // Template object for determinations
        template: {
            [FIELD_NO]: '',
            [BEE_PHYLUM]: '',
            [BEE_CLASS]: '',
            [BEE_ORDER]: '',
            [BEE_FAMILY]: '',
            [BEE_GENUS]: '',
            [BEE_SUBGENUS]: '',
            [SPECIFIC_EPITHET]: '',
            [TAXONOMIC_NOTES]: '',
            [SCIENTIFIC_NAME]: '',
            [SEX]: '',
            [CASTE]: '',
            [BEE_TAXON_RANK]: '',
            [IDENTIFIED_BY]: '',
            [VOL_DET_FAMILY]: '',
            [VOL_DET_GENUS]: '',
            [VOL_DET_SPECIES]: '',
            [VOL_DET_SEX]: '',
            [VOL_DET_CASTE]: ''
        }
    },
    plants: {
        // Plant field names
        fieldNames: {
            scientificName: PLANT_LIST_SCIENTIFIC_NAME,
            synonym: PLANT_LIST_SYNONYM,
            commonName: PLANT_LIST_COMMON_NAME,
            bloomStart: PLANT_LIST_BLOOM_START,
            bloomEnd: PLANT_LIST_BLOOM_END,
            lifecycle: PLANT_LIST_LIFECYCLE,
            taxonNote: PLANT_LIST_TAXON_NOTE,
            flowerColor: PLANT_LIST_FLOWER_COLOR,
            origin: PLANT_LIST_ORIGIN,
            weedy: PLANT_LIST_WEEDY,
            noxious: PLANT_LIST_NOXIOUS,
            gardenType: PLANT_LIST_GARDEN_TYPE,
            heightMin: PLANT_LIST_HEIGHT_MIN,
            heightMax: PLANT_LIST_HEIGHT_MAX,
            widthMin: PLANT_LIST_WIDTH_MIN,
            widthMax: PLANT_LIST_WIDTH_MAX,
            seedsPerLb: PLANT_LIST_SEEDS_LB,
            lbsPerAcre: PLANT_LIST_LBS_ACRE,
            propagationPrimary: PLANT_LIST_PROPAGATION_PRIMARY,
            propagationSecondary: PLANT_LIST_PROPAGATION_SECONDARY,
            family: PLANT_LIST_FAMILY,
            abstract: PLANT_LIST_ABSTRACT,
            recommended: PLANT_LIST_RECOMMENDED,
            superBeePlant: PLANT_LIST_SUPER_BEE,
            plantUrl: PLANT_LIST_URL,
            noxiousWeedUrl: PLANT_LIST_WEED_URL
        },
        // Template object for plants (in plantList.csv)
        template: {
            [PLANT_LIST_SCIENTIFIC_NAME]: '',
            [PLANT_LIST_SYNONYM]: '',
            [PLANT_LIST_COMMON_NAME]: '',
            [PLANT_LIST_BLOOM_START]: '',
            [PLANT_LIST_BLOOM_END]: '',
            [PLANT_LIST_LIFECYCLE]: '',
            [PLANT_LIST_TAXON_NOTE]: '',
            [PLANT_LIST_FLOWER_COLOR]: '',
            [PLANT_LIST_ORIGIN]: '',
            [PLANT_LIST_WEEDY]: '',
            [PLANT_LIST_NOXIOUS]: '',
            [PLANT_LIST_GARDEN_TYPE]: '',
            [PLANT_LIST_HEIGHT_MIN]: '',
            [PLANT_LIST_HEIGHT_MAX]: '',
            [PLANT_LIST_WIDTH_MIN]: '',
            [PLANT_LIST_WIDTH_MAX]: '',
            [PLANT_LIST_SEEDS_LB]: '',
            [PLANT_LIST_LBS_ACRE]: '',
            [PLANT_LIST_PROPAGATION_PRIMARY]: '',
            [PLANT_LIST_PROPAGATION_SECONDARY]: '',
            [PLANT_LIST_FAMILY]: '',
            [PLANT_LIST_ABSTRACT]: '',
            [PLANT_LIST_RECOMMENDED]: '',
            [PLANT_LIST_SUPER_BEE]: '',
            [PLANT_LIST_URL]: '',
            [PLANT_LIST_WEED_URL]: ''
        }
    },
    abbreviations: {
        countries: {
            'United States': 'USA',
            'Canada': 'CA',
            'CAN': 'CA'
        },
        stateProvinces: {
            'Alabama': 'AL',                    // United States
            'Alaska': 'AK',
            'Arizona': 'AZ',
            'Arkansas': 'AR',
            'California': 'CA',
            'Colorado': 'CO',
            'Connecticut': 'CT',
            'Delaware': 'DE',
            'Florida': 'FL',
            'Georgia': 'GA',
            'Hawaii': 'HI',
            'Idaho': 'ID',
            'Illinois': 'IL',
            'Indiana': 'IN',
            'Iowa': 'IA',
            'Kansas': 'KS',
            'Kentucky': 'KY',
            'Louisiana': 'LA',
            'Maine': 'ME',
            'Maryland': 'MD',
            'Massachusetts': 'MA',
            'Michigan': 'MI',
            'Minnesota': 'MN',
            'Mississippi': 'MS',
            'Missouri': 'MO',
            'Montana': 'MT',
            'Nebraska': 'NE',
            'Nevada': 'NV',
            'New Hampshire': 'NH',
            'New Jersey': 'NJ',
            'New Mexico': 'NM',
            'New York': 'NY',
            'North Carolina': 'NC',
            'North Dakota': 'ND',
            'Ohio': 'OH',
            'Oklahoma': 'OK',
            'Oregon': 'OR',
            'Pennsylvania': 'PA',
            'Rhode Island': 'RI',
            'South Carolina': 'SC',
            'South Dakota': 'SD',
            'Tennessee': 'TN',
            'Texas': 'TX',
            'Utah': 'UT',
            'Vermont': 'VT',
            'Virginia': 'VA',
            'Washington': 'WA',
            'West Virginia': 'WV',
            'Wisconsin': 'WI',
            'Alberta': 'AB',                    // Canadian Provinces
            'British Columbia': 'BC',
            'Manitoba': 'MB',
            'New Brunswick': 'NB',
            'Newfoundland and Labrador': 'NL',
            'Nova Scotia': 'NS',
            'Ontario': 'ON',
            'Prince Edward Island': 'PE',
            'Quebec': 'QC',
            'Saskatchewan': 'SK',
            'Northwest Territories': 'NT',      // Canadian Territories
            'Nunavut': 'NU',
            'Yukon': 'YT'
        },
        counties: {
            'Alberni-Clayoquot': 'ACRD',        // British Columbia Regional Districts
            'Bulkley-Nechako': 'RDBN',
            'Capital': 'CRD',
            'Cariboo': 'Cariboo',
            'Central Coast': 'CCRD',
            'Central Kootenay': 'RDCK',
            'Central Okanagan': 'RDCO',
            'Columbia-Shuswap': 'CSRD',
            'Comox-Strathcona': 'CxSRD',
            'Cowichan Valley': 'CwVRD',
            'East Kootenay': 'RDEK',
            'Fraser Valley': 'FVRD',
            'Fraser-Fort George': 'RDFS',
            'Greater Vancouver': 'MVRD',
            'Kitimat-Stikine': 'RDKS',
            'Kootenay Boundary': 'RDKB',
            'Mount Waddington': 'RDMW',
            'Nanaimo': 'RDN',
            'North Coast': 'RDNC',
            'North Okanagan': 'RDNO',
            'Northern Rockies': 'NRRM',
            'Okanagan-Similkameen': 'RDOS',
            'Peace River': 'Peace River',
            'Skeena-Queen Charlotte': 'NCRD',
            'Squamish-Lillooet': 'SLRD',
            'Stikine Region': 'Stikine',
            'Strathcona': 'SRD',
            'Sunshine Coast': 'SCRD',
            'Thompson-Nicola': 'TNRD',
            'Doña Ana': 'Dona Ana',
            'Lincoln , US, WA': 'Lincoln',      // Fix a Google API error
            'Franklin , US, WA': 'Franklin'
        }
    }
}

export const { fileLimits } = constants
export const { auth } = constants
export const { tasks } = constants
export const { subtasks } = constants.tasks
export const { occurrences } = constants
export const { template, fieldNames, nonEmptyFields, sortConfig } = constants.occurrences
export const { observations } = constants
export const { ofvs, fieldNames: obsFieldNames, template: obsTemplate } = constants.observations
export const { labels } = constants
export const { requiredFields } = constants.labels
export const { usernames } = constants
export const { determinations } = constants
export const { plants } = constants
export const { abbreviations } = constants

export default constants
