// Main UI script (includes upload logic)

let readyStatus = document.querySelector('#readyStatus')
let notReadyStatus = document.querySelector('#notReadyStatus')
let myForm = document.querySelector('#myForm')
let contentArea = document.querySelector('#contentArea')
let formDialog = document.querySelector('#formDialog')
let createButton = document.querySelector('#createButton')
let saveButton = document.querySelector('#saveButton')
let cancelButton = document.querySelector('#cancelButton')
let formHeading = document.querySelector('.modal-header h2')

// Auth/user profile elements
let profileArea = document.querySelector('#profile')
let controlsArea = document.querySelector('#controls')
let logo = document.querySelector('#logo')
let dataFilter = null

// Upload elements
const imagePreview = document.querySelector('#imagePreview')
const fileInput = document.querySelector('#fileInput')
const uploadArea = document.querySelector('#uploadArea')
const noticeArea = document.querySelector('#noticeArea')
const removeImageButton = document.querySelector('#removeImageButton')
const browseButton = document.querySelector('#browseButton')
const uploadInstructions = document.querySelector('#uploadInstructions')

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// Global auth state
let currentUser = {
    isAuthenticated: false,
    name: 'Guest',
    email: '',
    picture: '',
    sub: null
}

const setImagePreview = (url) => {
    imagePreview.setAttribute('src', url || '/assets/photo.svg')
}

const getImageUrl = () => {
    const field = myForm.elements['imageUrl']
    return field ? field.value : ''
}

const setImageUrl = (url) => {
    const field = myForm.elements['imageUrl']
    if (field) field.value = url
    setImagePreview(url)
}

