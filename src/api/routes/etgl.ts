import { Hono, Context } from 'hono'
import axios from 'axios'
import * as Cheerio from 'cheerio'
import * as fs from 'fs'
import * as path from 'path'
import WebSocket, { WebSocketServer } from 'ws'

// Comprehensive Logging Utility for WebSocket and API
enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

interface LogEntry {
    timestamp: string
    level: LogLevel
    category: string
    message: string
    data?: any
    clientId?: string
    userId?: string
    requestId?: string
    method?: string
    path?: string
    statusCode?: number
    duration?: number
    userAgent?: string
    ip?: string
}

class AppLogger {
    private static instance: AppLogger
    private logLevel: LogLevel = LogLevel.INFO
    private logs: LogEntry[] = []
    private maxLogs: number = 2000

    static getInstance(): AppLogger {
        if (!AppLogger.instance) {
            AppLogger.instance = new AppLogger()
        }
        return AppLogger.instance
    }

    setLogLevel(level: LogLevel) {
        this.logLevel = level
    }

    generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    }

    private log(
        level: LogLevel,
        category: string,
        message: string,
        data?: any,
        clientId?: string,
        userId?: string,
        requestId?: string,
        method?: string,
        path?: string,
        statusCode?: number,
        duration?: number,
        userAgent?: string,
        ip?: string
    ) {
        if (level < this.logLevel) return

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            data,
            clientId,
            userId,
            requestId,
            method,
            path,
            statusCode,
            duration,
            userAgent,
            ip
        }

        // Add to in-memory logs
        this.logs.push(entry)
        if (this.logs.length > this.maxLogs) {
            this.logs.shift() // Remove oldest log
        }

        // Console output with colors and enhanced formatting
        const levelStr = LogLevel[level]
        const timestamp = entry.timestamp

        // Determine prefix based on category
        const prefixType = category.startsWith('API') ? 'API' : 'WS'
        const prefix = `[${timestamp}] [${prefixType}-${levelStr}] [${category}]`

        const colorCode = {
            [LogLevel.DEBUG]: '\x1b[36m', // Cyan
            [LogLevel.INFO]: '\x1b[32m',  // Green
            [LogLevel.WARN]: '\x1b[33m',  // Yellow
            [LogLevel.ERROR]: '\x1b[31m'  // Red
        }[level]

        const resetCode = '\x1b[0m'

        // Enhanced console output with request details
        let logMessage = `${colorCode}${prefix}${resetCode} ${message}`

        if (method && path) {
            logMessage += ` ${method} ${path}`
        }

        if (statusCode) {
            const statusColor = statusCode >= 400 ? '\x1b[31m' : statusCode >= 300 ? '\x1b[33m' : '\x1b[32m'
            logMessage += ` ${statusColor}${statusCode}${resetCode}`
        }

        if (duration !== undefined) {
            const durationColor = duration > 1000 ? '\x1b[31m' : duration > 500 ? '\x1b[33m' : '\x1b[36m'
            logMessage += ` ${durationColor}${duration}ms${resetCode}`
        }

        if (requestId) {
            logMessage += ` [${requestId}]`
        }

        console.log(logMessage, data && Object.keys(data).length > 0 ? data : '')
    }

    // WebSocket logging methods
    debug(category: string, message: string, data?: any, clientId?: string, userId?: string) {
        this.log(LogLevel.DEBUG, category, message, data, clientId, userId)
    }

    info(category: string, message: string, data?: any, clientId?: string, userId?: string) {
        this.log(LogLevel.INFO, category, message, data, clientId, userId)
    }

    warn(category: string, message: string, data?: any, clientId?: string, userId?: string) {
        this.log(LogLevel.WARN, category, message, data, clientId, userId)
    }

    error(category: string, message: string, data?: any, clientId?: string, userId?: string) {
        this.log(LogLevel.ERROR, category, message, data, clientId, userId)
    }

    // API logging methods
    apiRequest(requestId: string, method: string, path: string, data?: any, userAgent?: string, ip?: string, userId?: string) {
        this.log(LogLevel.INFO, 'API_REQUEST', 'Incoming request', data, undefined, userId, requestId, method, path, undefined, undefined, userAgent, ip)
    }

    apiResponse(requestId: string, method: string, path: string, statusCode: number, duration: number, data?: any, userId?: string) {
        this.log(LogLevel.INFO, 'API_RESPONSE', 'Request completed', data, undefined, userId, requestId, method, path, statusCode, duration)
    }

    apiError(requestId: string, method: string, path: string, error: any, statusCode: number = 500, duration?: number, userId?: string) {
        this.log(LogLevel.ERROR, 'API_ERROR', 'Request failed', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
        }, undefined, userId, requestId, method, path, statusCode, duration)
    }

    apiDebug(requestId: string, method: string, path: string, message: string, data?: any, userId?: string) {
        this.log(LogLevel.DEBUG, 'API_DEBUG', message, data, undefined, userId, requestId, method, path)
    }

    apiWarn(requestId: string, method: string, path: string, message: string, data?: any, userId?: string) {
        this.log(LogLevel.WARN, 'API_WARNING', message, data, undefined, userId, requestId, method, path)
    }

    getLogs(category?: string, level?: LogLevel): LogEntry[] {
        return this.logs.filter(log => {
            if (category && log.category !== category) return false
            if (level !== undefined && log.level < level) return false
            return true
        })
    }

    getStats() {
        const stats = {
            totalLogs: this.logs.length,
            byLevel: {} as Record<string, number>,
            byCategory: {} as Record<string, number>,
            byMethod: {} as Record<string, number>,
            byStatusCode: {} as Record<string, number>,
            recentActivity: this.logs.slice(-10),
            averageResponseTime: 0,
            errorRate: 0
        }

        let totalDuration = 0
        let requestCount = 0
        let errorCount = 0

        this.logs.forEach(log => {
            const levelStr = LogLevel[log.level]
            stats.byLevel[levelStr] = (stats.byLevel[levelStr] || 0) + 1
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1

            if (log.method) {
                stats.byMethod[log.method] = (stats.byMethod[log.method] || 0) + 1
            }

            if (log.statusCode) {
                stats.byStatusCode[log.statusCode.toString()] = (stats.byStatusCode[log.statusCode.toString()] || 0) + 1
                if (log.statusCode >= 400) errorCount++
            }

            if (log.duration !== undefined) {
                totalDuration += log.duration
                requestCount++
            }
        })

        if (requestCount > 0) {
            stats.averageResponseTime = Math.round(totalDuration / requestCount)
            stats.errorRate = Math.round((errorCount / requestCount) * 100)
        }

        return stats
    }
}

