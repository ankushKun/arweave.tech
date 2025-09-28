# ETGL API Documentation

This document provides comprehensive documentation for the ETGL (ETHGlobal) API routes defined in `src/api/routes/etgl.ts`.

## Overview

The ETGL API provides endpoints for managing ETHGlobal user profiles, WebSocket connections for real-time location sharing, and proximity-based user interactions. The API includes caching mechanisms, background data refresh, and WebSocket support for real-time features.

## Base URL

All endpoints are prefixed with `/etgl`

## Authentication

The API uses cookie-based authentication via the `ETH_COOKIE` environment variable for ETHGlobal profile fetching.

## Data Types

### UserData
```typescript
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
        gender: "M" | "F" | null
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
```

### GPSCoordinates
```typescript
type GPSCoordinates = {
    latitude: number
    longitude: number
    accuracy?: number
    timestamp: number
}
```

### UserLocation
```typescript
type UserLocation = {
    userId: string
    coordinates: GPSCoordinates
    lastUpdated: number
}
```

### SelectedUsers
```typescript
type SelectedUsers = {
    male: string | null
    female: string | null
    selectedAt: number
}
```

## Profile Endpoints

### GET /etgl/profile/:id

Fetches a user profile by ETHGlobal user ID.

**Parameters:**
- `id` (path): ETHGlobal user ID

**Response:**
- `200`: Returns UserData object
- `404`: Profile not found

**Features:**
- Cache-first approach with background refresh
- Automatic caching of fetched profiles
- Background data synchronization

**Example:**
```bash
GET /etgl/profile/john-doe
```

**Response:**
```json
{
    "uuid": "user-uuid",
    "self": false,
    "attendeeTypes": ["hacker"],
    "user": {
        "uuid": "user-uuid",
        "name": "John Doe",
        "title": "Developer",
        "bio": "Full-stack developer",
        "avatar": {
            "fullUrl": "https://example.com/avatar.jpg"
        },
        "gender": "M"
    },
    "event": {
        "slug": "ethglobal-event",
        "name": "ETHGlobal Event",
        "status": "active"
    },
    "lastUpdated": "2025-09-27T10:00:00.000Z",
    "cached": true
}
```

### GET /etgl/profile

Fetches a user profile by ETHGlobal profile URL.

**Query Parameters:**
- `url` (required): URL-encoded ETHGlobal profile URL

**Response:**
- `200`: Returns UserData object
- `400`: Missing URL parameter
- `500`: Failed to fetch profile data

**Features:**
- Handles URL redirects automatically
- Dual caching (by URL and by extracted user ID)
- Background refresh mechanism

**Example:**
```bash
GET /etgl/profile?url=https%3A//ethglobal.com/connect/john-doe
```

### GET /etgl/profile-all

Retrieves all cached profiles.

**Query Parameters:**
- `type` (optional): Storage type to retrieve
  - `userid` (default): Profiles stored by user ID
  - `url`: Profiles stored by URL
  - `both`: Both storage types

**Response:**
- `200`: Returns profile collection based on type
- `500`: Failed to retrieve profiles

**Example:**
```bash
GET /etgl/profile-all?type=both
```

**Response:**
```json
{
    "type": "both",
    "userid_storage": {
        "count": 10,
        "profiles": { ... }
    },
    "url_storage": {
        "count": 5,
        "profiles": { ... }
    },
    "total_count": 15
}
```

### POST /etgl/set-gender/:id

Sets the gender for a specific user profile.

**Parameters:**
- `id` (path): User ID

**Query Parameters:**
- `gender` (required): Gender value (`M` or `F`)

**Response:**
- `200`: Gender set successfully
- `400`: Invalid or missing gender parameter
- `404`: Profile not found
- `500`: Failed to set gender

**Example:**
```bash
POST /etgl/set-gender/john-doe?gender=M
```

**Response:**
```json
{
    "message": "Gender set successfully"
}
```