// Show or hide the Browse / Replace button based on whether an image is uploaded
const refreshUI = () => {
    const imageUrl = getImageUrl()
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
const removeImage = async () => {
    const imageUrl = getImageUrl()

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
    setImageUrl('')
    fileInput.value = ''
    noticeArea.style.display = 'none'

    // Update button visibility
    refreshUI()
}

// Upload a file to the server
const upload = async (theFile) => {
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
    setImagePreview('/assets/load.svg')
    noticeArea.style.display = 'none'

    const formData = new FormData()
    formData.append('image', theFile)

    try {
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

        // Store URL in hidden form field and update preview
        setImageUrl(uploadDetails.url)

        // Update button visibility
        refreshUI()

    } catch (err) {
        console.error('Upload error:', err)
        noticeArea.style.display = 'block'
        noticeArea.textContent = 'An error occurred during upload'
        setImageUrl('')
    }
}

// Load user info from backend
const loadUser = async () => {
    try {
        const res = await fetch('/api/user')
        if (!res.ok) {
            throw new Error('Failed to load user')
        }
        const data = await res.json()
        currentUser = {
            isAuthenticated: !!data.isAuthenticated,
            sub: data.sub || null,           // add this line
            name: data.name || 'Guest',
            email: data.email || '',
            picture: data.picture || '/assets/user.svg'
        }

        profileArea.innerHTML = `
                <img src="${currentUser.picture}" referrerPolicy="no-referrer" crossorigin="anonymous" onerror="this.onerror=null;this.src='/assets/user.svg';">
                <div>
                    <h4>${currentUser.name}</h4>
                    <h5>${currentUser.email || ''}</h5>
                </div>
            `

        controlsArea.innerHTML = currentUser.isAuthenticated ? `
        
         <label class="filter-label">
                    <img src="/assets/filter.svg" alt="Filter" />  
                    <select id="dataFilter">
                        <option value="all">All Data</option>
                        <option value="mine">Owned by Me</option>
                        <option value="others">Owned by Others</option>
                    </select>
                </label>
<button class="button" id="createButton">Create</button>
                <button id="logoutButton" class="button">Logout</button>
            ` :

            '<button id="loginButton" class="button">Login</button>'

        // Wire up dynamically created create button
        document.querySelector('#createButton')?.addEventListener('click', openCreateDialog)

        // Wire up dynamically created auth buttons
        controlsArea.querySelector('#loginButton')?.addEventListener('click', () => window.location.href = '/login')
        controlsArea.querySelector('#logoutButton')?.addEventListener('click', () => window.location.href = '/logout')


        // Wire up dynamically created filter  
        document.querySelector('#dataFilter')?.addEventListener('change', (e) => {
            applyFilter(e.target.value)
        })


    } catch (err) {
        console.error('Error loading user:', err)
    }
}

// Get form data and process each type of input
// Prepare the data as JSON with a proper set of types
// e.g. Booleans, Numbers, Dates
const getFormData = () => {
    // FormData gives a baseline representation of the form
    // with all fields represented as strings
    const formData = new FormData(myForm)
    const json = Object.fromEntries(formData)

    // Handle checkboxes, dates, and numbers
    myForm.querySelectorAll('input').forEach(el => {
        const value = json[el.name]
        const isEmpty = !value || value.trim() === ''

        // Represent checkboxes as a Boolean value (true/false)
        if (el.type === 'checkbox') {
            json[el.name] = el.checked
        }
        // Represent number and range inputs as actual numbers
        else if (el.type === 'number' || el.type === 'range') {
            json[el.name] = isEmpty ? null : Number(value)
        }
        // Represent all date inputs in ISO-8601 DateTime format
        else if (el.type === 'date') {
            json[el.name] = isEmpty ? null : new Date(value).toISOString()
        }
    })
    return json
}


// listen for form submissions  
myForm.addEventListener('submit', async event => {
    // prevent the page from reloading when the form is submitted.
    event.preventDefault()
    const data = getFormData()
    await saveItem(data)
    myForm.reset()
    formDialog.close()
})

const openCreateDialog = () => {
    myForm.reset()
    setImageUrl('')
    refreshUI()
    formDialog.showModal()
}

// Open dialog when initial create button clicked (if present in DOM)
if (createButton) {
    createButton.addEventListener('click', openCreateDialog)
}

// Close dialog when cancel button clicked
cancelButton.addEventListener('click', () => {
    formDialog.close()
})

// Save button submits the form
saveButton.addEventListener('click', () => {
    myForm.requestSubmit()
})


// Save item (Create or Update)
const saveItem = async (data) => {
    console.log('Saving:', data)

    // Determine if this is an update or create
    const endpoint = data.id ? `/data/${data.id}` : '/data'
    const method = data.id ? "PUT" : "POST"

    const options = {
        method: method,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }

    try {
        const response = await fetch(endpoint, options)

        if (!response.ok) {
            // Auth/ownership errors
            if (response.status === 401) {
                alert('Please log in to create or edit cats.')
                return
            }
            if (response.status === 403) {
                alert('You can only edit cats that you created.')
                return
            }

            try {
                const errorData = await response.json()
                console.error('Error:', errorData)
                alert(errorData.error || response.statusText)
            }
            catch (err) {
                console.error(response.statusText)
                alert('Failed to save: ' + response.statusText)
            }
            return
        }

        const result = await response.json()
        console.log('Saved:', result)


        // Refresh the data list
        getData()
    }
    catch (err) {
        console.error('Save error:', err)
        alert('An error occurred while saving')
    }
}


// Edit item - populate form with existing data
const editItem = (data) => {
    console.log('Editing:', data)

    // Populate the form with data to be edited
    Object.keys(data).forEach(field => {
        const element = myForm.elements[field]
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = data[field]
            } else if (element.type === 'date') {
                // Extract yyyy-mm-dd from ISO date string (avoids timezone issues)
                element.value = data[field] ? data[field].substring(0, 10) : ''
            } else {
                element.value = data[field]
            }
        }
    })

    // Update image preview and upload UI
    setImagePreview(data.imageUrl || null)
    refreshUI()

    // Update the heading to indicate edit mode
    formHeading.textContent = 'Edit Cat'

    // Show the dialog
    formDialog.showModal()
}

