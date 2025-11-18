# 🎨 SYNC UI VISUAL GUIDE

## Component Layout

```
Your Projects Page
├── Project List (Left Sidebar)
│   ├── Project 1
│   ├── Project 2 ← Selected
│   └── ...
│
└── Project Detail Panel (Right Main Area)
    ├── Project Header (Name, Description)
    │
    ├── Tabs [Files] [Shared]
    │   ↓ (Files tab selected)
    │
    ├── 📌 SyncControlPanel (NEW!)
    │   ├── Title: "Sync Control Panel"
    │   ├── Status Badge [Stopped|Syncing|Paused]
    │   │
    │   ├── API Key Section
    │   │   ├── [Add API Key] button
    │   │   │   (OR if set)
    │   │   ├── [abcd1234...xyzw] [Clear]
    │   │   └── Help text
    │   │
    │   ├── Device Selector
    │   │   └── [Dropdown: Select Device]
    │   │
    │   ├── Sync Status (when active)
    │   │   ├── Synced: 1.2 MB
    │   │   ├── Local: 2.5 MB
    │   │   ├── Remaining: 500 KB
    │   │   ├── Last Sync: 14:23:45
    │   │   └── [=============50%===========]
    │   │
    │   ├── Action Buttons
    │   │   └── [Start Sync] or [Pause] [Stop]
    │   │
    │   └── Messages
    │       ├── ✓ Sync started successfully (green)
    │       └── ✗ Failed to connect to Syncthing (red)
    │
    └── Files Tab Content
        ├── File tree
        ├── File browser
        └── ...
```

---

## State Transitions

```
                    START SYNC
                       ↓
    ┌─────────────────────────────────────┐
    │         STOPPED (Red Badge)         │
    │  [Add API Key] [Select Device]      │
    │     [Start Sync] button             │
    └────────────────┬────────────────────┘
                     │
                     ↓ (on click "Start Sync")
    ┌─────────────────────────────────────┐
    │        SYNCING (Green Badge)        │
    │  Synced: 1.2 MB                     │
    │  Local: 2.5 MB                      │
    │  [===========45%===========]        │
    │  [Pause] [Stop] buttons             │
    └────────────────┬────────────────────┘
                     │
         ┌───────────┴──────────┐
         │                      │
         ↓ (click "Pause")      ↓ (click "Stop")
    ┌─────────────┐         ┌──────────────┐
    │   PAUSED    │         │   STOPPED    │
    │  (Amber)    │         │   (Red)      │
    │ [Resume]    │         │[Clear/Reset] │
    │ [Stop]      │         │              │
    └─────────────┘         └──────────────┘
         │                      ↑
         │ (click "Resume")     │
         └──────────────────────┘
```

---

## UI Component States

### 1. Initial State (No API Key)
```
┌─────────────────────────────────────────┐
│ Sync Control Panel              [Stopped] │
├─────────────────────────────────────────┤
│ Syncthing API Key                       │
│ [Add API Key]                           │
├─────────────────────────────────────────┤
│ Select Device                           │
│ (Disabled - waiting for API key)        │
└─────────────────────────────────────────┘
```

### 2. API Key Added, Devices Loaded
```
┌─────────────────────────────────────────┐
│ Sync Control Panel              [Stopped] │
├─────────────────────────────────────────┤
│ Syncthing API Key                       │
│ [abcd1234...pqrs] [Clear]               │
├─────────────────────────────────────────┤
│ Select Device                           │
│ [▼ My Laptop (DEVICE-1)]                │
├─────────────────────────────────────────┤
│ [Start Sync] (enabled)                  │
└─────────────────────────────────────────┘
```

### 3. Syncing Active
```
┌─────────────────────────────────────────┐
│ Sync Control Panel              [Syncing] │
├─────────────────────────────────────────┤
│ Syncthing API Key                       │
│ [abcd1234...pqrs] [Clear]               │
├─────────────────────────────────────────┤
│ Select Device                           │
│ [▼ My Laptop (DEVICE-1)]                │
├─────────────────────────────────────────┤
│ Sync Status                             │
│ Synced:    2.4 MB                       │
│ Local:     5.0 MB                       │
│ Remaining: 2.6 MB                       │
│ Last Sync: 14:32:18                     │
│ [████████░░░░░░░░░░░░░░░░░░░░] 48%     │
├─────────────────────────────────────────┤
│ [Pause Sync]  [Stop Sync]               │
├─────────────────────────────────────────┤
│ ✓ Sync started successfully             │
└─────────────────────────────────────────┘
```