const appLogger = AppLogger.getInstance()

// API Logging Middleware
interface RequestContext {
    requestId: string
    startTime: number
    method: string
    path: string
    userAgent?: string
    ip?: string
    userId?: string
}

function createApiLogger() {
    return async (c: Context, next: () => Promise<void>) => {
        const requestId = appLogger.generateRequestId()
        const startTime = Date.now()
        const method = c.req.method
        const path = c.req.path
        const userAgent = c.req.header('user-agent')
        const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'

        // Extract userId from path params if available
        let userId: string | undefined
        try {
            if (path.includes('/profile/')) {
                userId = c.req.param('id')
            } else if (path.includes('/target/')) {
                userId = c.req.param('worldid')
            } else if (path.includes('/points/')) {
                userId = c.req.param('userId')
            }
        } catch (e) {
            // Ignore param extraction errors
        }

        // Log incoming request
        try {
            appLogger.apiRequest(requestId, method, path, {}, userAgent, ip, userId)
        } catch (e) {
            console.log('Logging error:', e)
        }

        // Store context for response logging
        (c as any).set('requestContext', {
            requestId,
            startTime,
            method,
            path,
            userAgent,
            ip,
            userId
        } as RequestContext)

        try {
            await next()

            // Log successful response
            const context = (c as any).get('requestContext') as RequestContext
            const duration = Date.now() - context.startTime
            const status = c.res?.status || 200

            appLogger.apiResponse(context.requestId, context.method, context.path, status, duration, undefined, context.userId)
        } catch (error: any) {
            // Log error response
            const context = (c as any).get('requestContext') as RequestContext
            const duration = Date.now() - context.startTime
            const status = error?.status || 500

            appLogger.apiError(context.requestId, context.method, context.path, error, status, duration, context.userId)
            throw error
        }
    }
}

// Performance metrics tracking
interface PerformanceMetrics {
    messageCount: number
    lastMessageTime: number
    messagesPerMinute: number
    connectionCount: number
    locationUpdateCount: number
    userSelectionCount: number
    broadcastCount: number
}

const performanceMetrics: PerformanceMetrics = {
    messageCount: 0,
    lastMessageTime: 0,
    messagesPerMinute: 0,
    connectionCount: 0,
    locationUpdateCount: 0,
    userSelectionCount: 0,
    broadcastCount: 0
}

// Update performance metrics
function updatePerformanceMetrics(type: 'message' | 'connection' | 'location' | 'selection' | 'broadcast') {
    const now = Date.now()

    switch (type) {
        case 'message':
            performanceMetrics.messageCount++
            performanceMetrics.lastMessageTime = now
            break
        case 'connection':
            performanceMetrics.connectionCount++
            break
        case 'location':
            performanceMetrics.locationUpdateCount++
            break
        case 'selection':
            performanceMetrics.userSelectionCount++
            break
        case 'broadcast':
            performanceMetrics.broadcastCount++
            break
    }

    // Calculate messages per minute (simple rolling average)
    if (performanceMetrics.messageCount > 0 && performanceMetrics.lastMessageTime > 0) {
        const timeDiff = now - (performanceMetrics.lastMessageTime - (performanceMetrics.messageCount * 1000))
        if (timeDiff > 0) {
            performanceMetrics.messagesPerMinute = Math.round((performanceMetrics.messageCount * 60000) / timeDiff)
        }
    }
}

const cookie = process.env.ETH_COOKIE
const storage_path = "./etgl.json"
const url_storage_path = "./etgl-urls.json"
const points_storage_path = "./etgl-points.json"

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
    type: 'gps_update' | 'user_selection' | 'selected_users' | 'target_update' | 'ping' | 'pong'
    userId?: string
    data?: any
}

type SelectedUsers = {
    male: string | null
    female: string | null
    selectedAt: number
}

type UserPoints = {
    userId: string
    points: number
    lastUpdated: number
    scannedTargets: string[]  // Track which targets they've successfully scanned
}

type PointsStorage = {
    [userId: string]: UserPoints
}

// WebSocket connection management
const wsClients = new Map<WebSocket, { id: string, connectedAt: number, lastActivity: number }>()
const userLocations = new Map<string, UserLocation>()
let selectedUsers: SelectedUsers = {
    male: null,
    female: null,
    selectedAt: 0
}

// WebSocket server instance
let wss: WebSocketServer | null = null

// Generate unique client ID
function generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// WebSocket utility functions
function broadcastToClients(message: WSMessage) {
    const messageStr = JSON.stringify(message)
    let sentCount = 0
    let failedCount = 0

    updatePerformanceMetrics('broadcast')

    appLogger.debug('BROADCAST', `Broadcasting message type: ${message.type}`, {
        messageType: message.type,
        totalClients: wsClients.size
    })

    wsClients.forEach((clientInfo, client) => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(messageStr)
                sentCount++
                clientInfo.lastActivity = Date.now()
            } catch (error) {
                appLogger.error('BROADCAST', `Failed to send message to client ${clientInfo.id}`, {
                    error: error instanceof Error ? error.message : error,
                    messageType: message.type
                }, clientInfo.id)
                failedCount++
            }
        } else {
            appLogger.warn('BROADCAST', `Skipping inactive client ${clientInfo.id}`, {
                readyState: client.readyState,
                messageType: message.type
            }, clientInfo.id)
            failedCount++
        }
    })

    appLogger.info('BROADCAST', `Message broadcast completed`, {
        messageType: message.type,
        sentCount,
        failedCount,
        totalClients: wsClients.size,
        totalBroadcasts: performanceMetrics.broadcastCount
    })
}

