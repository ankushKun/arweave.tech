import { Hono } from 'hono'
import axios from 'axios'
import * as Cheerio from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'
import WebSocket, { WebSocketServer } from 'ws'

const cookie = process.env.ETH_COOKIE
const storage_path = "./etgl.json"
const url_storage_path = "./etgl-urls.json"

type Gender = "M" | "F"

type UserData = {
    uuid: string,
    self: boolean,
    attendeeTypes: string[],
    user: {
        uuid: string,
        name: string,
        title: string | null,
        bio: string | null,
        avatar: {
            fullUrl: string
        } | null,
        gender: Gender,
        worldid?: string
    },
    event?: {
        slug: string,
        name: string,
        status: string,
        squareLogo?: {
            fullUrl: string
        },
        timezone?: {
            name: string
        }
    }
}

type AllProfiles = {
    [userid: string]: UserData
}

// WebSocket types for GPS coordinate sharing
type GPSCoordinates = {
    latitude: number
    longitude: number
    accuracy?: number
    timestamp: number
}

type UserLocation = {
    userId: string
    coordinates: GPSCoordinates
    lastUpdated: number
}

type WSMessage = {
    type: 'gps_update' | 'user_selection' | 'selected_users' | 'ping' | 'pong'
    userId?: string
    data?: any
}

type SelectedUsers = {
    male: string | null
    female: string | null
    selectedAt: number
}

// WebSocket connection management
const wsClients = new Set<WebSocket>()
const userLocations = new Map<string, UserLocation>()
let selectedUsers: SelectedUsers = {
    male: null,
    female: null,
    selectedAt: 0
}

// WebSocket server instance
let wss: WebSocketServer | null = null

// WebSocket utility functions
function broadcastToClients(message: WSMessage) {
    const messageStr = JSON.stringify(message)
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageStr)
        }
    })
}

function removeInactiveClients() {
    wsClients.forEach(client => {
        if (client.readyState !== WebSocket.OPEN) {
            wsClients.delete(client)
        }
    })
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3 // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180
    const φ2 = lat2 * Math.PI / 180
    const Δφ = (lat2 - lat1) * Math.PI / 180
    const Δλ = (lon2 - lon1) * Math.PI / 180

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    return R * c // Distance in meters
}

function selectRandomUsers() {
    const profiles = getAllProfiles()
    const maleUsers: string[] = []
    const femaleUsers: string[] = []

    // Categorize users by gender
    Object.entries(profiles).forEach(([userId, profile]) => {
        if (profile.user?.gender === 'M') {
            maleUsers.push(userId)
        } else if (profile.user?.gender === 'F') {
            femaleUsers.push(userId)
        }
    })

    // Select random users
    const selectedMale = maleUsers.length > 0 ?
        maleUsers[Math.floor(Math.random() * maleUsers.length)] : null
    const selectedFemale = femaleUsers.length > 0 ?
        femaleUsers[Math.floor(Math.random() * femaleUsers.length)] : null

    selectedUsers = {
        male: selectedMale,
        female: selectedFemale,
        selectedAt: Date.now()
    }

    // Broadcast the selection to all clients
    broadcastToClients({
        type: 'selected_users',
        data: selectedUsers
    })

    console.log('New users selected:', selectedUsers)
}

// Initialize WebSocket server
function initializeWebSocketServer(port: number = 3002) {
    if (wss) {
        console.log('WebSocket server already initialized')
        return wss
    }

    wss = new WebSocketServer({ port })

    wss.on('connection', (ws: WebSocket) => {
        console.log('New WebSocket connection established')
        wsClients.add(ws)

        // Send current selected users to new client
        ws.send(JSON.stringify({
            type: 'selected_users',
            data: selectedUsers
        }))

        // Send current user locations to new client
        const locationData = Array.from(userLocations.values())
        ws.send(JSON.stringify({
            type: 'gps_update',
            data: locationData
        }))

        ws.on('message', (message: string) => {
            try {
                const wsMessage: WSMessage = JSON.parse(message)
                handleWebSocketMessage(ws, wsMessage)
            } catch (error) {
                console.error('Error parsing WebSocket message:', error)
            }
        })

        ws.on('close', () => {
            console.log('WebSocket connection closed')
            wsClients.delete(ws)
        })

        ws.on('error', (error) => {
            console.error('WebSocket error:', error)
            wsClients.delete(ws)
        })

        // Send ping every 30 seconds to keep connection alive
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ping' }))
            } else {
                clearInterval(pingInterval)
            }
        }, 30000)
    })

    console.log(`WebSocket server started on port ${port}`)

    // Clean up inactive clients every minute
    setInterval(removeInactiveClients, 60000)

    // Select new users every hour
    setInterval(selectRandomUsers, 60 * 60 * 1000)

    // Initial user selection
    setTimeout(selectRandomUsers, 5000) // Wait 5 seconds for profiles to load

    return wss
}