// Delete item
const deleteItem = async (id) => {
    if (!confirm('Are you sure you want to delete this cat?')) {
        return
    }

    const endpoint = `/data/${id}`
    const options = { method: "DELETE" }

    try {
        const response = await fetch(endpoint, options)

        if (response.ok) {
            const result = await response.json()
            console.log('Deleted:', result)
            // Refresh the data list
            getData()
        }
        else {
            if (response.status === 401) {
                alert('Please log in to delete cats.')
                return
            }
            if (response.status === 403) {
                alert('You can only delete cats that you created.')
                return
            }
            const errorData = await response.json()
            alert(errorData.error || 'Failed to delete item')
        }
    } catch (error) {
        console.error('Delete error:', error)
        alert('An error occurred while deleting')
    }
}


const calendarWidget = (date) => {
    if (!date) return ''
    const month = new Date(date).toLocaleString("en-CA", { month: 'short', timeZone: "UTC" })
    const day = new Date(date).toLocaleString("en-CA", { day: '2-digit', timeZone: "UTC" })
    const year = new Date(date).toLocaleString("en-CA", { year: 'numeric', timeZone: "UTC" })
    return ` <div class="calendar">
                <div class="born"><img src="./assets/birthday.svg" /></div>
                <div class="month">${month}</div>
                <div class="day">${day}</div> 
                <div class="year">${year}</div>
            </div>`

}

const isOwner = (item) => {
    return !!(
        currentUser.isAuthenticated &&
        item.owner &&
        item.owner.sub &&
        item.owner.sub === currentUser.sub
    )
}

// Render a single item
const renderItem = (item) => {
    const div = document.createElement('div')
    div.classList.add('item-card')
    div.setAttribute('data-id', item.id)

    // Add image display if available
    const imageHTML = item.imageUrl ?
        `<div class="item-image-area" style="background: url(${item.imageUrl});">
            <div class="item-image-container">
                <img src="${item.imageUrl}" alt="${item.name}" class="item-image" />
            </div>
        </div>`
        :
        ''


    const template = /*html*/`
    
        ${imageHTML}
    
    <div class="item-heading">
        <h3> ${item.name} </h3>
        <div class="microchip-info">
            <img src="/assets/chip.svg" /> ${item.microchip || '<i>???</i>'} 
        </div>  
    </div>
    <div class="item-info">  
        <div class="item-icon" style="
            background: linear-gradient(135deg, 
            ${item.primaryColor} 0%, 
            ${item.primaryColor} 40%, 
            ${item.secondaryColor} 60%, 
            ${item.secondaryColor} 100%); 
        ">
        </div> 
        <div class="stats">
            <div class="stat">
                <span>Playfulness</span>
                <meter max="10" min="0" value="${item.playfulness || 0}"></meter> 
            </div>
            <div class="stat">
                <span>Appetite</span>
                <meter max="10" min="0" value="${item.appetite || 0}"></meter> 
            </div>
        </div> 
            
         ${calendarWidget(item.birthDate)}
    </div>
        
    <div class="item-info">  
        <section class="owner" style="${currentUser.isAuthenticated && item.owner && item.owner.name ? '' : 'display:none;'}">
    <img src="${item.owner && item.owner.picture ? item.owner.picture : '/assets/user.svg'}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/assets/user.svg';" />
    <span>${item.owner && item.owner.name ? item.owner.name : ''}</span>
</section>
        <section class="breed" style="${item.breed ? '' : 'display:none;'}">  
            <img src="/assets/ribbon.svg" />  ${item.breed}
        </section>
        <section class="food" style="${item.food ? '' : 'display:none;'}">
             ${item.food ? `<img src="/assets/${item.food}.svg" /> <span>${item.food} food</span>` : ''}
        </section> 
        <section class="adoption">
            <img src="/assets/${item.isAdopted ? 'adopted' : 'paw'}.svg" />
            ${item.isAdopted ? 'Adopted' : 'Available'}
        </section> 
    </div>

    <section class="description" style="${item.description ? '' : 'display:none;'}">  
        <p>${item.description}</p>
    </section>

        
           
        <div class="item-actions">
            ${isOwner(item) ? `
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            ` : ''}
        </div>
    `
    // Sanitize HTML but allow referrerpolicy attribute on images
    // so that google profile pics can be used without errors
    const sanitizeOptions = { ADD_ATTR: ['referrerpolicy'] }

    // add sanitized HTML to div
    div.innerHTML = DOMPurify.sanitize(template, sanitizeOptions);


    // If buttons exist (owner only), wire up handlers
    const editBtn = div.querySelector('.edit-btn')
    const deleteBtn = div.querySelector('.delete-btn')

    if (editBtn && deleteBtn) {
        editBtn.addEventListener('click', () => editItem(item))
        deleteBtn.addEventListener('click', () => deleteItem(item.id))
    }

    if (isOwner(item)) div.classList.add('owned')

    return div
}

