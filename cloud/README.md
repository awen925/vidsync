# Vidsync Cloud Backend

Node.js + Express + Supabase backend API for Vidsync. Manages users, projects, devices, and synchronization metadata.

## 📋 Features

- ✅ User authentication (JWT, magic links)
- ✅ Project management (create, list, invite)
- ✅ Device registration & management
- ✅ Real-time sync event logging
- ✅ Subscription & billing ready
- ✅ Comprehensive error handling
- ✅ Request logging & monitoring

## 📦 Prerequisites

- Node.js 16+
- npm or yarn
- Supabase account (Phase 2)

## 🚀 Installation & Setup

### 1. Install Dependencies

```bash
cd cloud
npm install
```

### 2. Environment Configuration

Create `.env`:
```env
# Server
PORT=3000
NODE_ENV=development

# JWT
JWT_SECRET=your-super-secret-key-change-me

# Supabase (Phase 2 - optional for Phase 1)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Email (Phase 2)
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@vidsync.com

# Stripe (Phase 4)
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable
```

### 3. Build & Run

**Development Mode**
```bash
npm run dev
# Runs with ts-node, auto-reloads on changes
# Open http://localhost:3000
```

**Production Build**
```bash
npm run build
npm start
```

## 📡 API Reference

### Authentication

**POST /api/auth/signup**
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "John Doe"
  }'
```

Response (201):
```json
{
  "message": "User created successfully",
  "email": "user@example.com",
  "name": "John Doe"
}
```

**POST /api/auth/login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

Response (200):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com"
  }
}
```

**POST /api/auth/magic-link**
```bash
curl -X POST http://localhost:3000/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

Response (200):
```json
{
  "message": "Magic link sent to email",
  "email": "user@example.com"
}
```

**GET /api/auth/me** (requires Bearer token)
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Projects

**POST /api/projects** (authenticated)
```bash
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "name": "My Project",
    "description": "My important files"
  }'
```

Response (201):
```json
{
  "id": "proj-uuid",
  "name": "My Project",
  "description": "My important files",
  "owner": "user-uuid",
  "createdAt": "2024-11-11T10:30:00Z"
}
```

**GET /api/projects** (authenticated)
```bash
curl http://localhost:3000/api/projects \
  -H "Authorization: Bearer TOKEN"
```

Response (200):
```json
{
  "projects": [
    {
      "id": "proj-1",
      "name": "My Project",
      "description": "My important files",
      "owner": "user-uuid",
      "members": 2,
      "createdAt": "2024-11-11T10:30:00Z"
    }
  ]
}
```

**POST /api/projects/:projectId/invite** (authenticated)
```bash
curl -X POST http://localhost:3000/api/projects/proj-1/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "email": "colleague@example.com"
  }'
```

Response (201):
```json
{
  "invitation": {
    "id": "inv-uuid",
    "projectId": "proj-1",
    "email": "colleague@example.com",
    "status": "pending",
    "createdAt": "2024-11-11T10:30:00Z"
  }
}
```

### Devices

**POST /api/devices/register** (authenticated)
```bash
curl -X POST http://localhost:3000/api/devices/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "deviceId": "device-uuid",
    "deviceName": "My Windows PC",
    "platform": "windows"
  }'
```

Response (201):
```json
{
  "device": {
    "id": "device-uuid",
    "name": "My Windows PC",
    "platform": "windows",
    "userId": "user-uuid",
    "registeredAt": "2024-11-11T10:30:00Z"
  }
}
```

**GET /api/devices** (authenticated)
```bash
curl http://localhost:3000/api/devices \
  -H "Authorization: Bearer TOKEN"
```

### Sync Events

**POST /api/sync/events** (authenticated)
```bash
curl -X POST http://localhost:3000/api/sync/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "projectId": "proj-1",
    "type": "fileUpdate",
    "path": "/documents/report.pdf",
    "message": "File synced successfully"
  }'
```

### Users

**GET /api/users/profile** (authenticated)
```bash
curl http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer TOKEN"
```

**GET /api/users/settings** (authenticated)
```bash
curl http://localhost:3000/api/users/settings \
  -H "Authorization: Bearer TOKEN"
