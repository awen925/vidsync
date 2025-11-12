# Vidsync Electron Desktop App

A professional React + TypeScript desktop application for managing file synchronization projects. Communicates with Go agent via WebSocket and HTTP, with Supabase backend integration.

## 📋 Features

- ✅ Modern React UI with Tailwind CSS
- ✅ Real-time sync status monitoring
- ✅ Project management (create, list, invite members)
- ✅ Settings (download path, auto-sync, sync mode)
- ✅ Magic link & password authentication
- ✅ Device management & registration
- ✅ Error handling & diagnostics
- ✅ File dialogs & system integration

## 📦 Prerequisites

- Node.js 16+
- npm or yarn
- Electron 27+
- Go agent running on `127.0.0.1:29999`
- Cloud backend running on `localhost:3000`

## 🚀 Installation & Setup

### 1. Install Dependencies

```bash
cd electron
npm install
```

### 2. Environment Configuration

Create `.env`:
```env
REACT_APP_CLOUD_URL=http://localhost:3000/api
REACT_APP_AGENT_URL=http://127.0.0.1:29999/v1
```

### 3. Development

**Start with Hot Reload**
```bash
npm start
# Runs: React dev server + Electron app
# Both reload on file changes
```

**Or Run Separately**
```bash
# Terminal 1: React dev server
npm run react-start

# Terminal 2: Electron (waits for React on :3000)
npm run electron-start
```

### 4. Build for Production

```bash
npm run build
# Creates:
# - build/        (React optimized build)
# - dist/         (Electron binary + assets)
# - Vidsync-1.0.0.dmg (macOS)
# - Vidsync-1.0.0.exe (Windows)
# - Vidsync-1.0.0.AppImage (Linux)
```

## 📁 Project Structure

```
electron/
├── public/
│   └── index.html
├── src/
│   ├── main/
│   │   ├── main.ts              # Electron main process
│   │   ├── preload.ts           # Context isolation bridge
│   │   ├── agentController.ts   # Go agent process manager
│   │   └── ipcHandlers.ts       # IPC event handlers
│   │
│   ├── renderer/
│   │   ├── pages/
│   │   │   ├── Auth/
│   │   │   │   └── AuthPage.tsx       # Login/Signup
│   │   │   ├── Dashboard/
│   │   │   │   └── DashboardPage.tsx  # Home with projects
│   │   │   ├── Projects/
│   │   │   │   ├── ProjectDetail.tsx  # Project members & files
│   │   │   │   └── ProjectList.tsx    # Project browser
│   │   │   ├── Settings/
│   │   │   │   └── SettingsPage.tsx   # User preferences
│   │   │   └── DeviceLink/
│   │   │       └── DeviceLinkPage.tsx # Device registration
│   │   │
│   │   ├── components/
│   │   │   ├── Sidebar.tsx      # Navigation
│   │   │   ├── Header.tsx       # Top bar
│   │   │   ├── StatusIndicator.tsx
│   │   │   └── Loader.tsx
│   │   │
│   │   ├── hooks/
│   │   │   ├── useCloudApi.ts   # Cloud API client
│   │   │   ├── useAgentEvents.ts # WebSocket + agent status
│   │   │   └── useAuth.ts       # Auth state
│   │   │
│   │   ├── styles/
│   │   │   ├── index.css        # Global styles
│   │   │   ├── Auth.css
│   │   │   ├── Dashboard.css
│   │   │   └── Settings.css
│   │   │
│   │   ├── assets/
│   │   │   └── icon.png         # App icon
│   │   │
│   │   ├── App.tsx              # Router setup
│   │   └── index.tsx            # React entry point
│   │
│   └── react-app-env.d.ts       # React types
│
├── .env                         # Environment variables
├── package.json
├── tsconfig.json
└── electron-builder.json        # Build config
```

## 🎯 Page Descriptions

### Auth Page (`/auth`)
- Email input
- Password input (or Magic Link)
- Toggle between password & magic link modes
- Signup & login buttons
- Error messages

**Flow:**
1. User enters email
2. Chooses password or magic link
3. System calls `/api/auth/login` or `/api/auth/magic-link`
4. JWT token stored in localStorage
5. Redirects to `/dashboard`

### Dashboard Page (`/dashboard`)
- Welcome header
- Agent status indicator (connected/disconnected)
- "Create New Project" button
- Grid of user's projects
- Click project → view details

**Real-time Updates:**
- Subscribes to WebSocket `/v1/events`
- Displays file sync progress per project
- Shows live status changes

### Projects Page (`/projects/:id`)
- **Members Tab**
  - List of project collaborators
  - Invite new members (email input)
  - Remove members (owner only)

- **Files Tab**
  - Browser view of project files
  - Sync status per file
  - Last modified timestamp
  - File size & icon

### Settings Page (`/settings`)
- Default download path (with Browse button)
- Auto sync toggle
- Sync mode dropdown (automatic / manual)
- Notification preferences
- Save button