### 4. Paused State
```
┌─────────────────────────────────────────┐
│ Sync Control Panel              [Paused]  │
├─────────────────────────────────────────┤
│ Syncthing API Key                       │
│ [abcd1234...pqrs] [Clear]               │
├─────────────────────────────────────────┤
│ Select Device                           │
│ [▼ My Laptop (DEVICE-1)]                │
├─────────────────────────────────────────┤
│ Sync Status                             │
│ Synced:    2.4 MB (paused at)           │
│ Local:     5.0 MB                       │
│ Remaining: 2.6 MB                       │
│ [████████░░░░░░░░░░░░░░░░░░░░] 48%     │
├─────────────────────────────────────────┤
│ [Resume Sync]  [Stop Sync]              │
├─────────────────────────────────────────┤
│ ✓ Sync paused                           │
└─────────────────────────────────────────┘
```

### 5. Error State
```
┌─────────────────────────────────────────┐
│ Sync Control Panel              [Stopped] │
├─────────────────────────────────────────┤
│ Syncthing API Key                       │
│ [Add API Key]                           │
├─────────────────────────────────────────┤
│ [Start Sync]                            │
├─────────────────────────────────────────┤
│ ✗ Failed to start sync:                 │
│   Cannot connect to Syncthing service   │
└─────────────────────────────────────────┘
```

---

## Color Scheme

### Status Badges
```
Stopped   ██████  #F44336 (Red)
Syncing   ██████  #4CAF50 (Green)
Paused    ██████  #FFC107 (Amber)
Unknown   ██████  #9E9E9E (Gray)
```

### Button Colors
```
Primary       ██████  #2196F3 (Blue)      - Start Sync
Success       ██████  #4CAF50 (Green)     - Resume Sync
Warning       ██████  #FF9800 (Orange)    - Pause Sync
Danger        ██████  #F44336 (Red)       - Stop Sync
Disabled      ██████  50% opacity
```

### Messages
```
Success Alert ██████  #E8F5E9 (Light Green)
Error Alert   ██████  #FFEBEE (Light Red)
Info Alert    ██████  #E3F2FD (Light Blue)
```

### Progress Bar
```
Background    ██████  #F5F5F5 (Light Gray)
Progress      ██████  #4CAF50 → #45a049 (Green gradient)
```

---

## Responsive Breakpoints

### Desktop (1200px+)
```
┌────────────────────────────────────────┐
│ Full Sync Control Panel                │
│ All fields side-by-side                │
│ Device dropdown full width             │
│ Progress bar full width                │
│ Buttons in single row                  │
└────────────────────────────────────────┘
```

### Tablet (768px - 1199px)
```
┌──────────────────────────────┐
│ Sync Control Panel           │
│ Fields stacked               │
│ Buttons wrapped as needed    │
│ Status items in 2x2 grid     │
└──────────────────────────────┘
```

### Mobile (< 768px)
```
┌─────────────────────┐
│ Sync Control Panel  │
│ Full width fields   │
│ Buttons stacked     │
│ Status in 1 column  │
└─────────────────────┘
```

---

## Interaction Patterns

### API Key Input
```
Initial:     [Add API Key] button
Click:       TextField appears
Type:        ••••••••••••••••••••
Enter key:   Validates & closes input
Result:      [abcd1234...xyzw] [Clear]
```

### Device Selector
```
Initial:     [Disabled - Waiting for API key]
After API:   [▼ -- Select a device --]
Click:       Dropdown opens with:
             - My Laptop (DEVICE-1)
             - Desktop PC (DEVICE-2)
             - Mobile Phone (DEVICE-3)
Select:      Selection updates, Start button enabled
```

### Sync Actions
```
Click [Start Sync]:
  ├─ Validate device selected
  ├─ Validate API key provided
  ├─ Show loading spinner
  ├─ Call POST /sync-start
  ├─ Update status to "Syncing"
  ├─ Start polling for updates
  └─ Show success message

Click [Pause Sync]:
  ├─ Show loading spinner
  ├─ Call POST /pause-sync
  ├─ Update status to "Paused"
  ├─ Stop polling
  └─ Show success message

Click [Resume Sync]:
  ├─ Show loading spinner
  ├─ Call POST /resume-sync
  ├─ Update status to "Syncing"
  ├─ Resume polling
  └─ Show success message

Click [Stop Sync]:
  ├─ Confirm dialog: "Stop syncing to this device?"
  ├─ If confirmed:
  │  ├─ Show loading spinner
  │  ├─ Call POST /sync-stop
  │  ├─ Update status to "Stopped"
  │  ├─ Stop polling
  │  └─ Show success message
  └─ If cancelled: Do nothing
```