## WebSocket Management Endpoints

### GET /etgl/ws/status

Returns the current status of the WebSocket server.

**Response:**
- `200`: WebSocket server status information

**Example Response:**
```json
{
    "wsServer": "running",
    "connectedClients": 5,
    "activeLocations": 3,
    "selectedUsers": {
        "male": "user-id-1",
        "female": "user-id-2",
        "selectedAt": 1695808800000
    },
    "port": 3002
}
```

### POST /etgl/ws/start

Manually starts the WebSocket server (if not already running).

**Response:**
- `200`: Server start status
- `500`: Failed to start server

**Example Response:**
```json
{
    "message": "WebSocket server manually started",
    "port": 3002,
    "status": "running"
}
```

### GET /etgl/ws/locations

Retrieves all active user locations.

**Response:**
- `200`: Array of user locations

**Example Response:**
```json
{
    "count": 3,
    "locations": [
        {
            "userId": "user-1",
            "coordinates": {
                "latitude": 40.7128,
                "longitude": -74.0060,
                "accuracy": 10,
                "timestamp": 1695808800000
            },
            "lastUpdated": 1695808800000
        }
    ]
}
```

### GET /etgl/ws/selected

Returns the currently selected users for the matching system.

**Response:**
- `200`: Selected users object

**Example Response:**
```json
{
    "male": "user-id-1",
    "female": "user-id-2",
    "selectedAt": 1695808800000
}
```

### POST /etgl/ws/select-new

Triggers selection of new random users for the matching system.

**Response:**
- `200`: New selection confirmation
- `500`: Failed to select new users

**Example Response:**
```json
{
    "message": "New users selected",
    "selectedUsers": {
        "male": "user-id-3",
        "female": "user-id-4",
        "selectedAt": 1695808900000
    }
}
```

## Proximity Verification Endpoint

### POST /etgl/verify-proximity/:userId/:targetUserId

Verifies if two users are within proximity (100 meters) of each other.

**Parameters:**
- `userId` (path): ID of the requesting user
- `targetUserId` (path): ID of the target user

**Response:**
- `200`: Proximity verification result
- `404`: Location data not found for one or both users

**Example:**
```bash
POST /etgl/verify-proximity/user-1/user-2
```

**Response:**
```json
{
    "verified": true,
    "distance": 85.5,
    "threshold": 100,
    "userLocation": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "accuracy": 10,
        "timestamp": 1695808800000
    },
    "targetLocation": {
        "latitude": 40.7130,
        "longitude": -74.0062,
        "accuracy": 15,
        "timestamp": 1695808800000
    }
}
```

### GET /etgl/target/:userId

Returns the coordinates and information for the opposite gender target assigned to the user.

**Parameters:**
- `userId` (path): ID of the requesting user

**Response:**
- `200`: Target information and coordinates
- `404`: User profile not found, no target selected, or target location unavailable

**Example:**
```bash
GET /etgl/target/user-123
```

**Response:**
```json
{
    "userGender": "M",
    "targetGender": "F",
    "targetUserId": "target-456",
    "targetProfile": {
        "name": "Jane Doe",
        "avatar": { "fullUrl": "..." },
        "bio": "Software developer"
    },
    "coordinates": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "accuracy": 10,
        "timestamp": 1695808800000
    },
    "lastUpdated": 1695808800000,
    "selectedAt": 1695808800000
}
```

### POST /etgl/scan-nfc

Processes NFC scan and increments points if the scanned user is the correct target.

**Request Body:**
```json
{
    "userId": "user-123",
    "scannedUrl": "https://ethglobal.com/connect/target-456"
}
```

**Response:**
- `200`: Points incremented successfully
- `400`: Invalid request, wrong target, or already scanned
- `404`: User profile not found or no target selected

**Success Response:**
```json
{
    "success": true,
    "message": "Points incremented successfully!",
    "userId": "user-123",
    "scannedTargetId": "target-456",
    "targetName": "Jane Doe",
    "pointsEarned": 1,
    "totalPoints": 5,
    "scannedTargets": 3
}
```