// fetch items from API endpoint and populate the content div
const getData = async () => {
    try {
        const response = await fetch('/data')

        if (response.ok) {
            readyStatus.style.display = 'block'
            notReadyStatus.style.display = 'none'

            const data = await response.json()
            console.log('Fetched data:', data)

            if (data.length == 0) {
                contentArea.innerHTML = '<p><i>No data found in the database.</i></p>'
                return
            }
            else {
                contentArea.innerHTML = ''
                data.forEach(item => {
                    const itemDiv = renderItem(item)
                    contentArea.appendChild(itemDiv)
                })
            }
        }
        else {
            // If the request failed, show the "not ready" status
            // to inform users that there may be a database connection issue
            notReadyStatus.style.display = 'block'
            readyStatus.style.display = 'none'
            createButton.style.display = 'none'
            contentArea.style.display = 'none'
        }
    } catch (error) {
        console.error('Error fetching data:', error)
        notReadyStatus.style.display = 'block'
    }
}

// Revert to the default form title on reset
myForm.addEventListener('reset', () => {
    formHeading.textContent = 'Share a Cat'
    // Reset image preview
    setImagePreview(null)
    // Update upload UI
    refreshUI()
})

// Reset the form when the create button is clicked. 
if (createButton) {
    createButton.addEventListener('click', () => {
        myForm.reset()
    })
}

// Initialize upload instructions visibility based on pointer capability
// Hide by default, only show on devices with fine pointer control
if (uploadInstructions) {
    uploadInstructions.style.display = window.matchMedia('(pointer: fine)').matches ? 'block' : 'none'
}


// Remove Image Button Click Handler
if (removeImageButton) {
    removeImageButton.addEventListener('click', (event) => {
        event.stopPropagation() // Prevent triggering the uploadArea click
        removeImage()
    })
}

// BROWSE BUTTON
if (browseButton) {
    browseButton.addEventListener('click', (event) => {
        event.stopPropagation() // Prevent triggering the uploadArea click
        fileInput.click()
    })
}

// FILE INPUT CHANGE
if (fileInput) {
    fileInput.addEventListener('change', (event) => {
        const file = event.currentTarget.files[0]
        if (file) upload(file)
    })
}

// CLICK ANYWHERE ON UPLOAD AREA (only when no image is uploaded)
if (uploadArea) {
    uploadArea.addEventListener('click', (event) => {
        // Only trigger file input if clicking the upload area itself, not buttons
        if (event.target === uploadArea || event.target === imagePreview) {
            fileInput.click()
        }
    })
}

// DRAG AND DROP (for devices with fine pointer control)
if (uploadArea && window.matchMedia('(pointer: fine)').matches) {
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

// Apply front-end filter based on ownership
const applyFilter = (mode) => {
    const cards = contentArea.querySelectorAll('.item-card')
    cards.forEach(card => {
        const isOwned = card.classList.contains('owned')
        if (mode === 'mine') {
            card.style.display = isOwned ? '' : 'none'
        } else if (mode === 'others') {
            card.style.display = isOwned ? 'none' : ''
        } else {
            card.style.display = ''
        }
    })
}

// Clicking logo: navigate home  
if (logo) {
    logo.addEventListener('click', () => window.location.href = '/')
}

// Initialize app
const init = async () => {
    await loadUser()
    await getData()
}

init()
