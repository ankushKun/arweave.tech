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

            let str = (scriptContent.split("6:")[1].slice(0, -1).replaceAll("\\", ""))
            str = str.slice(0, -1) + "}}}]"
            foundData = JSON.parse(str)[3]
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
