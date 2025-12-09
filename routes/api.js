// Below we will use the Express Router to define a series of API endpoints.
// Express will listen for API requests and respond accordingly
import express from 'express'
const router = express.Router()

// Set this to match the model name in your Prisma schema
const model = 'albums'

// Prisma lets NodeJS communicate with MongoDB
// Let's import and initialize the Prisma client
// See also: https://www.prisma.io/docs
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()


// User lifecycle helper
async function ensureUser(oidcUser) {
    if (!oidcUser || !oidcUser.sub) {
        throw new Error('Cannot ensure user without a valid Auth0 sub')
    }
    const { sub, email, name, picture } = oidcUser
    const givenName = oidcUser.given_name || oidcUser.givenName || null
    // an upsert will perform either an update or a create
    // - update the user if they already exist, or 
    // - create a new user record if they do not exist yet
    const user = await prisma.user.upsert({
        where: { sub },
        update: {
            email: email || null,
            name: name || null,
            picture: picture || null,
            givenName: givenName 
        },
        create: {
            sub,
            email: email || null,
            name: name || null,
            picture: picture || null,
            givenName: givenName
        }
    })
    return user
}


// Import del function from Vercel Blob for image cleanup
import { del } from '@vercel/blob'

// Connect to the database
prisma.$connect().then(() => {
    console.log('Prisma connected to MongoDB')
}).catch(err => {
    console.error('Failed to connect to MongoDB:', err)
})

// ----- USER (GET) -----
// Publish user data and auth state to the frontend
router.get('/api/user', async (req, res) => {
    try {
        if (req.oidc?.isAuthenticated()) {
            const user = await ensureUser(req.oidc.user)
            res.send({
                ...req.oidc.user,
                id: user.id,
                givenName: user.givenName || null,
                isAuthenticated: true
            })
        } else {
            res.send({
                name: 'Guest',
                isAuthenticated: false
            })
        }
    } catch (err) {
        console.error('GET /api/user error:', err)
        res.status(500).send({ error: 'Failed to fetch user', details: err.message || err })
    }
})


// ----- CREATE (POST) -----
// Create a new record for the configured model
// This is the 'C' of CRUD
router.post('/data', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).send({ error: 'Authentication required' })
    }

    try {
        // Ensure we have a User record for this Auth0 user
        const user = await ensureUser(req.oidc.user)

        // Remove the id field from request body if it exists
        // MongoDB will auto-generate an ID for new records
        const { id, ownerId, owner, ...createData } = req.body

        const created = await prisma[model].create({
            data: {
                ...createData,
                ownerId: user.id
            },
            include: { owner: true }
        })
        res.status(201).send(created)
    } catch (err) {
        console.error('POST /data error:', err)
        res.status(500).send({ error: 'Failed to create record', details: err.message || err })
    }
})


// ----- READ (GET) list ----- 
router.get('/data', async (req, res) => {
    try {
        // Frontend is responsible for filtering owned vs all.
        const result = await prisma[model].findMany({
            take: 100,
            include: { owner: true }
        })
        res.send(result)
    } catch (err) {
        console.error('GET /data error:', err)
        res.status(500).send({ error: 'Failed to fetch records', details: err.message || err })
    }
})



// ----- findMany() with search ------- 
// Accepts optional search parameter to filter by title or artist
// See also: https://www.prisma.io/docs/orm/reference/prisma-client-reference#examples-7
router.get('/search', async (req, res) => {
    try {
        // get search terms from query string, default to empty string
        const searchTerms = req.query.terms || ''
        // fetch the records from the database
        const result = await prisma[model].findMany({
            where: {
                OR: [
                    { title: { contains: searchTerms, mode: 'insensitive' } },
                    { artist: { contains: searchTerms, mode: 'insensitive' } }
                ]
            },
            include: { owner: true },
            orderBy: { title: 'asc' },
            take: 10
        })
        res.send(result)
    } catch (err) {
        console.error('GET /search error:', err)
        res.status(500).send({ error: 'Search failed', details: err.message || err })
    }
})


// ----- UPDATE (PUT) -----
// Listen for PUT requests
// respond by updating a particular record in the database
// This is the 'U' of CRUD
// After updating the database we send the updated record back to the frontend.


router.put('/data/:id', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).send({ error: 'Authentication required' })
    }

    const { id, _id, ownerId, owner, ...requestBody } = req.body || {}

    try {
        // Fetch the existing record including owner relation
        const existing = await prisma[model].findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        })

        if (!existing) {
            return res.status(404).send({ error: 'Record not found' })
        }

        if (!existing.owner || existing.owner.sub !== req.oidc.user.sub) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        const updated = await prisma[model].update({
            where: { id: req.params.id },
            data: requestBody,
            include: { owner: true }
        })

        return res.send(updated)
    } catch (err) {
        console.error('PUT /data/:id error:', err)
        return res.status(500).send({ error: 'Failed to update record', details: err.message || err })
    }
})

// ----- DELETE -----
// Listen for DELETE requests
// respond by deleting a particular record in the database
// This is the 'D' of CRUD
router.delete('/data/:id', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).send({ error: 'Authentication required' })
    }

    try {
        // Get the album record first (including owner) to check permissions and image URL
        const album = await prisma[model].findUnique({
            where: { id: req.params.id },
            include: { owner: true }
        })

        if (!album) {
            return res.status(404).send({ error: 'Record not found' })
        }

        if (!album.owner || album.owner.sub !== req.oidc.user.sub) {
            return res.status(403).send({ error: 'Forbidden' })
        }

        // Delete from database
        const result = await prisma[model].delete({
            where: { id: req.params.id }
        })

        // Delete associated image from Vercel Blob (if exists)
        if (album.imageUrl) {
            try {
                await del(album.imageUrl)
                console.log('Deleted image:', album.imageUrl)
            } catch (blobError) {
                console.error('Failed to delete image:', blobError)
                // Don't fail the whole operation if image delete fails
            }
        }

        res.send(result)
    } catch (err) {
        console.error('DELETE /data/:id error:', err)
        res.status(500).send({ error: 'Failed to delete record', details: err.message || err })
    }
})


// export the api routes for use elsewhere in our app 
// (e.g. in index.js )
export default router;

