import { Hono } from 'hono'
import axios from 'axios'
import * as Cheerio from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'

const cookie = process.env.ETH_COOKIE
const storage_path = "./etgl.json"
const url_storage_path = "./etgl-urls.json"

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

        // Add/update the profile data with timestamp
        profiles[key] = {
            ...data,
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
        } | null
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
async function fetchProfileData(url: string, userid: string): Promise<any | null> {
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
        scriptTags.each((index, element) => {
            const scriptContent = $(element).text()
            if (!scriptContent.includes("ETHGlobal New Delhi")) return

            try {
                // More careful extraction - find the JSON string boundaries
                const afterSplit = scriptContent.split("6:")[1]
                console.log("After split:", afterSplit.substring(0, 100) + "...")

                // Find the actual end of the JSON string
                // Look for patterns that indicate the end of the JSON array
                let str = afterSplit

                // Try to find the end more reliably by looking for }]}] pattern
                // which should be the end of the user object, then the main array
                const endPatterns = [
                    /}]}]\s*$/,  // Ends with }]}]
                    /}]}]\s*\n/,  // Ends with }]}] followed by newline
                    /}]}]\s*[,;]/,  // Ends with }]}] followed by comma or semicolon
                ]

                let endIndex = -1
                for (const pattern of endPatterns) {
                    const match = str.match(pattern)
                    if (match && match.index !== undefined) {
                        endIndex = match.index + match[0].indexOf('}]}]') + 4
                        break
                    }
                }

                if (endIndex !== -1) {
                    str = str.substring(0, endIndex)
                } else {
                    // If no clear pattern found, try to find the last complete "}]}]
                    const lastCompleteEnd = str.lastIndexOf('}]}]')
                    if (lastCompleteEnd !== -1) {
                        str = str.substring(0, lastCompleteEnd + 4)
                    } else {
                        // Final fallback - look for the last }] and add the missing ]
                        const lastBrace = str.lastIndexOf('}]')
                        if (lastBrace !== -1) {
                            str = str.substring(0, lastBrace + 2) + ']'
                        } else {
                            // Ultimate fallback to original method
                            str = str.slice(0, -1)
                        }
                    }
                }

                console.log("Raw extracted string:", str)

                // The string contains escaped JSON that needs to be properly decoded
                let parsedArray
                try {
                    // First try direct JSON.parse
                    parsedArray = JSON.parse(str)
                    console.log("Direct parse succeeded")
                } catch (directParseError) {
                    console.log("Direct parse failed, trying manual unescape method")
                    // Manually handle the escaped string
                    let cleanStr = str

                    // Remove outer quotes if present
                    if (cleanStr.startsWith('"') && cleanStr.endsWith('"')) {
                        cleanStr = cleanStr.slice(1, -1)
                    }

                    // Handle the trailing characters issue - remove various trailing patterns
                    if (cleanStr.endsWith(']\n"')) {
                        cleanStr = cleanStr.slice(0, -3)
                    } else if (cleanStr.endsWith(']\n')) {
                        cleanStr = cleanStr.slice(0, -2)
                    } else if (cleanStr.endsWith('"')) {
                        cleanStr = cleanStr.slice(0, -1)
                    }

                    // Also handle case where there might be extra characters after the main JSON
                    const jsonEndIndex = cleanStr.lastIndexOf('}]')
                    if (jsonEndIndex !== -1 && jsonEndIndex < cleanStr.length - 2) {
                        cleanStr = cleanStr.substring(0, jsonEndIndex + 2)
                    }

                    // Unescape the JSON string properly
                    cleanStr = cleanStr
                        .replace(/\\"/g, '"')           // Unescape quotes
                        .replace(/\\n/g, '\n')          // Unescape newlines
                        .replace(/\\r/g, '\r')          // Unescape carriage returns
                        .replace(/\\t/g, '\t')          // Unescape tabs
                        .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => {
                            return String.fromCharCode(parseInt(hex, 16))
                        })                              // Unescape unicode
                        .replace(/\\\\/g, '\\')         // Unescape backslashes (do this last)

                    console.log("Cleaned string:", cleanStr)

                    // Additional validation before parsing
                    if (!cleanStr.trim()) {
                        console.error("Cleaned string is empty")
                        return false
                    }

                    // Check if it looks like valid JSON structure
                    if (!cleanStr.startsWith('[') || !cleanStr.endsWith(']')) {
                        console.error("Cleaned string doesn't look like a JSON array:", cleanStr.substring(0, 100) + "...")
                        return false
                    }

                    try {
                        parsedArray = JSON.parse(cleanStr)
                    } catch {
                        parsedArray = JSON.parse(cleanStr.slice(0, -1) + "}}}]")
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
                            avatar: rawUserData.user.avatar
                        },
                        // Include additional event data that might be useful
                        event: rawUserData.event
                    }
                    console.log("Processed user data:", foundData)
                }
            } catch (parseError) {
                console.error("Error parsing JSON data:", parseError)
                // Log the error without referencing str since it might be out of scope
                console.error("Failed to parse extracted string")
            }

            return false // Break out of the loop
        })

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
        fetchProfileData(url, userid).then(freshData => {
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
                const freshData = await fetchProfileData(`https://ethglobal.com/connect/${id}`, id)

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

export default etgl
