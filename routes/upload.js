// upload.js
// This file defines API endpoints for managing image uploads
// it includes image resizing and it stores files using Vercel Blob
// On Vercel, enable Blob storage for your project
// Vercel will generate a BLOB_READ_WRITE_TOKEN
// You will need to add this to your .env file in order to work locally.


// Express framework
import express from 'express'
// Upload processor: https://www.npmjs.com/package/busboy
import busboy from 'busboy'
// Image resizer: https://sharp.pixelplumbing.com/
import sharp from 'sharp'
// Vercel Blob: https://vercel.com/docs/vercel-blob/using-blob-sdk?framework=other&language=js
import { put, del } from '@vercel/blob'

// Auth0 OpenID Connect for authentication checks
import auth0 from 'express-openid-connect'
const { requiresAuth } = auth0

const router = express.Router()

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_WIDTH = 800
const MAX_HEIGHT = 800
const JPEG_QUALITY = 85
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']

// POST /api/upload - Upload image to Vercel Blob
router.post('/upload', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' })
    }
    const uploadProcessor = busboy({ headers: req.headers })

    uploadProcessor.on('file', async (name, file, info) => {
        try {
            // Validate file type
            if (!ALLOWED_TYPES.includes(info.mimeType)) {
                file.resume() // Drain the stream
                return res.status(400).json({
                    error: 'Invalid file type. Only JPEG, PNG, WebP, and SVG images are allowed.'
                })
            }

            // Collect file data into buffer
            const chunks = []
            let fileSize = 0
            let sizeLimitExceeded = false

            file.on('data', (chunk) => {
                fileSize += chunk.length
                if (fileSize > MAX_FILE_SIZE) {
                    sizeLimitExceeded = true
                    file.destroy()
                } else {
                    chunks.push(chunk)
                }
            })

            file.on('end', async () => {
                if (sizeLimitExceeded) {
                    return res.status(400).json({
                        error: 'File too large. Maximum size is 10MB.'
                    })
                }

                const buffer = Buffer.concat(chunks)

                // Process image with Sharp (skip SVGs)
                let processedBuffer = buffer
                let contentType = info.mimeType

                if (!info.mimeType.includes('svg')) {
                    try {
                        processedBuffer = await sharp(buffer)
                            .withMetadata() // Preserve EXIF metadata including orientation
                            .resize(MAX_WIDTH, MAX_HEIGHT, {
                                fit: 'inside',
                                withoutEnlargement: true
                            })
                            .jpeg({ quality: JPEG_QUALITY })
                            .toBuffer()

                        contentType = 'image/jpeg'
                    } catch (sharpError) {
                        console.error('Sharp processing error:', sharpError)
                        return res.status(500).json({
                            error: 'Failed to process image',
                            details: sharpError.message
                        })
                    }
                }

                // Upload to Vercel Blob
                try {
                    // Get file extension from original filename
                    const ext = info.filename.split('.').pop()

                    // https://vercel.com/docs/vercel-blob/using-blob-sdk?framework=other&language=js#put
                    const blob = await put(
                        `item-images/${Date.now()}.${ext}`,
                        processedBuffer,
                        {
                            access: 'public',
                            contentType: contentType,
                            addRandomSuffix: true,
                            cacheControlMaxAge: 31536000  // 1 year
                        }
                    )

                    // Return blob details
                    res.json({
                        url: blob.url,
                        pathname: blob.pathname,
                        contentType: blob.contentType,
                        size: processedBuffer.length
                    })
                } catch (blobError) {
                    console.error('Vercel Blob upload error:', blobError)
                    res.status(500).json({
                        error: 'Failed to upload to storage',
                        details: blobError.message
                    })
                }
            })

            file.on('error', (err) => {
                console.error('File stream error:', err)
                res.status(500).json({
                    error: 'File processing error',
                    details: err.message
                })
            })

        } catch (error) {
            console.error('Upload error:', error)
            res.status(500).json({
                error: 'Upload failed',
                details: error.message
            })
        }
    })

    uploadProcessor.on('error', (err) => {
        console.error('Busboy error:', err)
        res.status(500).json({
            error: 'Upload processing failed',
            details: err.message
        })
    })

    req.pipe(uploadProcessor)
})

// DELETE /api/image - Delete image from Vercel Blob
router.delete('/image', async (req, res) => {
    if (!req.oidc?.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' })
    }
    try {
        const { url } = req.body

        if (!url) {
            return res.status(400).json({ error: 'Image URL is required' })
        }
        // https://vercel.com/docs/vercel-blob/using-blob-sdk?framework=other&language=js#del
        await del(url)
        res.json({ deleted: url })
    } catch (error) {
        console.error('Delete error:', error)
        res.status(500).json({
            error: 'Delete failed',
            details: error.message
        })
    }
})

export default router
