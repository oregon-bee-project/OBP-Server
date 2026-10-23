import multer from 'multer'

import FileManager from '../../shared/lib/utils/FileManager.js'
import { fileLimits } from '../../shared/lib/utils/constants.js'

// Allowable file types; keys are MIME file types, values are file extensions
const fileTypes = {
    'text/csv': 'csv',
    'application/vnd.ms-excel': 'csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'csv'
}

// multer leaves array indices in field names (e.g. 'items[4294967294]') unbounded unless this limit is set, and a single
//  request with a huge index can block the server for minutes (GHSA-535w-7cp7-47q4). Our forms only send flat field names
const limits = { fieldArrayIndexLimit: 100 }

// Multer object for processing dataset uploads; only allows CSV files and assigns a timestamped file name
const uploadCSV = multer({
    storage: multer.diskStorage({
        destination: './shared/data/uploads',
        filename: (req, file, cb) => {
            // Create a unique file name
            const createdAt = new Date()
            const createdAtDate = `${createdAt.getFullYear()}-${createdAt.getMonth() + 1}-${createdAt.getDate()}`
            const createdAtTime = `${createdAt.getHours()}.${createdAt.getMinutes()}.${createdAt.getSeconds()}`

            const fileName = `upload_${createdAtDate}T${createdAtTime}.${fileTypes[file.mimetype]}`
            cb(null, fileName)
        }
    }),
    fileFilter: (req, file, cb) => {
        cb(null, !!fileTypes[file.mimetype])
    },
    limits
})

/*
 * createCSVDatasetUpload()
 * Creates a multer object for processing CSV dataset uploads; only allows CSV files and overwrites the existing dataset
 */
function createCSVDatasetUpload(fileName) {
    return multer({
        storage: multer.diskStorage({
            destination: './shared/data',
            filename: (req, file, cb) => {
                cb(null, fileName ?? 'dataset.csv')
            }
        }),
        fileFilter: (req, file, cb) => {
            cb(null, !!fileTypes[file.mimetype])
        },
        limits
    })
}

/*
 * limitUploadFiles()
 * File management middleware that limits the number of upload files, archiving excess files
 */
function limitUploadFiles(req, res, next) {
    // If there are too many files in the uploads directory, find and archive the oldest one (by timestamp of last modification)
    FileManager.limitFilesInDirectory('./shared/data/uploads', fileLimits.maxUploads)
    next()
}

export { uploadCSV, createCSVDatasetUpload, limitUploadFiles }