---

## Keyboard Shortcuts (Future)

```
Ctrl/Cmd + S    Start sync
Ctrl/Cmd + P    Pause sync
Ctrl/Cmd + R    Resume sync
Ctrl/Cmd + X    Stop sync
Tab             Navigate between inputs
Enter           Confirm action
Escape          Close dialogs/inputs
```

---

## Accessibility Features

### ARIA Labels
- Status badge: `aria-label="Sync status: Stopped"`
- Start button: `aria-label="Start syncing to selected device"`
- Device dropdown: `aria-label="Select Syncthing device"`

### Keyboard Navigation
- All buttons accessible via Tab
- Dropdown navigable with Arrow keys
- Inputs focusable with Tab

### Color Contrast
- All text meets WCAG AA standards
- Status indicators also use text labels
- Error messages use icons + text

### Screen Reader Support
- Form labels properly associated
- Error messages announced
- Status updates announced

---

## Dark Mode Support

The component automatically adapts to system dark mode preference:

```css
@media (prefers-color-scheme: dark) {
  /* Component automatically uses MUI dark theme */
  /* Background colors adjust */
  /* Text colors adjust */
  /* Button colors adjust */
}
```

---

## Performance Optimizations

1. **Lazy Status Polling**
   - Only polls when `state === 'syncing'`
   - Stops polling when paused or stopped
   - Cleanup on component unmount

2. **Memoized Callbacks**
   - Event handlers use useCallback
   - Prevents unnecessary re-renders

3. **Conditional Rendering**
   - Status display only shown when syncing
   - Device selector only shown with API key
   - Buttons change based on state

4. **Debounced Updates**
   - API key changes debounced
   - Device selection cached
   - Status updates batched

---

## Testing Scenarios

### Scenario 1: Happy Path (Full Sync)
```
1. Add API key
2. Select device
3. Click Start Sync
4. Wait for sync to complete
5. See status update
6. Click Stop Sync
✓ All operations succeed
```

### Scenario 2: Pause & Resume
```
1. Start sync
2. Click Pause Sync
3. Verify status changes to "Paused"
4. Click Resume Sync
5. Verify status changes back to "Syncing"
✓ Pause/Resume works correctly
```

### Scenario 3: Error Handling
```
1. Enter invalid API key
2. Try to start sync
3. See error message: "Cannot connect to Syncthing"
4. Fix the API key
5. Click Start Sync again
✓ Error handling works
```

### Scenario 4: Device Change
```
1. Start sync to Device A
2. Pause sync
3. Select Device B
4. Click Start Sync
5. Verify syncing to Device B
✓ Device switching works
```

---

## Component Tree

```
YourProjectsPage
├── Tabs
│   └── Tab 0 (Files)
│       ├── SyncControlPanel ← NEW!
│       │   ├── Card
│       │   │   ├── CardHeader (Title + Status)
│       │   │   └── CardContent
│       │   │       └── Stack
│       │   │           ├── API Key Section
│       │   │           │   ├── TextField (password)
│       │   │           │   └── Buttons
│       │   │           ├── FormControl (Device Selector)
│       │   │           │   └── Select with MenuItems
│       │   │           ├── Status Display
│       │   │           │   ├── Box (status items)
│       │   │           │   └── LinearProgress
│       │   │           ├── Action Buttons
│       │   │           │   └── Stack of Buttons
│       │   │           └── Alerts
│       │   │               ├── Alert (error)
│       │   │               └── Alert (success)
│       │   │
│       │   └── useEffect hooks
│       │       ├── Load devices on API key change
│       │       └── Poll status when syncing
│       │
│       └── YourProjectFilesTab
│           ├── File tree
│           └── File browser
│
└── Other sections...
```

---

## Data Flow

```
User Input
    ↓
SyncControlPanel State Update
    ↓
API Call (cloudAPI.post/get)
    ↓
Backend Validation
    ↓
Syncthing REST API Call
    ↓
Response Parsing
    ↓
State Update (syncStatus, error, success)
    ↓
Re-render with new UI
    ↓
User sees updated status
```

---

## Summary

This visual guide shows:
- ✅ Component layout and positioning
- ✅ Visual states and transitions
- ✅ Color scheme and styling
- ✅ Responsive behavior
- ✅ User interactions
- ✅ Accessibility features
- ✅ Component hierarchy
- ✅ Data flow

Ready for implementation and user testing! 🚀