function handleWebSocketMessage(ws: WebSocket, message: WSMessage) {
    switch (message.type) {
        case 'gps_update':
            if (message.userId && message.data) {
                const userLocation: UserLocation = {
                    userId: message.userId,
                    coordinates: message.data,
                    lastUpdated: Date.now()
                }

                userLocations.set(message.userId, userLocation)

                // Broadcast location update to all other clients
                broadcastToClients({
                    type: 'gps_update',
                    userId: message.userId,
                    data: userLocation
                })

                console.log(`GPS update from user ${message.userId}:`, message.data)
            }
            break

        case 'user_selection':
            if (message.userId && message.data?.selectedUserId) {
                // Verify proximity before confirming selection
                const selectorLocation = userLocations.get(message.userId)
                const selectedLocation = userLocations.get(message.data.selectedUserId)

                if (selectorLocation && selectedLocation) {
                    const distance = calculateDistance(
                        selectorLocation.coordinates.latitude,
                        selectorLocation.coordinates.longitude,
                        selectedLocation.coordinates.latitude,
                        selectedLocation.coordinates.longitude
                    )

                    // Allow selection if users are within 100 meters
                    if (distance <= 100) {
                        console.log(`User ${message.userId} selected ${message.data.selectedUserId} (distance: ${distance.toFixed(2)}m)`)

                        // Broadcast successful selection
                        broadcastToClients({
                            type: 'user_selection',
                            userId: message.userId,
                            data: {
                                selectedUserId: message.data.selectedUserId,
                                confirmed: true,
                                distance: distance
                            }
                        })
                    } else {
                        // Send rejection back to selector
                        ws.send(JSON.stringify({
                            type: 'user_selection',
                            data: {
                                selectedUserId: message.data.selectedUserId,
                                confirmed: false,
                                reason: 'Too far away',
                                distance: distance
                            }
                        }))
                    }
                }
            }
            break

        case 'pong':
            // Handle pong response
            break

        default:
            console.log('Unknown message type:', message.type)
    }
}

function setGender(key: string, gender: Gender, worldid?: string): boolean {
    console.log(`Attempting to set gender for key: ${key}`)
    const profile = getProfile(key)
    if (!profile) {
        console.log(`Profile not found for key: ${key}`)
        return false
    }

    // Ensure user object exists
    if (!profile.user) {
        console.log(`Profile user object missing for key: ${key}`)
        profile.user = {}
    }

    console.log(`Setting gender from ${profile.user.gender} to ${gender} for key: ${key}`)
    profile.user.gender = gender

    // Set worldid if provided
    if (worldid) {
        console.log(`Setting worldid to ${worldid} for key: ${key}`)
        profile.user.worldid = worldid
    }

    try {
        saveProfile(key, profile)
        console.log(`Successfully set gender to ${gender}${worldid ? ` and worldid to ${worldid}` : ''} for key: ${key}`)
        return true
    } catch (error) {
        console.error(`Failed to save profile after setting gender for key: ${key}`, error)
        return false
    }
}

