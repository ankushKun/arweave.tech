import { Hono } from 'hono'
import axios from 'axios'
import * as Cheerio from 'cheerio'

const cookie = process.env.ETH_COOKIE

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

// Basic health check endpoints
etgl.get('/etgl/profile/:id', async (c) => {
    const userid = c.req.param('id')
    const url = `https://ethglobal.com/connect/${userid}`

    console.log("Fetching profile for", userid)

    try {
        //add cookie and fetch with axios, following redirects
        const response = await axios.get(url, {
            headers: {
                Cookie: cookie
            },
            maxRedirects: 5,
            timeout: 10000
        })

        const $ = Cheerio.load(response.data)
        const scriptTags = $('script')

        let foundData: UserData | null = null
        scriptTags.each((index, element) => {
            const scriptContent = $(element).text()
            if (!scriptContent.includes("ETHGlobal New Delhi")) return

            try {
                let str = (scriptContent.split("6:")[1].slice(0, -1))
                console.log("Raw extracted string:", str)

                // The string contains escaped JSON that needs to be properly decoded
                let parsedArray
                try {
                    // First try direct JSON.parse
                    parsedArray = JSON.parse(str)
                } catch (directParseError) {
                    console.log("Direct parse failed, trying manual unescape method")

                    // Manually handle the escaped string
                    // The string is wrapped in quotes and has escaped quotes inside
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
                    parsedArray = JSON.parse(cleanStr)
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
                // str is not available in this scope, so we'll log the error without it
                console.error("Failed to parse extracted string")
            }

            return false // Break out of the loop
        })

        if (foundData) {
            return c.json(foundData)
        } else {
            return c.json({ error: 'ETHGlobal New Delhi data not found' }, 404)
        }
    } catch (error) {
        console.error(error)
        return c.json({ error: 'Failed to fetch profile data' }, 500)
    }
})

etgl.get('/etgl/profile', async (c) => {
    const url = c.req.url.split("url=")[1]
    if (!url) {
        return c.json({ error: 'URL parameter is required' }, 400)
    }


    try {
        console.log("Fetching profile for", url)
        //add cookie and fetch with axios, following redirects
        const response = await axios.get(decodeURIComponent(url), {
            headers: {
                Cookie: cookie
            },
            maxRedirects: 5,
        })

        console.log("Redirecting to", response.request.path)
        const id = response.request.path.split("/")[2] as string

        // proxy /etgl/profile/:id
        return c.redirect(`./profile/${id}`)


    } catch (error) {
        console.error(error)
        return c.json({ error: 'Failed to fetch profile data' }, 500)
    }
})

export default etgl
