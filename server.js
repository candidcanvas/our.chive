// Express is a framework for building APIs and web apps
// See also: https://expressjs.com/
import express from 'express'
// Initialize Express app
const app = express()

// import path module to help with file paths
import path from 'path';

// Serve static files from the 'public' folder
app.use(express.static('public'))

// On Vercel, point the root url (/) to index.html explicitly
if (process.env.VERCEL) {
    app.get('/', (req, res) => {
        res.sendFile(path.join(process.cwd(), 'public', 'index.html'))
    })
}

// Enable express to parse JSON data
app.use(express.json())

// Auth0 / OpenID Connect integration
import auth0 from 'express-openid-connect'
const { auth } = auth0

const config = {
    authRequired: false,
    auth0Logout: true,
    secret: process.env.SECRET,
    baseURL: process.env.BASE_URL,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: process.env.ISSUER_BASE_URL
}

// Validate that the required Auth0 env vars are present
if (['secret', 'baseURL', 'clientID', 'issuerBaseURL'].some(key => !config[key])) {
    console.error('Error: Auth0 environment variable(s) are missing.')
    process.exit(1)
}

// Attach Auth0 middleware (adds /login, /logout, /callback and req.oidc)
app.use(auth(config))

// Our API is defined in a separate module to keep things tidy.
// Let's import our API endpoints and activate them.
import apiRoutes from './routes/api.js'
app.use('/', apiRoutes)

// Import and mount upload routes
import uploadRoutes from './routes/upload.js'
app.use('/api', uploadRoutes)

const port = 3000
app.listen(port, () => {
    console.log(`Express is live at http://localhost:${port}`)
})