function removeInactiveClients() {
    const initialCount = wsClients.size
    let removedCount = 0

    wsClients.forEach((clientInfo, client) => {
        if (client.readyState !== WebSocket.OPEN) {
            appLogger.info('CLEANUP', `Removing inactive client ${clientInfo.id}`, {
                readyState: client.readyState,
                connectedDuration: Date.now() - clientInfo.connectedAt,
                lastActivity: clientInfo.lastActivity
            }, clientInfo.id)
            wsClients.delete(client)
            removedCount++
        }
    })

    if (removedCount > 0) {
        appLogger.info('CLEANUP', `Cleanup completed`, {
            initialCount,
            removedCount,
            remainingCount: wsClients.size
        })
    }
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

// Points management functions
function loadPoints(): PointsStorage {
    try {
        if (!fs.existsSync(points_storage_path)) {
            return {}
        }

        const fileContent = fs.readFileSync(points_storage_path, 'utf8')
        if (!fileContent.trim()) {
            return {}
        }

        return JSON.parse(fileContent)
    } catch (error) {
        console.error('Error loading points:', error)
        return {}
    }
}

function savePoints(points: PointsStorage): void {
    try {
        fs.writeFileSync(points_storage_path, JSON.stringify(points, null, 2))
    } catch (error) {
        console.error('Error saving points:', error)
    }
}

function getUserPoints(userId: string): UserPoints {
    const points = loadPoints()
    return points[userId] || {
        userId: userId,
        points: 0,
        lastUpdated: Date.now(),
        scannedTargets: []
    }
}

function incrementUserPoints(userId: string, targetId: string): boolean {
    try {
        const points = loadPoints()
        const userPoints = points[userId] || {
            userId: userId,
            points: 0,
            lastUpdated: Date.now(),
            scannedTargets: []
        }

        // Check if user has already scanned this target
        if (userPoints.scannedTargets.includes(targetId)) {
            console.log(`User ${userId} has already scanned target ${targetId}`)
            return false
        }

        // Increment points and add target to scanned list
        userPoints.points += 1
        userPoints.scannedTargets.push(targetId)
        userPoints.lastUpdated = Date.now()

        points[userId] = userPoints
        savePoints(points)

        console.log(`Points incremented for user ${userId}: ${userPoints.points} points`)
        return true
    } catch (error) {
        console.error('Error incrementing points:', error)
        return false
    }
}

async function extractUserIdFromUrl(url: string): Promise<string | null> {
    try {
        // First try to extract from URL pattern (e.g., https://ethglobal.com/connect/userid)
        const urlMatch = url.match(/\/connect\/([^\/\?]+)/)
        if (urlMatch) {
            return urlMatch[1]
        }

        // If direct extraction fails, try to fetch and follow redirects
        const response = await axios.get(url, {
            headers: { Cookie: cookie },
            maxRedirects: 5,
        })

        const redirectedPath = response.request.path
        const pathMatch = redirectedPath.match(/\/connect\/([^\/\?]+)/)
        if (pathMatch) {
            return pathMatch[1]
        }

        return null
    } catch (error) {
        console.error('Error extracting user ID from URL:', error)
        return null
    }
}

async function selectRandomUsers() {
    try {
        appLogger.info('USER_SELECTION', 'Starting random user selection process')

        const profiles = await getAllProfiles()
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

        appLogger.debug('USER_SELECTION', 'User categorization completed', {
            totalProfiles: Object.keys(profiles).length,
            maleCount: maleUsers.length,
            femaleCount: femaleUsers.length
        })

        // Select random users
        const selectedMale = maleUsers.length > 0 ?
            maleUsers[Math.floor(Math.random() * maleUsers.length)] : null
        const selectedFemale = femaleUsers.length > 0 ?
            femaleUsers[Math.floor(Math.random() * femaleUsers.length)] : null

        const previousSelection = { ...selectedUsers }
        selectedUsers = {
            male: selectedMale,
            female: selectedFemale,
            selectedAt: Date.now()
        }

        appLogger.info('USER_SELECTION', 'New users selected', {
            previousMale: previousSelection.male,
            previousFemale: previousSelection.female,
            newMale: selectedMale,
            newFemale: selectedFemale,
            maleChanged: previousSelection.male !== selectedMale,
            femaleChanged: previousSelection.female !== selectedFemale
        })

        // Broadcast the selection to all clients
        broadcastToClients({
            type: 'selected_users',
            data: selectedUsers
        })

        // Also broadcast target location updates if locations are available
        if (selectedMale && userLocations.has(selectedMale)) {
            const maleLocation = userLocations.get(selectedMale)
            appLogger.debug('USER_SELECTION', `Broadcasting male target location update`, {
                userId: selectedMale,
                hasLocation: !!maleLocation
            }, undefined, selectedMale)

            broadcastToClients({
                type: 'target_update',
                userId: selectedMale,
                data: {
                    gender: 'M',
                    location: maleLocation
                }
            })
        }

        if (selectedFemale && userLocations.has(selectedFemale)) {
            const femaleLocation = userLocations.get(selectedFemale)
            appLogger.debug('USER_SELECTION', `Broadcasting female target location update`, {
                userId: selectedFemale,
                hasLocation: !!femaleLocation
            }, undefined, selectedFemale)

            broadcastToClients({
                type: 'target_update',
                userId: selectedFemale,
                data: {
                    gender: 'F',
                    location: femaleLocation
                }
            })
        }

        appLogger.info('USER_SELECTION', 'User selection process completed successfully')
    } catch (error) {
        appLogger.error('USER_SELECTION', 'Error during user selection process', {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined
        })
    }
}

// Initialize WebSocket server
function initializeWebSocketServer(port: number = 3002) {
    if (wss) {
        appLogger.warn('SERVER', 'WebSocket server already initialized', { port })
        return wss
    }

    appLogger.info('SERVER', 'Initializing WebSocket server', { port })

    try {
        wss = new WebSocketServer({ port })

        wss.on('connection', (ws: WebSocket, request) => {
            const clientId = generateClientId()
            const clientInfo = {
                id: clientId,
                connectedAt: Date.now(),
                lastActivity: Date.now()
            }

            wsClients.set(ws, clientInfo)
            updatePerformanceMetrics('connection')

            appLogger.info('CONNECTION', 'New WebSocket connection established', {
                clientId,
                totalClients: wsClients.size,
                totalConnections: performanceMetrics.connectionCount,
                userAgent: request.headers['user-agent'],
                origin: request.headers.origin,
                remoteAddress: request.socket.remoteAddress
            }, clientId)

            // Send current selected users to new client
            try {
                const selectedUsersMessage = JSON.stringify({
                    type: 'selected_users',
                    data: selectedUsers
                })
                ws.send(selectedUsersMessage)
                appLogger.debug('CONNECTION', 'Sent initial selected users data to new client', {
                    selectedUsers
                }, clientId)
            } catch (error) {
                appLogger.error('CONNECTION', 'Failed to send initial selected users data', {
                    error: error instanceof Error ? error.message : error
                }, clientId)
            }

            // Send current user locations to new client
            try {
                const locationData = Array.from(userLocations.values())
                const locationMessage = JSON.stringify({
                    type: 'gps_update',
                    data: locationData
                })
                ws.send(locationMessage)
                appLogger.debug('CONNECTION', 'Sent initial location data to new client', {
                    locationCount: locationData.length
                }, clientId)
            } catch (error) {
                appLogger.error('CONNECTION', 'Failed to send initial location data', {
                    error: error instanceof Error ? error.message : error
                }, clientId)
            }

            ws.on('message', (message: string) => {
                try {
                    clientInfo.lastActivity = Date.now()
                    updatePerformanceMetrics('message')

                    const wsMessage: WSMessage = JSON.parse(message)
                    appLogger.debug('MESSAGE_IN', `Received message: ${wsMessage.type}`, {
                        messageType: wsMessage.type,
                        userId: wsMessage.userId,
                        hasData: !!wsMessage.data,
                        totalMessages: performanceMetrics.messageCount,
                        messagesPerMinute: performanceMetrics.messagesPerMinute
                    }, clientId, wsMessage.userId)

                    handleWebSocketMessage(ws, wsMessage, clientId)
                } catch (error) {
                    appLogger.error('MESSAGE_IN', 'Error parsing WebSocket message', {
                        error: error instanceof Error ? error.message : error,
                        rawMessage: message.substring(0, 200) // Truncate for logging
                    }, clientId)
                }
            })

            ws.on('close', (code, reason) => {
                const connectionDuration = Date.now() - clientInfo.connectedAt
                appLogger.info('CONNECTION', 'WebSocket connection closed', {
                    clientId,
                    closeCode: code,
                    closeReason: reason?.toString(),
                    connectionDuration,
                    remainingClients: wsClients.size - 1
                }, clientId)
                wsClients.delete(ws)
            })

            ws.on('error', (error) => {
                const connectionDuration = Date.now() - clientInfo.connectedAt
                appLogger.error('CONNECTION', 'WebSocket connection error', {
                    clientId,
                    error: error.message,
                    connectionDuration,
                    remainingClients: wsClients.size - 1
                }, clientId)
                wsClients.delete(ws)
            })

            // Send ping every 30 seconds to keep connection alive
            const pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    try {
                        ws.send(JSON.stringify({ type: 'ping' }))
                        appLogger.debug('HEARTBEAT', 'Sent ping to client', {}, clientId)
                    } catch (error) {
                        appLogger.error('HEARTBEAT', 'Failed to send ping', {
                            error: error instanceof Error ? error.message : error
                        }, clientId)
                        clearInterval(pingInterval)
                    }
                } else {
                    appLogger.debug('HEARTBEAT', 'Clearing ping interval for inactive client', {
                        readyState: ws.readyState
                    }, clientId)
                    clearInterval(pingInterval)
                }
            }, 30000)
        })

        wss.on('error', (error) => {
            appLogger.error('SERVER', 'WebSocket server error', {
                error: error.message,
                port
            })
        })

        appLogger.info('SERVER', 'WebSocket server started successfully', {
            port,
            timestamp: new Date().toISOString()
        })

        // Clean up inactive clients every minute
        setInterval(() => {
            appLogger.debug('MAINTENANCE', 'Running periodic client cleanup')
            removeInactiveClients()
        }, 60000)

        // Select new users every 5 minutes
        setInterval(() => {
            appLogger.debug('MAINTENANCE', 'Running periodic user selection')
            selectRandomUsers()
        }, 5 * 60 * 1000)

        // Initial user selection
        setTimeout(() => {
            appLogger.info('MAINTENANCE', 'Running initial user selection')
            selectRandomUsers()
        }, 5000) // Wait 5 seconds for profiles to load

        return wss
    } catch (error) {
        appLogger.error('SERVER', 'Failed to initialize WebSocket server', {
            error: error instanceof Error ? error.message : error,
            port
        })
        throw error
    }
}