**Error Response:**
```json
{
    "success": false,
    "error": "Scanned user is not your current target",
    "scannedTargetId": "wrong-target",
    "expectedTargetId": "correct-target",
    "message": "You can only earn points by scanning your assigned target"
}
```

### GET /etgl/points/:userId

Retrieves the current points and scanning history for a user.

**Parameters:**
- `userId` (path): ID of the user

**Response:**
- `200`: User points information
- `400`: Missing user ID
- `500`: Server error

**Example:**
```bash
GET /etgl/points/user-123
```

**Response:**
```json
{
    "userId": "user-123",
    "userName": "John Doe",
    "points": 5,
    "scannedTargetsCount": 3,
    "scannedTargets": ["target-1", "target-2", "target-3"],
    "lastUpdated": 1695808800000
}
```

### GET /etgl/leaderboard

Returns the leaderboard showing all users ranked by points.

**Response:**
- `200`: Leaderboard data
- `500`: Server error

**Example:**
```bash
GET /etgl/leaderboard
```

**Response:**
```json
{
    "leaderboard": [
        {
            "userId": "user-123",
            "userName": "John Doe",
            "avatar": "https://...",
            "points": 10,
            "scannedTargetsCount": 5,
            "lastUpdated": 1695808800000
        },
        {
            "userId": "user-456",
            "userName": "Jane Smith",
            "avatar": "https://...",
            "points": 8,
            "scannedTargetsCount": 4,
            "lastUpdated": 1695808700000
        }
    ],
    "totalUsers": 2,
    "generatedAt": 1695808900000
}
```

## WebSocket API

The API includes a WebSocket server running on port 3002 for real-time features.

### WebSocket Message Types

#### GPS Update
```json
{
    "type": "gps_update",
    "userId": "user-id",
    "data": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "accuracy": 10,
        "timestamp": 1695808800000
    }
}
```

#### User Selection
```json
{
    "type": "user_selection",
    "userId": "selector-id",
    "data": {
        "selectedUserId": "target-id",
        "confirmed": true,
        "distance": 85.5
    }
}
```

#### Selected Users Broadcast
```json
{
    "type": "selected_users",
    "data": {
        "male": "user-id-1",
        "female": "user-id-2",
        "selectedAt": 1695808800000
    }
}
```

#### Ping/Pong
```json
{
    "type": "ping"
}
```

```json
{
    "type": "pong"
}
```

## Features

### Caching System
- Dual storage system (by user ID and by URL)
- Background refresh for cached data
- Automatic cache invalidation and updates
- Preserves manually set data (like gender) during updates

### Real-time Location Sharing
- WebSocket-based GPS coordinate sharing
- Automatic client cleanup for inactive connections
- Distance calculation using Haversine formula
- Proximity verification (100-meter threshold)

### User Matching System
- Automatic random user selection every 5 minutes
- Gender-based categorization
- Real-time broadcast of selected users
- Manual selection triggering

### Points and NFC System
- NFC scanning validation against selected targets
- Points increment system with duplicate prevention
- User points tracking and history
- Leaderboard functionality
- Gender-based target assignment

### Error Handling
- Comprehensive error responses
- Graceful fallbacks for missing data
- Background operation error logging
- WebSocket connection management

## Environment Variables

- `ETH_COOKIE`: Required for ETHGlobal profile authentication

## Storage Files

- `./etgl.json`: Profiles stored by user ID
- `./etgl-urls.json`: Profiles stored by URL
- `./etgl-points.json`: User points and scanning history

## WebSocket Server

- **Port**: 3002
- **Auto-initialization**: Server starts automatically when first endpoint is accessed
- **Cleanup**: Inactive clients removed every 60 seconds
- **Heartbeat**: Ping messages sent every 30 seconds
- **User Selection**: New users selected every hour