function saveProfile(key: string, data: any) {
    try {
        // Determine which file to use based on key
        const isUrl = key.startsWith('https://')
        const filePath = isUrl ? url_storage_path : storage_path

        let profiles: Record<string, any> = {}

        // Read existing data if file exists
        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath, 'utf8')
            if (fileContent.trim()) {
                profiles = JSON.parse(fileContent)
            }
        }

        // Get existing profile to preserve manually set fields like gender
        const existingProfile = profiles[key]
        let updatedData = { ...data }

        // Preserve existing gender data if it exists and new data doesn't have gender or has null gender
        if (existingProfile?.user?.gender && (!updatedData.user?.gender || updatedData.user.gender === null)) {
            if (!updatedData.user) {
                updatedData.user = {}
            }
            updatedData.user.gender = existingProfile.user.gender
            console.log(`Preserving existing gender data (${existingProfile.user.gender}) for key: ${key}`)
        }

        // Preserve existing worldid data if it exists and new data doesn't have worldid
        if (existingProfile?.user?.worldid && !updatedData.user?.worldid) {
            if (!updatedData.user) {
                updatedData.user = {}
            }
            updatedData.user.worldid = existingProfile.user.worldid
            console.log(`Preserving existing worldid data (${existingProfile.user.worldid}) for key: ${key}`)
        }

        // Add/update the profile data with timestamp
        profiles[key] = {
            ...updatedData,
            lastUpdated: new Date().toISOString(),
            cached: true
        }

        // Write back to file
        fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2))
        console.log(`Profile saved for key: ${key} in ${isUrl ? 'URL' : 'regular'} storage`)
    } catch (error) {
        console.error('Error saving profile:', error)
    }
}

function getProfile(key: string): any | null {
    try {
        // Determine which file to use based on key
        const isUrl = key.startsWith('https://')
        const filePath = isUrl ? url_storage_path : storage_path

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return null
        }

        // Read and parse the file
        const fileContent = fs.readFileSync(filePath, 'utf8')
        if (!fileContent.trim()) {
            return null
        }

        const profiles: Record<string, any> = JSON.parse(fileContent)
        const profile = profiles[key]

        if (!profile) {
            return null
        }

        // Check if cache is still valid (optional: add expiration logic here)
        // For now, we'll return cached data regardless of age
        console.log(`Profile found in ${isUrl ? 'URL' : 'regular'} cache for key: ${key}`)
        return profile

    } catch (error) {
        console.error('Error reading profile:', error)
        return null
    }
}

const etgl = new Hono()

async function getAllProfiles(): Promise<AllProfiles> {
    try {
        // Check if file exists
        if (!fs.existsSync(storage_path)) {
            return {}
        }

        // Read and parse the file
        const fileContent = fs.readFileSync(storage_path, 'utf8')
        if (!fileContent.trim()) {
            return {}
        }

        const profiles: Record<string, any> = JSON.parse(fileContent)
        console.log(`Retrieved ${Object.keys(profiles).length} profiles from regular storage`)
        return profiles

    } catch (error) {
        console.error('Error reading all profiles:', error)
        return {}
    }
}

async function getAllProfilesByUrl(): Promise<AllProfiles> {
    try {
        // Check if file exists
        if (!fs.existsSync(url_storage_path)) {
            return {}
        }

        // Read and parse the file
        const fileContent = fs.readFileSync(url_storage_path, 'utf8')
        if (!fileContent.trim()) {
            return {}
        }

        const profiles: Record<string, any> = JSON.parse(fileContent)
        console.log(`Retrieved ${Object.keys(profiles).length} profiles from URL storage`)
        return profiles

    } catch (error) {
        console.error('Error reading all URL profiles:', error)
        return {}
    }
}