function handleWebSocketMessage(ws: WebSocket, message: WSMessage, clientId: string) {
    switch (message.type) {
        case 'gps_update':
            if (message.userId && message.data) {
                const userLocation: UserLocation = {
                    userId: message.userId,
                    coordinates: message.data,
                    lastUpdated: Date.now()
                }

                const previousLocation = userLocations.get(message.userId)
                userLocations.set(message.userId, userLocation)
                updatePerformanceMetrics('location')

                appLogger.info('GPS_UPDATE', 'Location updated for user', {
                    userId: message.userId,
                    coordinates: message.data,
                    hadPreviousLocation: !!previousLocation,
                    totalLocations: userLocations.size,
                    totalLocationUpdates: performanceMetrics.locationUpdateCount
                }, clientId, message.userId)

                // Broadcast location update to all other clients
                broadcastToClients({
                    type: 'gps_update',
                    userId: message.userId,
                    data: userLocation
                })

                // If this user is a selected target, also broadcast target update
                if (message.userId && (message.userId === selectedUsers.male || message.userId === selectedUsers.female)) {
                    appLogger.debug('GPS_UPDATE', 'User is a selected target, broadcasting target update', {
                        userId: message.userId,
                        isSelectedMale: message.userId === selectedUsers.male,
                        isSelectedFemale: message.userId === selectedUsers.female
                    }, clientId, message.userId)

                    getAllProfiles().then(profiles => {
                        const userProfile = profiles[message.userId!]
                        const gender = userProfile?.user?.gender

                        broadcastToClients({
                            type: 'target_update',
                            userId: message.userId!,
                            data: {
                                gender: gender,
                                location: userLocation
                            }
                        })
                    }).catch(error => {
                        appLogger.error('GPS_UPDATE', 'Error getting profiles for target update', {
                            error: error instanceof Error ? error.message : error,
                            userId: message.userId
                        }, clientId, message.userId)
                    })
                }
            } else {
                appLogger.warn('GPS_UPDATE', 'Invalid GPS update message - missing userId or data', {
                    hasUserId: !!message.userId,
                    hasData: !!message.data
                }, clientId, message.userId)
            }
            break

        case 'user_selection':
            if (message.userId && message.data?.selectedUserId) {
                updatePerformanceMetrics('selection')

                appLogger.info('USER_SELECTION', 'User selection attempt', {
                    selectorId: message.userId,
                    selectedUserId: message.data.selectedUserId,
                    totalSelections: performanceMetrics.userSelectionCount
                }, clientId, message.userId)

                // Verify proximity before confirming selection
                const selectorLocation = userLocations.get(message.userId)
                const selectedLocation = userLocations.get(message.data.selectedUserId)

                if (!selectorLocation || !selectedLocation) {
                    appLogger.warn('USER_SELECTION', 'Location data missing for proximity verification', {
                        selectorId: message.userId,
                        selectedUserId: message.data.selectedUserId,
                        hasSelectorLocation: !!selectorLocation,
                        hasSelectedLocation: !!selectedLocation
                    }, clientId, message.userId)
                    return
                }

                const distance = calculateDistance(
                    selectorLocation.coordinates.latitude,
                    selectorLocation.coordinates.longitude,
                    selectedLocation.coordinates.latitude,
                    selectedLocation.coordinates.longitude
                )

                appLogger.debug('USER_SELECTION', 'Proximity calculated', {
                    selectorId: message.userId,
                    selectedUserId: message.data.selectedUserId,
                    distance: distance,
                    threshold: 100
                }, clientId, message.userId)

                // Allow selection if users are within 100 meters
                if (distance <= 100) {
                    appLogger.info('USER_SELECTION', 'User selection confirmed - within proximity', {
                        selectorId: message.userId,
                        selectedUserId: message.data.selectedUserId,
                        distance: distance.toFixed(2)
                    }, clientId, message.userId)

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
                    appLogger.warn('USER_SELECTION', 'User selection rejected - too far away', {
                        selectorId: message.userId,
                        selectedUserId: message.data.selectedUserId,
                        distance: distance.toFixed(2),
                        threshold: 100
                    }, clientId, message.userId)

                    // Send rejection back to selector
                    try {
                        ws.send(JSON.stringify({
                            type: 'user_selection',
                            data: {
                                selectedUserId: message.data.selectedUserId,
                                confirmed: false,
                                reason: 'Too far away',
                                distance: distance
                            }
                        }))
                    } catch (error) {
                        appLogger.error('USER_SELECTION', 'Failed to send rejection message', {
                            error: error instanceof Error ? error.message : error
                        }, clientId, message.userId)
                    }
                }
            } else {
                appLogger.warn('USER_SELECTION', 'Invalid user selection message - missing userId or selectedUserId', {
                    hasUserId: !!message.userId,
                    hasSelectedUserId: !!message.data?.selectedUserId
                }, clientId, message.userId)
            }
            break

        case 'pong':
            appLogger.debug('HEARTBEAT', 'Received pong from client', {}, clientId, message.userId)
            break

        default:
            appLogger.warn('MESSAGE_IN', 'Unknown message type received', {
                messageType: message.type,
                userId: message.userId
            }, clientId, message.userId)
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

// Apply logging middleware to all routes
etgl.use('*', createApiLogger())

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

// Profile endpoints with enhanced logging
etgl.get('/etgl/profile/:id', async (c) => {
    const context = (c as any).get('requestContext') as RequestContext
    const userid = c.req.param('id')
    const url = `https://ethglobal.com/connect/${userid}`

    appLogger.apiDebug(context.requestId, context.method, context.path, "Fetching profile", { userid })

    try {
        // Check cache first
        const cachedProfile = getProfile(userid)
        if (cachedProfile) {
            appLogger.apiDebug(context.requestId, context.method, context.path, "Returning cached profile", {
                userid,
                cacheHit: true,
                lastUpdated: cachedProfile.lastUpdated
            })

            // Start background refresh (don't await)
            fetchProfileData(url, userid, cachedProfile).then(freshData => {
                if (freshData) {
                    appLogger.apiDebug(context.requestId, context.method, context.path, "Background refresh completed", { userid })
                    saveProfile(userid, freshData)
                } else {
                    appLogger.apiWarn(context.requestId, context.method, context.path, "Background refresh failed", { userid })
                }
            }).catch(error => {
                appLogger.apiError(context.requestId, context.method, context.path, error, 500, undefined, userid)
            })

            return c.json(cachedProfile)
        }

        // No cache found, fetch fresh data
        appLogger.apiDebug(context.requestId, context.method, context.path, "Cache miss, fetching fresh data", { userid })
        const freshData = await fetchProfileData(url, userid)

        if (freshData) {
            // Save to cache
            saveProfile(userid, freshData)
            appLogger.apiDebug(context.requestId, context.method, context.path, "Fresh data retrieved and cached", { userid })
            return c.json(freshData)
        } else {
            appLogger.apiWarn(context.requestId, context.method, context.path, "Profile data not found", { userid })
            return c.json({ error: 'ETHGlobal New Delhi data not found' }, 404)
        }
    } catch (error) {
        appLogger.apiError(context.requestId, context.method, context.path, error, 500, undefined, userid)
        return c.json({ error: 'Failed to fetch profile data' }, 500)
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
    const context = (c as any).get('requestContext') as RequestContext
    const userid = c.req.param('id')

    try {
        // Get data from request body
        let requestData
        try {
            requestData = await c.req.json()
        } catch (error) {
            appLogger.apiWarn(context.requestId, context.method, context.path, "Invalid JSON in request body", { userid })
            return c.json({ error: 'Invalid JSON in request body' }, 400)
        }

        const gender = requestData.gender as Gender
        const worldid = requestData.worldid as string

        appLogger.apiDebug(context.requestId, context.method, context.path, "Setting gender", {
            userid,
            gender,
            hasWorldid: !!worldid
        })

        const avlGenders: Gender[] = ["M", "F"]
        if (!gender) {
            appLogger.apiWarn(context.requestId, context.method, context.path, "Missing gender parameter", { userid })
            return c.json({ error: 'Gender parameter is required in request body' }, 400)
        }
        if (!avlGenders.includes(gender)) {
            appLogger.apiWarn(context.requestId, context.method, context.path, "Invalid gender parameter", { userid, gender })
            return c.json({ error: 'Invalid gender parameter, should be M/F' }, 400)
        }

        const profile = getProfile(userid)
        appLogger.apiDebug(context.requestId, context.method, context.path, "Profile lookup", {
            userid,
            profileFound: !!profile
        })

        if (!profile) {
            appLogger.apiWarn(context.requestId, context.method, context.path, "Profile not found", { userid })
            return c.json({ error: 'Profile not found' }, 404)
        }

        const result = setGender(userid, gender, worldid)
        if (!result) {
            appLogger.apiError(context.requestId, context.method, context.path, "Failed to set gender", 500, undefined, userid)
            return c.json({ error: 'Failed to set gender' }, 500)
        }

        appLogger.apiDebug(context.requestId, context.method, context.path, "Gender set successfully", {
            userid,
            gender,
            worldid: worldid || null
        })

        return c.json({
            message: 'Gender set successfully',
            gender: gender,
            worldid: worldid || null
        })
    } catch (error) {
        appLogger.apiError(context.requestId, context.method, context.path, error, 500, undefined, userid)
        return c.json({ error: 'Failed to set gender' }, 500)
    }
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
    const now = Date.now()
    const clientStats = Array.from(wsClients.values()).map(client => ({
        id: client.id,
        connectedAt: client.connectedAt,
        lastActivity: client.lastActivity,
        connectionDuration: now - client.connectedAt,
        idleDuration: now - client.lastActivity
    }))

    return c.json({
        server: {
            status: wss ? 'running' : 'not initialized',
            port: 3002,
            uptime: wss ? now - (clientStats[0]?.connectedAt || now) : 0
        },
        connections: {
            total: wsClients.size,
            clients: clientStats
        },
        locations: {
            active: userLocations.size,
            users: Array.from(userLocations.keys())
        },
        selectedUsers: selectedUsers,
        performance: performanceMetrics,
        logging: {
            totalLogs: appLogger.getLogs().length,
            logStats: appLogger.getStats()
        },
        api: {
            totalRequests: appLogger.getStats().byCategory['API_REQUEST'] || 0,
            totalErrors: appLogger.getStats().byCategory['API_ERROR'] || 0,
            averageResponseTime: appLogger.getStats().averageResponseTime,
            errorRate: appLogger.getStats().errorRate
        }
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
    const context = (c as any).get('requestContext') as RequestContext

    try {
        appLogger.apiDebug(context.requestId, context.method, context.path, "Manual user selection triggered")
        selectRandomUsers()

        appLogger.apiDebug(context.requestId, context.method, context.path, "User selection completed", {
            selectedMale: selectedUsers.male,
            selectedFemale: selectedUsers.female
        })

        return c.json({
            message: 'New users selected',
            selectedUsers: selectedUsers
        })
    } catch (error) {
        appLogger.apiError(context.requestId, context.method, context.path, error, 500)
        return c.json({ error: 'Failed to select new users' }, 500)
    }
})

// Comprehensive Logging endpoints
etgl.get('/etgl/logs', async (c) => {
    const context = (c as any).get('requestContext') as RequestContext

    try {
        const category = c.req.query('category')
        const level = c.req.query('level')
        const limit = parseInt(c.req.query('limit') || '100')

        appLogger.apiDebug(context.requestId, context.method, context.path, "Retrieving logs", {
            category: category || 'all',
            level: level || 'all',
            limit
        })

        let logs = appLogger.getLogs(category, level ? parseInt(level) : undefined)

        // Apply limit
        if (limit > 0) {
            logs = logs.slice(-limit)
        }

        return c.json({
            logs: logs,
            total: logs.length,
            filters: {
                category: category || 'all',
                level: level || 'all',
                limit: limit
            },
            stats: appLogger.getStats()
        })
    } catch (error) {
        appLogger.apiError(context.requestId, context.method, context.path, error, 500)
        return c.json({ error: 'Failed to retrieve logs' }, 500)
    }
})

// Legacy WebSocket logs endpoint (for backward compatibility)
etgl.get('/etgl/ws/logs', async (c) => {
    return c.redirect('/etgl/logs?category=BROADCAST,CONNECTION,GPS_UPDATE,USER_SELECTION,HEARTBEAT,MESSAGE_IN,CLEANUP,MAINTENANCE,SERVER')
})

etgl.get('/etgl/ws/logs/stats', async (c) => {
    try {
        return c.json(appLogger.getStats())
    } catch (error) {
        return c.json({ error: 'Failed to retrieve log stats' }, 500)
    }
})

etgl.post('/etgl/logs/level', async (c) => {
    const context = (c as any).get('requestContext') as RequestContext

    try {
        const { level } = await c.req.json()

        if (typeof level !== 'number' || level < 0 || level > 3) {
            appLogger.apiWarn(context.requestId, context.method, context.path, "Invalid log level provided", { level })
            return c.json({ error: 'Invalid log level. Must be 0 (DEBUG), 1 (INFO), 2 (WARN), or 3 (ERROR)' }, 400)
        }

        const previousLevel = appLogger['logLevel']
        appLogger.setLogLevel(level)
        appLogger.info('API_CONFIG', `Log level changed from ${LogLevel[previousLevel]} to ${LogLevel[level]}`, {
            previousLevel,
            newLevel: level,
            requestId: context.requestId
        })

        return c.json({
            message: 'Log level updated successfully',
            previousLevel,
            newLevel: level,
            levelName: LogLevel[level]
        })
    } catch (error) {
        appLogger.apiError(context.requestId, context.method, context.path, error, 500)
        return c.json({ error: 'Failed to update log level' }, 500)
    }
})

// Legacy endpoint for backward compatibility
etgl.post('/etgl/ws/logs/level', async (c) => {
    return c.redirect('/etgl/logs/level', 307) // Temporary redirect with method preservation
})

etgl.get('/etgl/metrics', async (c) => {
    const context = (c as any).get('requestContext') as RequestContext

    try {
        const now = Date.now()
        const uptime = wss ? now - performanceMetrics.lastMessageTime : 0
        const stats = appLogger.getStats()

        appLogger.apiDebug(context.requestId, context.method, context.path, "Retrieving comprehensive metrics")

        return c.json({
            websocket: {
                performance: performanceMetrics,
                realtime: {
                    activeConnections: wsClients.size,
                    activeLocations: userLocations.size,
                    serverUptime: uptime,
                    timestamp: now
                },
                rates: {
                    messagesPerMinute: performanceMetrics.messagesPerMinute,
                    connectionsPerHour: Math.round((performanceMetrics.connectionCount * 3600000) / Math.max(uptime, 1)),
                    locationsPerMinute: Math.round((performanceMetrics.locationUpdateCount * 60000) / Math.max(uptime, 1))
                }
            },
            api: {
                requests: {
                    total: stats.byCategory['API_REQUEST'] || 0,
                    errors: stats.byCategory['API_ERROR'] || 0,
                    warnings: stats.byCategory['API_WARNING'] || 0,
                    debug: stats.byCategory['API_DEBUG'] || 0
                },
                performance: {
                    averageResponseTime: stats.averageResponseTime,
                    errorRate: stats.errorRate
                },
                methods: stats.byMethod,
                statusCodes: stats.byStatusCode
            },
            logging: {
                totalLogs: stats.totalLogs,
                byLevel: stats.byLevel,
                byCategory: stats.byCategory,
                recentActivity: stats.recentActivity
            },
            system: {
                timestamp: now,
                uptime: uptime,
                logLevel: LogLevel[appLogger['logLevel']]
            }
        })
    } catch (error) {
        appLogger.apiError(context.requestId, context.method, context.path, error, 500)
        return c.json({ error: 'Failed to retrieve metrics' }, 500)
    }
})

// Legacy WebSocket metrics endpoint
etgl.get('/etgl/ws/metrics', async (c) => {
    return c.redirect('/etgl/metrics')
})

// Target endpoint - returns coordinates for opposite gender (using worldid)
etgl.get('/etgl/target/:worldid', async (c) => {
    const worldid = c.req.param('worldid')

    if (!worldid) {
        return c.json({ error: 'World ID parameter is required' }, 400)
    }

    try {
        // Find user by worldid
        const profiles = await getAllProfiles()
        let userProfile = null
        let userId = null

        // Search through all profiles to find matching worldid
        for (const [id, profile] of Object.entries(profiles)) {
            if (profile.user?.worldid === worldid) {
                userProfile = profile
                userId = id
                break
            }
        }

        // Also search URL-based profiles if not found
        if (!userProfile) {
            const urlProfiles = await getAllProfilesByUrl()
            for (const [url, profile] of Object.entries(urlProfiles)) {
                if (profile.user?.worldid === worldid) {
                    userProfile = profile
                    userId = url // Use URL as identifier for URL-based profiles
                    break
                }
            }
        }

        if (!userProfile || !userProfile.user?.gender) {
            return c.json({
                error: 'User profile or gender not found for the given worldid',
                worldid: worldid
            }, 404)
        }

        const userGender = userProfile.user.gender
        const oppositeGender = userGender === 'M' ? 'F' : 'M'

        // Get the selected target of opposite gender
        const targetUserId = oppositeGender === 'M' ? selectedUsers.male : selectedUsers.female

        if (!targetUserId) {
            return c.json({
                error: `No ${oppositeGender === 'M' ? 'male' : 'female'} target currently selected`,
                worldid: worldid,
                userGender: userGender,
                oppositeGender: oppositeGender,
                selectedUsers: selectedUsers
            }, 404)
        }

        // Get target's location
        const targetLocation = userLocations.get(targetUserId)

        if (!targetLocation) {
            return c.json({
                error: 'Target location not available',
                worldid: worldid,
                targetUserId: targetUserId,
                message: 'Target user has not shared their location yet'
            }, 404)
        }

        // Get target's profile for additional info
        const targetProfile = profiles[targetUserId]

        return c.json({
            worldid: worldid,
            userId: userId,
            userGender: userGender,
            targetGender: oppositeGender,
            targetUserId: targetUserId,
            targetProfile: targetProfile ? {
                name: targetProfile.user?.name,
                avatar: targetProfile.user?.avatar,
                bio: targetProfile.user?.bio
            } : null,
            coordinates: targetLocation.coordinates,
            lastUpdated: targetLocation.lastUpdated,
            selectedAt: selectedUsers.selectedAt
        })
    } catch (error) {
        console.error('Error in target endpoint:', error)
        return c.json({ error: 'Failed to get target information' }, 500)
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

// NFC Scan endpoint - increments points for scanning correct target (using worldid)
etgl.post('/etgl/scan-nfc', async (c) => {
    try {
        const requestData = await c.req.json()
        const { worldid, scannedUrl } = requestData

        if (!worldid || !scannedUrl) {
            return c.json({
                error: 'Both worldid and scannedUrl are required',
                received: { worldid, scannedUrl }
            }, 400)
        }

        console.log(`NFC scan attempt: User with worldid ${worldid} scanned ${scannedUrl}`)

        // Find user by worldid
        const profiles = await getAllProfiles()
        let userProfile = null
        let userId = null

        // Search through all profiles to find matching worldid
        for (const [id, profile] of Object.entries(profiles)) {
            if (profile.user?.worldid === worldid) {
                userProfile = profile
                userId = id
                break
            }
        }

        // Also search URL-based profiles if not found
        if (!userProfile) {
            const urlProfiles = await getAllProfilesByUrl()
            for (const [url, profile] of Object.entries(urlProfiles)) {
                if (profile.user?.worldid === worldid) {
                    userProfile = profile
                    userId = url // Use URL as identifier for URL-based profiles
                    break
                }
            }
        }

        if (!userProfile || !userProfile.user?.gender) {
            return c.json({
                error: 'User profile or gender not found for the given worldid',
                worldid: worldid
            }, 404)
        }

        // Extract the target user ID from the scanned URL
        const scannedTargetId = await extractUserIdFromUrl(scannedUrl)
        if (!scannedTargetId) {
            return c.json({
                error: 'Could not extract user ID from scanned URL',
                scannedUrl: scannedUrl
            }, 400)
        }

        console.log(`Extracted target ID: ${scannedTargetId}`)

        const userGender = userProfile.user.gender
        const oppositeGender = userGender === 'M' ? 'F' : 'M'

        // Get the current selected target of opposite gender
        const expectedTargetId = oppositeGender === 'M' ? selectedUsers.male : selectedUsers.female

        if (!expectedTargetId) {
            return c.json({
                error: `No ${oppositeGender === 'M' ? 'male' : 'female'} target currently selected`,
                worldid: worldid,
                userGender: userGender,
                oppositeGender: oppositeGender
            }, 404)
        }

        // Check if the scanned target matches the expected target
        if (scannedTargetId !== expectedTargetId) {
            return c.json({
                success: false,
                error: 'Scanned user is not your current target',
                worldid: worldid,
                scannedTargetId: scannedTargetId,
                expectedTargetId: expectedTargetId,
                message: 'You can only earn points by scanning your assigned target'
            }, 400)
        }

        // Attempt to increment points (still using userId internally for points storage)
        const pointsIncremented = incrementUserPoints(userId!, scannedTargetId)

        if (!pointsIncremented) {
            return c.json({
                success: false,
                error: 'Points not incremented',
                reason: 'You have already scanned this target',
                worldid: worldid,
                scannedTargetId: scannedTargetId
            }, 400)
        }

        // Get updated user points
        const updatedPoints = getUserPoints(userId!)

        // Get target profile info
        const targetProfile = profiles[scannedTargetId]

        return c.json({
            success: true,
            message: 'Points incremented successfully!',
            worldid: worldid,
            userId: userId,
            scannedTargetId: scannedTargetId,
            targetName: targetProfile?.user?.name || 'Unknown',
            pointsEarned: 1,
            totalPoints: updatedPoints.points,
            scannedTargets: updatedPoints.scannedTargets.length
        })

    } catch (error) {
        console.error('Error in NFC scan endpoint:', error)
        return c.json({
            error: 'Failed to process NFC scan',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 500)
    }
})

// Get user points endpoint
etgl.get('/etgl/points/:userId', async (c) => {
    const userId = c.req.param('userId')

    if (!userId) {
        return c.json({ error: 'User ID parameter is required' }, 400)
    }

    try {
        const userPoints = getUserPoints(userId)
        const profiles = await getAllProfiles()
        const userProfile = profiles[userId]

        return c.json({
            userId: userId,
            userName: userProfile?.user?.name || 'Unknown',
            points: userPoints.points,
            scannedTargetsCount: userPoints.scannedTargets.length,
            scannedTargets: userPoints.scannedTargets,
            lastUpdated: userPoints.lastUpdated
        })
    } catch (error) {
        console.error('Error getting user points:', error)
        return c.json({ error: 'Failed to get user points' }, 500)
    }
})

// Get leaderboard endpoint
etgl.get('/etgl/leaderboard', async (c) => {
    try {
        const points = loadPoints()
        const profiles = await getAllProfiles()

        // Convert points to array and sort by points descending
        const leaderboard = Object.values(points)
            .sort((a, b) => b.points - a.points)
            .map(userPoints => {
                const profile = profiles[userPoints.userId]
                return {
                    userId: userPoints.userId,
                    userName: profile?.user?.name || 'Unknown',
                    avatar: profile?.user?.avatar?.fullUrl || null,
                    points: userPoints.points,
                    scannedTargetsCount: userPoints.scannedTargets.length,
                    lastUpdated: userPoints.lastUpdated
                }
            })

        return c.json({
            leaderboard: leaderboard,
            totalUsers: leaderboard.length,
            generatedAt: Date.now()
        })
    } catch (error) {
        console.error('Error getting leaderboard:', error)
        return c.json({ error: 'Failed to get leaderboard' }, 500)
    }
})

export default etgl
export { initializeWebSocketServer }
