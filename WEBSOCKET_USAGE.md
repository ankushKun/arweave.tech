# WebSocket GPS Coordinate Sharing

This implementation provides real-time GPS coordinate sharing functionality for the ETHGlobal application.

## Features

- **Real-time GPS tracking**: Users can share their live GPS coordinates
- **Proximity verification**: Confirms users are within 100 meters before allowing selections
- **Automatic user selection**: Randomly selects one male and one female user every 5 minutes
- **Connection management**: Handles WebSocket connections with ping/pong heartbeat

## API Endpoints

### WebSocket Management

- `GET /etgl/ws/status` - Check WebSocket server status
- `POST /etgl/ws/start` - Start the WebSocket server
- `GET /etgl/ws/locations` - Get all current user locations
- `GET /etgl/ws/selected` - Get currently selected users
- `POST /etgl/ws/select-new` - Manually trigger new user selection
- `POST /etgl/verify-proximity/:userId/:targetUserId` - Verify if two users are in proximity
- `GET /etgl/target/:userId` - Get target coordinates for opposite gender

## WebSocket Connection

Connect to: `ws://localhost:3002`

### Message Types

#### 1. GPS Update (Client → Server)
```json
{
  "type": "gps_update",
  "userId": "user123",
  "data": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 10,
    "timestamp": 1640995200000
  }
}
```

#### 2. User Selection (Client → Server)
```json
{
  "type": "user_selection",
  "userId": "selector123",
  "data": {
    "selectedUserId": "target456"
  }
}
```

#### 3. Selected Users Broadcast (Server → Client)
```json
{
  "type": "selected_users",
  "data": {
    "male": "user123",
    "female": "user456",
    "selectedAt": 1640995200000
  }
}
```

#### 4. Location Broadcast (Server → Client)
```json
{
  "type": "gps_update",
  "userId": "user123",
  "data": {
    "userId": "user123",
    "coordinates": {
      "latitude": 40.7128,
      "longitude": -74.0060,
      "accuracy": 10,
      "timestamp": 1640995200000
    },
    "lastUpdated": 1640995200000
  }
}
```

#### 5. Target Update (Server → Client)
```json
{
  "type": "target_update",
  "userId": "target123",
  "data": {
    "gender": "F",
    "location": {
      "userId": "target123",
      "coordinates": {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "accuracy": 10,
        "timestamp": 1640995200000
      },
      "lastUpdated": 1640995200000
    }
  }
}
```

#### 6. Ping/Pong (Heartbeat)
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

## Usage Flow

1. **Start the API server**: `bun run api:dev`
2. **WebSocket server auto-starts**: Automatically initializes 1 second after API server starts
3. **Connect clients**: Connect to `ws://localhost:3002`
4. **Send GPS updates**: Clients send their coordinates periodically
5. **Receive broadcasts**: All clients receive location updates and selected user notifications
6. **User selection**: Users can select others if they're within 100 meters
7. **Automatic selection**: System selects new users every 5 minutes

> **Note**: The WebSocket server now starts automatically when you run the API server. The `POST /etgl/ws/start` endpoint is still available for manual control if needed.

## Target System

The system automatically selects one male and one female user as "targets" every 5 minutes. Users can then:

- **Get target coordinates**: Use `GET /etgl/target/:userId` to get the coordinates of the opposite gender target
- **Real-time updates**: Receive live location updates for targets via WebSocket `target_update` messages
- **Gender-based matching**: Males get female targets, females get male targets

### Target Endpoint Usage

```bash
GET /etgl/target/user123
```

**Response:**
```json
{
  "userGender": "M",
  "targetGender": "F",
  "targetUserId": "target456",
  "targetProfile": {
    "name": "Jane Doe",
    "avatar": { "fullUrl": "..." },
    "bio": "Software developer"
  },
  "coordinates": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 10,
    "timestamp": 1640995200000
  },
  "lastUpdated": 1640995200000,
  "selectedAt": 1640995200000
}
```

## Proximity Rules

- Users must be within **100 meters** of each other to confirm selections
- Distance is calculated using the Haversine formula
- Proximity verification happens both in WebSocket messages and HTTP endpoints

## Connection Management

- Ping messages sent every 30 seconds to keep connections alive
- Inactive connections are cleaned up every minute
- Connection status is tracked and reported in the status endpoint

## Example Client Implementation

```javascript
const ws = new WebSocket('ws://localhost:3002');

ws.onopen = () => {
  console.log('Connected to WebSocket server');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'selected_users':
      console.log('New users selected:', message.data);
      break;
    case 'gps_update':
      console.log('Location update:', message.data);
      break;
    case 'target_update':
      console.log('Target location update:', message.data);
      break;
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
  }
};

// Send GPS update
function sendLocation(userId, lat, lng) {
  ws.send(JSON.stringify({
    type: 'gps_update',
    userId: userId,
    data: {
      latitude: lat,
      longitude: lng,
      accuracy: 10,
      timestamp: Date.now()
    }
  }));
}

// Select another user
function selectUser(myUserId, targetUserId) {
  ws.send(JSON.stringify({
    type: 'user_selection',
    userId: myUserId,
    data: {
      selectedUserId: targetUserId
    }
  }));
}
```

## Security Considerations

- GPS coordinates are stored in memory only (not persisted)
- Proximity verification prevents remote selections
- WebSocket connections are cleaned up automatically
- CORS is enabled for cross-origin requests

## Monitoring

Use the status endpoint to monitor:
- WebSocket server status
- Number of connected clients
- Number of active location trackers
- Currently selected users