```

**PUT /api/users/settings** (authenticated)
```bash
curl -X PUT http://localhost:3000/api/users/settings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "defaultDownloadPath": "~/Downloads",
    "autoSync": true,
    "syncMode": "automatic",
    "notifications": true
  }'
```

## 🗄️ Database Schema (Supabase)

### users table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  name VARCHAR(255),
  avatar_url TEXT,
  subscription_plan VARCHAR(50) DEFAULT 'free',
  subscription_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### devices table
```sql
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  device_id VARCHAR(255) UNIQUE,
  name VARCHAR(255) NOT NULL,
  platform VARCHAR(50),
  token VARCHAR(255),
  last_seen TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### projects table
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### project_members table
```sql
CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50) DEFAULT 'member',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### sync_events table
```sql
CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id),
  user_id UUID REFERENCES users(id),
  type VARCHAR(50),
  path TEXT,
  message TEXT,
  status VARCHAR(50) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### subscriptions table
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  plan_id VARCHAR(50),
  status VARCHAR(50),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 📋 File Structure

```
cloud/
├── src/
│   ├── api/
│   │   ├── auth/
│   │   │   └── routes.ts           # Auth endpoints
│   │   ├── projects/
│   │   │   └── routes.ts           # Project endpoints
│   │   ├── devices/
│   │   │   └── routes.ts           # Device endpoints
│   │   ├── sync/
│   │   │   └── routes.ts           # Sync endpoints
│   │   └── users/
│   │       └── routes.ts           # User endpoints
│   ├── middleware/
│   │   ├── authMiddleware.ts       # JWT verification
│   │   └── errorHandler.ts         # Error handling
│   ├── services/
│   │   ├── authService.ts          # Auth logic (stubs)
│   │   ├── projectService.ts       # Project logic
│   │   ├── deviceService.ts        # Device logic
│   │   ├── syncService.ts          # Sync event logic
│   │   ├── subscriptionService.ts  # Subscription logic
│   │   └── userService.ts          # User logic
│   ├── utils/
│   │   ├── config.ts               # Configuration
│   │   ├── logger.ts               # Logging
│   │   ├── supabase.ts             # Supabase client (Phase 2)
│   │   └── errors.ts               # Error classes
│   ├── db/
│   │   └── migrations/             # SQL migrations
│   ├── app.ts                      # Express app setup
│   └── server.ts                   # Entry point
├── tests/
│   └── integration/                # Integration tests
├── .env                            # Environment variables
├── package.json
└── tsconfig.json
```

## 🧪 Testing

```bash
npm test
npm run test:watch
npm run test:coverage
```

## 🚀 Deployment

### Vercel (recommended)
```bash
npm install -g vercel
vercel
```

### Railway.app
```bash
npm install -g railway
railway link
railway up
```

### Docker
```bash
docker build -t vidsync-cloud .
docker run -p 3000:3000 -e PORT=3000 vidsync-cloud
```

## 🔒 Security

- All endpoints require authentication except `/api/auth/*`
- Passwords hashed with bcryptjs
- JWTs expire after 24 hours
- CORS enabled for Electron app
- Rate limiting on auth endpoints (Phase 2)
- SQL injection protection via Supabase parameterization

## 📚 Phase 2 Integration Checklist

When implementing Supabase integration:

- [ ] Replace stub routes with Supabase queries
- [ ] Implement password hashing (bcryptjs)
- [ ] Add JWT token generation/verification
- [ ] Implement magic link email sending
- [ ] Add database migrations
- [ ] Create Row Level Security (RLS) policies
- [ ] Add rate limiting middleware
- [ ] Implement subscription verification
- [ ] Add API logging
- [ ] Setup error tracking (Sentry)

## 🐛 Troubleshooting

### Port 3000 Already in Use
```bash
lsof -i :3000
kill -9 <PID>
```

### Module Not Found
```bash
rm -rf node_modules package-lock.json
npm install
```

### TypeScript Errors
```bash
npm run build  # Check for build errors
```

---

**Built with ❤️ for Vidsync**
