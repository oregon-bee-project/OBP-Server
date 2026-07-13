import express from 'express'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import cors from 'cors'
import 'dotenv/config'

import { requireAuthentication } from './middleware/auth.js'
import apiRouter from './routes/index.js'

// Router for website
const app = express()

// Enable all Cross-Origin Resource Sharing (CORS), including pre-flight requests
app.use(cors())

// Parse cookies
app.use(cookieParser())

// Request logging
app.use(morgan('dev'))

// JSON request body parsing
app.use(express.json())

// API routes
apiRouter.use('/addresses', requireAuthentication, express.static('./shared/data/addresses'))
apiRouter.use('/backups', express.static('./shared/data/backups'))
apiRouter.use('/duplicates', express.static('./shared/data/duplicates'))
apiRouter.use('/emails', requireAuthentication, express.static('./shared/data/emails'))
apiRouter.use('/flags', express.static('./shared/data/flags'))
apiRouter.use('/labels', express.static('./shared/data/labels'))
apiRouter.use('/observations', express.static('./shared/data/observations'))
apiRouter.use('/occurrences', express.static('./shared/data/occurrences'))
apiRouter.use('/mismatches', express.static('./shared/data/mismatches'))
apiRouter.use('/pivots', express.static('./shared/data/pivots'))
apiRouter.use('/pulls', express.static('./shared/data/pulls'))
apiRouter.use('/reports', requireAuthentication, express.static('./shared/data/reports'))
apiRouter.use('/uploads', requireAuthentication, express.static('./shared/data/uploads'))
app.use('/api', apiRouter)

app.use('/*notFound', (req, res, next) => {
    res.status(404).send({
        error: `Requested operation '${req.method} ${req.originalUrl}' does not exist`
    })
})

app.use('/*serverError', (err, req, res, next) => {
    console.error(err)
    res.status(500).send({
        error: 'Unable to complete the request because of a server error'
    })
})

export default app
