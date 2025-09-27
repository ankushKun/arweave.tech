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
                        avatar: rawUserData.user.avatar
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