// Function to fetch and parse profile data
async function fetchProfileData(url: string, userid: string, existingProfile?: any): Promise<any | null> {
    try {
        const response = await axios.get(url, {
            headers: {
                Cookie: cookie
            },
            maxRedirects: 5,
        })

        const $ = Cheerio.load(response.data)
        const scriptTags = $('script')

        let foundData: any | null = null
        let max = scriptTags.length

        let src = ""
        let parsedData = null
        let found = false
        for (const element of scriptTags) {
            const scriptContent = $(element).text()
            console.log(scriptContent, "\n")
            if (found) {
                const rest = scriptContent.replace("self.__next_f.push([1,\"", "").replace(`\\n"])`, '')
                src += rest
            }
            if (scriptContent.includes("6:")) {
                src = scriptContent.split("6:")[1].slice(0, -3)
                found = true
            }
            try {
                parsedData = JSON.parse(src)
                break
            } catch {
                continue
            }
        }
        // scriptTags.each((index, element) => {
        //     // else if (index == max - 1) {
        //     //     const pfpPart = scriptContent.replace("self.__next_f.push([1,\"", "")
        //     //     // Remove the trailing characters more carefully
        //     //     let cleanPfpPart = pfpPart
        //     //     if (cleanPfpPart.endsWith('"])\n')) {
        //     //         cleanPfpPart = cleanPfpPart.slice(0, -4)
        //     //     } else if (cleanPfpPart.endsWith('"]')) {
        //     //         cleanPfpPart = cleanPfpPart.slice(0, -2)
        //     //     } else if (cleanPfpPart.endsWith('"]\n')) {
        //     //         cleanPfpPart = cleanPfpPart.slice(0, -3)
        //     //     } else if (cleanPfpPart.endsWith('"\n')) {
        //     //         cleanPfpPart = cleanPfpPart.slice(0, -2)
        //     //     } else if (cleanPfpPart.endsWith('"')) {
        //     //         cleanPfpPart = cleanPfpPart.slice(0, -1)
        //     //     }
        //     //     src += cleanPfpPart
        //     //     console.log("pfp")
        //     // }
        // })
        console.log(src)

        // Parse the combined JSON string
        try {
            let parsedArray
            try {
                // First try direct JSON.parse
                parsedArray = JSON.parse(src)
                console.log("Direct parse succeeded")
            } catch (directParseError) {
                console.log("Direct parse failed, trying manual unescape method")
                // Manually handle the escaped string
                let cleanStr = src

                // Remove outer quotes if present
                if (cleanStr.startsWith('"') && cleanStr.endsWith('"')) {
                    cleanStr = cleanStr.slice(1, -1)
                }

                // Handle various trailing patterns more comprehensively
                const trailingPatterns = [
                    ']\n"',
                    ']\n',
                    '"]\n',
                    '"]',
                    '"',
                    '\n"',
                    '\n'
                ]

                for (const pattern of trailingPatterns) {
                    if (cleanStr.endsWith(pattern)) {
                        cleanStr = cleanStr.slice(0, -pattern.length)
                        break
                    }
                }

                // Ensure the string ends properly with ]
                if (!cleanStr.endsWith(']')) {
                    // Find the last complete object/array closure
                    const lastBrace = cleanStr.lastIndexOf('}')
                    if (lastBrace !== -1) {
                        cleanStr = cleanStr.substring(0, lastBrace + 1) + ']'
                    }
                }

                // Unescape the JSON string properly - handle problematic sequences first
                cleanStr = cleanStr
                    // CRITICAL: Handle backslash-newline sequences that break JSON parsing
                    .replace(/\\\n/g, '\\n')        // Convert literal backslash-newline to escaped newline
                    .replace(/\\\r/g, '\\r')        // Convert literal backslash-carriage return
                    // Handle URL-encoded characters that might be causing issues
                    .replace(/\\u0026/g, '&')       // Fix escaped ampersands in URLs
                    .replace(/\\"/g, '"')           // Unescape quotes
                    .replace(/\\n/g, '\n')          // Unescape newlines (after fixing literal ones)
                    .replace(/\\r/g, '\r')          // Unescape carriage returns
                    .replace(/\\t/g, '\t')          // Unescape tabs
                    // Only process valid 4-digit unicode escapes, not partial ones
                    .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
                        // Double-check it's a valid hex sequence
                        if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
                            return String.fromCharCode(parseInt(hex, 16))
                        }
                        return match // Return original if not valid
                    })
                    .replace(/\\\\/g, '\\')         // Unescape backslashes (do this last)

                console.log("Cleaned string:", cleanStr.substring(0, 200) + "..." + cleanStr.substring(cleanStr.length - 50))

                // Additional debugging for problematic characters
                const problematicChars = cleanStr.match(/\\u[0-9a-fA-F]{0,3}[^0-9a-fA-F]|\\[^"nrt\\u]/g)
                if (problematicChars) {
                    console.log("Found potentially problematic escape sequences:", problematicChars)
                    // Try to fix common problematic patterns
                    cleanStr = cleanStr
                        .replace(/\\\n/g, '\\n')    // Fix any remaining backslash-newline
                        .replace(/\\\r/g, '\\r')    // Fix any remaining backslash-carriage return
                }

                // Additional validation before parsing
                if (!cleanStr.trim()) {
                    console.error("Cleaned string is empty")
                    return null
                }

                // Check if it looks like valid JSON structure
                if (!cleanStr.startsWith('[') || !cleanStr.endsWith(']')) {
                    console.error("Cleaned string doesn't look like a JSON array")
                    console.error("Starts with:", cleanStr.substring(0, 10))
                    console.error("Ends with:", cleanStr.substring(cleanStr.length - 10))
                    return null
                }

                try {
                    parsedArray = JSON.parse(cleanStr)
                } catch (finalParseError) {
                    console.error("Final parse error:", finalParseError)

                    // Try multiple fixes in sequence
                    let fixedStr = cleanStr
                        .replace(/,\s*}/g, '}')     // Remove trailing commas in objects
                        .replace(/,\s*]/g, ']')     // Remove trailing commas in arrays
                        // Fix any remaining literal newlines in strings (simple approach)
                        .replace(/([^\\])\n/g, '$1\\n')             // Escape unescaped newlines
                        .replace(/([^\\])\r/g, '$1\\r')             // Escape unescaped carriage returns
                        .replace(/^\n/g, '\\n')                     // Handle newlines at start
                        .replace(/^\r/g, '\\r')                     // Handle carriage returns at start
                        // Fix any remaining malformed escape sequences
                        .replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u')  // Escape incomplete unicode sequences
                        .replace(/\\(?!["\\/bfnrtu])/g, '\\\\')      // Escape invalid escape characters (added 'u' to valid list)

                    try {
                        parsedArray = JSON.parse(fixedStr)
                        console.log("Parse succeeded after comprehensive fix")
                    } catch (ultimateError) {
                        console.error("Ultimate parse error:", ultimateError)
                        console.error("Final string sample:", fixedStr.substring(0, 200) + "...")

                        // Last resort: try to extract just the data we need using regex
                        try {
                            const dataMatch = cleanStr.match(/"uuid":"[^"]+","self":(true|false),"attendeeTypes":\[[^\]]*\],"event":\{[^}]+\},"user":\{[^}]+\}/)
                            if (dataMatch) {
                                console.log("Attempting regex extraction as last resort")
                                // This is a fallback - we'd need to implement proper extraction here
                                // For now, just return null and let the cache handle it
                            }
                        } catch (regexError) {
                            console.error("Regex extraction also failed:", regexError)
                        }

                        return null
                    }
                }
            }

            console.log("Parsed array:", parsedArray)

            // The data structure appears to be: ["$", "$L14", null, actualData]
            // So we need the element at index 3
            if (Array.isArray(parsedArray) && parsedArray.length > 3) {
                const rawUserData = parsedArray[3]
                console.log("Raw user data:", rawUserData)

                // Transform the data to match our UserData type
                foundData = {
                    uuid: rawUserData.uuid,
                    self: rawUserData.self,
                    attendeeTypes: rawUserData.attendeeTypes,
                    user: {
                        uuid: rawUserData.user.uuid,
                        name: rawUserData.user.name,
                        title: rawUserData.user.title,
                        bio: rawUserData.user.bio,
                        avatar: rawUserData.user.avatar,
                        // Preserve existing gender if available, otherwise use raw data
                        gender: existingProfile?.user?.gender || rawUserData.user.gender || null,
                        // Preserve existing worldid if available
                        worldid: existingProfile?.user?.worldid
                    },
                    // Include additional event data that might be useful
                    event: rawUserData.event
                }
                console.log("Processed user data:", foundData)
            } else {
                console.error("Invalid array structure or missing data at index 3")
                return null
            }
        } catch (parseError) {
            console.error("Error parsing combined JSON data:", parseError)
            console.error("Failed to parse src string:", src.substring(0, 200) + "...")
            return null
        }

        return foundData
    } catch (error) {
        console.error('Error fetching profile data:', error)
        return null
    }
}

// Basic health check endpoints
etgl.get('/etgl/profile/:id', async (c) => {
    const userid = c.req.param('id')
    const url = `https://ethglobal.com/connect/${userid}`

    console.log("Fetching profile for", userid)

    // Check cache first
    const cachedProfile = getProfile(userid)
    if (cachedProfile) {
        console.log("Returning cached profile and refreshing in background")

        // Start background refresh (don't await)
        fetchProfileData(url, userid, cachedProfile).then(freshData => {
            if (freshData) {
                console.log("Background refresh completed for", userid)
                saveProfile(userid, freshData)
            } else {
                console.log("Background refresh failed for", userid)
            }
        }).catch(error => {
            console.error("Background refresh error for", userid, error)
        })

        return c.json(cachedProfile)
    }

    // No cache found, fetch fresh data
    const freshData = await fetchProfileData(url, userid)

    if (freshData) {
        // Save to cache
        saveProfile(userid, freshData)
        return c.json(freshData)
    } else {
        return c.json({ error: 'ETHGlobal New Delhi data not found' }, 404)
    }
})

etgl.get('/etgl/profile', async (c) => {
    const url = c.req.url.split("url=")[1]
    if (!url) {
        return c.json({ error: 'URL parameter is required' }, 400)
    }

    const decodedUrl = decodeURIComponent(url)
    console.log("Fetching profile for", decodedUrl)

    // Check cache first using the full URL as key
    const cachedProfile = getProfile(decodedUrl)
    if (cachedProfile) {
        console.log("Returning cached profile for URL and refreshing in background")

        // Start background refresh (don't await)
        Promise.resolve().then(async () => {
            try {
                const response = await axios.get(decodedUrl, {
                    headers: { Cookie: cookie },
                    maxRedirects: 5,
                })
                const id = response.request.path.split("/")[2] as string
                const freshData = await fetchProfileData(`https://ethglobal.com/connect/${id}`, id, cachedProfile)

                if (freshData) {
                    console.log("Background refresh completed for URL", decodedUrl)
                    saveProfile(decodedUrl, freshData) // Save under URL key
                    saveProfile(id, freshData) // Also save under ID key
                } else {
                    console.log("Background refresh failed for URL", decodedUrl)
                }
            } catch (error) {
                console.error("Background refresh error for URL", decodedUrl, error)
            }
        })

        return c.json(cachedProfile)
    }

    try {
        //add cookie and fetch with axios, following redirects
        const response = await axios.get(decodedUrl, {
            headers: {
                Cookie: cookie
            },
            maxRedirects: 5,
        })

        console.log("Redirecting to", response.request.path)
        const id = response.request.path.split("/")[2] as string

        // Check if we have cached data for this ID
        const cachedById = getProfile(id)
        if (cachedById) {
            // Save the same data under the URL key for future URL-based requests
            saveProfile(decodedUrl, cachedById)
            return c.json(cachedById)
        }

        // proxy /etgl/profile/:id
        return c.redirect(`./profile/${id}`)

    } catch (error) {
        console.error(error)
        return c.json({ error: 'Failed to fetch profile data' }, 500)
    }
})

etgl.get('/etgl/profile-all', async (c) => {
    try {
        // Get query parameter to determine which storage to use
        const type = c.req.query('type') // 'userid' (default), 'url', or 'both'

        let result: any = {}

        if (type === 'url') {
            // Only get profiles stored by URL
            const urlProfiles = await getAllProfilesByUrl()
            result = {
                type: 'url',
                count: Object.keys(urlProfiles).length,
                profiles: urlProfiles
            }
        } else if (type === 'both') {
            // Get both types
            const profiles = await getAllProfiles()
            const urlProfiles = await getAllProfilesByUrl()

            result = {
                type: 'both',
                userid_storage: {
                    count: Object.keys(profiles).length,
                    profiles: profiles
                },
                url_storage: {
                    count: Object.keys(urlProfiles).length,
                    profiles: urlProfiles
                },
                total_count: Object.keys(profiles).length + Object.keys(urlProfiles).length
            }
        } else {
            // Default: get profiles stored by user ID
            const profiles = await getAllProfiles()
            result = {
                type: 'userid',
                count: Object.keys(profiles).length,
                profiles: profiles
            }
        }

        return c.json(result)

    } catch (error) {
        console.error('Error getting all profiles:', error)
        return c.json({ error: 'Failed to retrieve profiles' }, 500)
    }
})

etgl.post("/etgl/set-gender/:id", async (c) => {
    const userid = c.req.param('id')

    // Get data from request body
    let requestData
    try {
        requestData = await c.req.json()
    } catch (error) {
        return c.json({ error: 'Invalid JSON in request body' }, 400)
    }

    const gender = requestData.gender as Gender
    const worldid = requestData.worldid as string

    console.log("Setting gender for", userid, "to", gender, "with worldid:", worldid)

    const avlGenders: Gender[] = ["M", "F"]
    if (!gender) { return c.json({ error: 'Gender parameter is required in request body' }, 400) }
    if (!avlGenders.includes(gender)) { return c.json({ error: 'Invalid gender parameter, should be M/F' }, 400) }

    const profile = getProfile(userid)
    console.log("Profile found:", profile ? "Yes" : "No")
    if (!profile) {
        return c.json({ error: 'Profile not found' }, 404)
    }

    const result = setGender(userid, gender, worldid)
    if (!result) {
        return c.json({ error: 'Failed to set gender' }, 500)
    }

    return c.json({
        message: 'Gender set successfully',
        gender: gender,
        worldid: worldid || null
    })
})

etgl.get("/etgl/id-by-worldid/:worldid", async (c) => {
    const worldid = c.req.param('worldid')

    if (!worldid) {
        return c.json({ error: 'Worldid parameter is required' }, 400)
    }

    console.log("Looking up user ID for worldid:", worldid)

    try {
        // Search through all profiles to find matching worldid
        const profiles = await getAllProfiles()

        for (const [userid, profile] of Object.entries(profiles)) {
            if (profile.user?.worldid === worldid) {
                console.log(`Found user ID ${userid} for worldid ${worldid}`)
                return c.json({
                    userid: userid,
                    worldid: worldid,
                    profile: profile
                })
            }
        }

        // Also search URL-based profiles
        const urlProfiles = await getAllProfilesByUrl()

        for (const [url, profile] of Object.entries(urlProfiles)) {
            if (profile.user?.worldid === worldid) {
                console.log(`Found user in URL storage for worldid ${worldid}`)
                return c.json({
                    url: url,
                    worldid: worldid,
                    profile: profile
                })
            }
        }

        console.log(`No user found for worldid: ${worldid}`)
        return c.json({ error: 'User not found for the given worldid' }, 404)

    } catch (error) {
        console.error('Error looking up user by worldid:', error)
        return c.json({ error: 'Failed to lookup user by worldid' }, 500)
    }
})

// WebSocket management endpoints
etgl.get('/etgl/ws/status', async (c) => {
    return c.json({
        wsServer: wss ? 'running' : 'not initialized',
        connectedClients: wsClients.size,
        activeLocations: userLocations.size,
        selectedUsers: selectedUsers,
        port: 3002
    })
})

etgl.post('/etgl/ws/start', async (c) => {
    try {
        if (wss) {
            return c.json({
                message: 'WebSocket server already running (auto-initialized)',
                port: 3002,
                status: 'running',
                connectedClients: wsClients.size
            })
        }

        initializeWebSocketServer(3002)
        return c.json({
            message: 'WebSocket server manually started',
            port: 3002,
            status: 'running'
        })
    } catch (error) {
        console.error('Error starting WebSocket server:', error)
        return c.json({ error: 'Failed to start WebSocket server' }, 500)
    }
})

etgl.get('/etgl/ws/locations', async (c) => {
    const locations = Array.from(userLocations.values())
    return c.json({
        count: locations.length,
        locations: locations
    })
})

etgl.get('/etgl/ws/selected', async (c) => {
    return c.json(selectedUsers)
})

etgl.post('/etgl/ws/select-new', async (c) => {
    try {
        selectRandomUsers()
        return c.json({
            message: 'New users selected',
            selectedUsers: selectedUsers
        })
    } catch (error) {
        console.error('Error selecting new users:', error)
        return c.json({ error: 'Failed to select new users' }, 500)
    }
})

// Proximity verification endpoint
etgl.post('/etgl/verify-proximity/:userId/:targetUserId', async (c) => {
    const userId = c.req.param('userId')
    const targetUserId = c.req.param('targetUserId')

    const userLocation = userLocations.get(userId)
    const targetLocation = userLocations.get(targetUserId)

    if (!userLocation || !targetLocation) {
        return c.json({
            error: 'Location data not found for one or both users',
            verified: false
        }, 404)
    }

    const distance = calculateDistance(
        userLocation.coordinates.latitude,
        userLocation.coordinates.longitude,
        targetLocation.coordinates.latitude,
        targetLocation.coordinates.longitude
    )

    const isInProximity = distance <= 100 // 100 meters threshold

    return c.json({
        verified: isInProximity,
        distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
        threshold: 100,
        userLocation: userLocation.coordinates,
        targetLocation: targetLocation.coordinates
    })
})


export default etgl
export { initializeWebSocketServer }
