import Router from 'express'
import fs from 'fs'

import { requireAuthentication } from '../middleware/auth.js'

const archiveRouter = Router()

function createReadDirMiddleware(directory, uriStem) {
    return (req, res, next) => {
        try {
            // Query directory for files
            const files = fs.readdirSync(directory)
                .map((f) => ({ fileName: f, uri: uriStem + f }))

            // Send zip file HATEOAS links
            res.status(200).send({
                files
            })
        } catch (err) {
            // Forward to 500-code middleware
            next(err)
        }
    }
}

archiveRouter.get('/addresses', requireAuthentication, createReadDirMiddleware('./shared/data/addresses', '/api/addresses/'))

archiveRouter.get('/backups', requireAuthentication, createReadDirMiddleware('./shared/data/backups', '/api/backups/'))

archiveRouter.get('/duplicates', requireAuthentication, createReadDirMiddleware('./shared/data/duplicates', '/api/duplicates/'))

archiveRouter.get('/emails', requireAuthentication, createReadDirMiddleware('./shared/data/emails', '/api/emails/'))

archiveRouter.get('/flags', requireAuthentication, createReadDirMiddleware('./shared/data/flags', '/api/flags/'))

archiveRouter.get('/labels', requireAuthentication, createReadDirMiddleware('./shared/data/labels', '/api/labels/'))

archiveRouter.get('/observations', requireAuthentication, createReadDirMiddleware('./shared/data/observations', '/api/observations/'))

archiveRouter.get('/mismatches', requireAuthentication, createReadDirMiddleware('./shared/data/mismatches', '/api/mismatches/'))

archiveRouter.get('/mismatches', requireAuthentication, createReadDirMiddleware('./shared/data/mismatches', '/api/mismatches/'))

archiveRouter.get('/pivots', requireAuthentication, createReadDirMiddleware('./shared/data/pivots', '/api/pivots/'))

archiveRouter.get('/pulls', requireAuthentication, createReadDirMiddleware('./shared/data/pulls', '/api/pulls/'))

archiveRouter.get('/reports', requireAuthentication, createReadDirMiddleware('./shared/data/reports', '/api/reports/'))

archiveRouter.get('/uploads', requireAuthentication, createReadDirMiddleware('./shared/data/uploads', '/api/uploads/'))

export default archiveRouter