### Device Link Page (`/link`)
- QR code for device pairing
- Or enter pairing code
- Confirm device registration
- Show device name & platform

## 🔌 Integration Points

### With Go Agent

**HTTP Calls** (via `useCloudApi.ts`)
```typescript
// Get projects
GET http://127.0.0.1:29999/v1/projects

// Create project
POST http://127.0.0.1:29999/v1/projects
{
  id, name, path, auto_sync
}

// Control Syncthing
POST http://127.0.0.1:29999/v1/syncthing/folders/:id/rescan
POST http://127.0.0.1:29999/v1/syncthing/folders/:id/pause
POST http://127.0.0.1:29999/v1/syncthing/folders/:id/resume
```

**WebSocket** (via `useAgentEvents.ts`)
```typescript
// Connect
ws://127.0.0.1:29999/v1/events

// Listen for sync events
{
  projectId: "proj-1",
  type: "fileUpdate",
  path: "/file/path.txt",
  timestamp: "2024-11-11T10:30:00Z"
}
```

### With Cloud Backend

**Authentication**
```typescript
// Login
POST /api/auth/login
{ email, password }

// Magic link
POST /api/auth/magic-link
{ email }

// Get user
GET /api/auth/me
Authorization: Bearer TOKEN
```

**Projects**
```typescript
// List projects
GET /api/projects
Authorization: Bearer TOKEN

// Create project
POST /api/projects
{ name, description }

// Invite member
POST /api/projects/:id/invite
{ email }
```

**Settings**
```typescript
// Get settings
GET /api/users/settings

// Update settings
PUT /api/users/settings
{ defaultDownloadPath, autoSync, syncMode }
```

## 🎨 Styling

Using **Tailwind CSS** (configured in `electron/tailwind.config.js`):

```typescript
<button className="bg-blue-500 hover:bg-blue-700 text-white px-4 py-2 rounded">
  Click me
</button>
```

Or **CSS Modules**:
```css
/* Dashboard.css */
.dashboard-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px;
}
```

## 🔒 IPC Security

**Main ↔ Renderer Communication**

Preload script exposes safe APIs:
```typescript
// preload.ts
contextBridge.exposeInMainWorld("api", {
  openDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  agentStart: () => ipcRenderer.invoke("agent:start"),
});

// In React component
const path = await window.api.openDirectory();
```

**Never expose:**
- `require` or `eval`
- File system directly
- Process spawning to renderer

## 🧪 Testing

```bash
npm test
npm run test:coverage
```

## 🚀 Building & Packaging

### macOS (DMG + Code Signing)
```bash
npm run build
# Creates: dist/Vidsync-1.0.0.dmg
# Note: Requires code signing certificate
```

### Windows (MSI + Auto-Update)
```bash
npm run build
# Creates: dist/Vidsync-1.0.0.exe
# Note: Requires Windows code signing certificate
```

### Linux (AppImage + Debian)
```bash
npm run build
# Creates:
#   dist/Vidsync-1.0.0.AppImage
#   dist/Vidsync-1.0.0.AppImage.tar.gz
#   dist/Vidsync-1.0.0.deb
```

## 🐛 Debugging

### DevTools
Press `F12` or `Cmd+Option+I` (macOS) to open Chrome DevTools

### Logging
```typescript
console.log("Debug:", data);  // Appears in DevTools
```

### Agent Connection Issues
```typescript
// In useAgentEvents.ts
const [connected, setConnected] = useState(false);
// Check if connected === true in UI
```

## 📦 Distribution

### Electron Builder Configuration
Edit `electron-builder.json`:
```json
{
  "appId": "com.vidsync.app",
  "productName": "Vidsync",
  "files": ["dist/**/*", "node_modules/**/*"],
  "directories": {
    "buildResources": "src/renderer/assets"
  },
  "nsis": {
    "oneClick": false,
    "createDesktopShortcut": true
  }
}
```

### Auto-Update
Configured via `electron-updater`:
```typescript
// main.ts
import { autoUpdater } from "electron-updater";
autoUpdater.checkForUpdatesAndNotify();
```

## 🔧 Troubleshooting

### Blank Window on Startup
```
Solution: Check if React dev server is running on :3000
         Or verify built React bundle exists in build/
```

### Agent Connection Failed
```
Solution: 1. Verify Go agent is running on 127.0.0.1:29999
          2. Check firewall allows localhost:29999
          3. View network tab in DevTools
```

### Module Not Found Errors
```bash
rm -rf node_modules package-lock.json
npm install
npm start
```

### Build Fails on Signing
```
Solution: Remove code signing for development
          Edit electron-builder.json: "sign": false
```

## 📚 Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [Electron Builder](https://www.electron.build/)
- [Electron IPC](https://www.electronjs.org/docs/latest/api/ipc-main)

## 📄 License

MIT

---

**Built with ❤️ for Vidsync**
