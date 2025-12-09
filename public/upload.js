// Upload module for handling image uploads to Vercel Blob

export const imagePreview = document.querySelector('#imagePreview')
export const fileInput = document.querySelector('#fileInput')
export const uploadArea = document.querySelector('#uploadArea')
export const noticeArea = document.querySelector('#noticeArea')
export const myForm = document.querySelector('#myForm')
export const removeImageButton = document.querySelector('#removeImageButton')
export const browseButton = document.querySelector('#browseButton')
export const uploadInstructions = document.querySelector('#uploadInstructions')

export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Show or hide the Browse / Replace button based on whether an image is uploaded
export const refreshUI = () => {
    const imageUrl = myForm.elements['imageUrl'].value
    const hasImage = imageUrl && imageUrl !== '' && !imageUrl.includes('photo.svg')
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches

    if (hasImage) {
        removeImageButton.style.display = 'block'
        browseButton.textContent = 'Replace'
        uploadInstructions.style.display = 'none'
    } else {
        removeImageButton.style.display = 'none'
        browseButton.textContent = 'Browse'
        // Only show upload instructions on devices with fine pointer control (mouse)
        uploadInstructions.style.display = hasFinePointer ? 'block' : 'none'
    }
}

// Remove the uploaded image
export const removeImage = async () => {
    const imageUrl = myForm.elements['imageUrl'].value

    // If there's a valid image URL, delete it from Vercel Blob
    if (imageUrl && imageUrl !== '' && !imageUrl.includes('photo.svg')) {
        try {
            const response = await fetch('/api/image', {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: imageUrl })
            })

            if (!response.ok) {
                const errorData = await response.json()
                console.error('Delete error:', errorData)
                noticeArea.style.display = 'block'
                noticeArea.textContent = errorData.error || 'Failed to delete image'
                return
            }

            console.log('Image deleted successfully')
        } catch (err) {
            console.error('Delete error:', err)
            noticeArea.style.display = 'block'
            noticeArea.textContent = 'An error occurred while deleting the image'
            return
        }
    }

    // Reset the form field and preview
    myForm.elements['imageUrl'].value = ''
    imagePreview.setAttribute('src', '/assets/photo.svg')
    fileInput.value = ''
    noticeArea.style.display = 'none'

    // Update button visibility
    refreshUI()
}

// Upload a file to the server
export const upload = async (theFile) => {
    // Validate file size
    if (theFile.size > MAX_FILE_SIZE) {
        alert('Maximum file size is 10MB')
        return
    }

    // Validate file type
    if (!theFile.type.startsWith('image/')) {
        noticeArea.style.display = 'block'
        noticeArea.textContent = 'Only image files are supported.'
        return
    }

    // Show loading state
    imagePreview.setAttribute('src', '/assets/load.svg')
    noticeArea.style.display = 'none'

    // Prepare upload 
    // i.e. construct a "multipart/form-data" request 
    // NOTE:  "multipart" implies that the request body may contain
    // both ordinary data and binary file data (e.g. images)
    // See also: https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest_API/Using_FormData_Objects#sending_files_using_a_formdata_object

    const formData = new FormData()
    formData.append('image', theFile)

    try {

        // Note: when the fetch reques body includes form data as below,
        // the browser will automatically add the correct
        // "Content-Type: multipart/form-data" header 
        // so that the server knows how to parse it 

        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        })


        if (!response.ok) {
            const errorData = await response.json()
            noticeArea.style.display = 'block'
            noticeArea.textContent = errorData.error || 'Upload failed'
            imagePreview.setAttribute('src', '/assets/photo.svg')
            return
        }

        const uploadDetails = await response.json()
        console.log('Upload successful:', uploadDetails)

        // Update preview with Vercel Blob URL
        imagePreview.setAttribute('src', uploadDetails.url)

        // Store URL in hidden form field
        myForm.elements['imageUrl'].value = uploadDetails.url

        // Update button visibility
        refreshUI()

    } catch (err) {
        console.error('Upload error:', err)
        noticeArea.style.display = 'block'
        noticeArea.textContent = 'An error occurred during upload'
        imagePreview.setAttribute('src', '/assets/photo.svg')
    }
}

// Remove Image Button Click Handler
removeImageButton.addEventListener('click', (event) => {
    event.stopPropagation() // Prevent triggering the uploadArea click
    removeImage()
})

// BROWSE BUTTON
browseButton.addEventListener('click', (event) => {
    event.stopPropagation() // Prevent triggering the uploadArea click
    fileInput.click()
})

// FILE INPUT CHANGE
fileInput.addEventListener('change', (event) => {
    const file = event.currentTarget.files[0]
    if (file) upload(file)
})

// CLICK ANYWHERE ON UPLOAD AREA (only when no image is uploaded)
uploadArea.addEventListener('click', (event) => {
    // Only trigger file input if clicking the upload area itself, not buttons
    if (event.target === uploadArea || event.target === imagePreview) {
        fileInput.click()
    }
})

// DRAG AND DROP (for devices with fine pointer control)
if (window.matchMedia('(pointer: fine)').matches) {
    const dragAndDropEvents = {
        dragenter: () => uploadArea.classList.add('ready'),
        dragover: () => uploadArea.classList.add('ready'),
        dragleave: (event) => {
            if (!uploadArea.contains(event.relatedTarget)) {
                uploadArea.classList.remove('ready')
            }
        },
        drop: (event) => {
            uploadArea.classList.remove('ready')
            const file = event.dataTransfer.files[0]
            if (file) upload(file)
        }
    }

    for (const [eventName, handler] of Object.entries(dragAndDropEvents)) {
        uploadArea.addEventListener(eventName, (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        uploadArea.addEventListener(eventName, handler)
    }
}

// Initialize upload instructions visibility based on pointer capability
// Hide by default, only show on devices with fine pointer control
uploadInstructions.style.display = window.matchMedia('(pointer: fine)').matches ? 'block' : 'none'

// Initialize button visibility on page load
refreshUI()
