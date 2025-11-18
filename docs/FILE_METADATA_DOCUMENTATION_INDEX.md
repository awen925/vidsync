# Documentation Index: File Metadata Storage

## Question You Asked
**"When create project, in which table file metadata saved? I can't see it."**

---

## Answer
✅ **File metadata is saved in the `remote_files` table**

❌ **BUT NOT on project creation** - it's saved when Syncthing discovers the files

---

## Documents Created (Read These!)

### 📄 Start Here (2 min read)
**File**: `WHERE_FILES_SAVED_QUICK_ANSWER.md`  
**What**: Quick answer + cheat sheet + troubleshooting  
**Read if**: You want the short version

---

### 📄 Understand the Flow (5 min read)
**File**: `FILE_METADATA_STORAGE_EXPLAINED.md`  
**What**: 
- What gets saved on project creation
- What gets saved on file sync
- Why it's this way
- Code references

**Read if**: You want to understand WHY it works this way

---

### 📄 See the Tables (5 min read)
**File**: `FILE_METADATA_TABLES_REFERENCE.md`  
**What**:
- All tables with full schema
- Example data in each table
- Query examples
- Data flow with tables
- Complete relationships

**Read if**: You want to see the actual table structures

---

### 📄 SQL Reference (10 min read)
**File**: `FILE_METADATA_SQL_SCHEMA.md`  
**What**:
- Complete SQL schema (copy-paste ready)
- Column-by-column explanations
- Visual schema relationships
- Data flow timeline
- Advanced queries

**Read if**: You need to write SQL or understand the schema deeply

---

## Quick Comparison Table

| Need | File | Time |
|------|------|------|
| Just the answer | `WHERE_FILES_SAVED_QUICK_ANSWER.md` | 2 min |
| Understand the architecture | `FILE_METADATA_STORAGE_EXPLAINED.md` | 5 min |
| See all tables | `FILE_METADATA_TABLES_REFERENCE.md` | 5 min |
| SQL schema details | `FILE_METADATA_SQL_SCHEMA.md` | 10 min |

---

## Key Table Names to Remember

| Table | Purpose | When Populated |
|-------|---------|-----------------|
| `projects` | Project metadata | On create |
| **`remote_files`** | **File metadata** | **When synced** |
| `project_sync_state` | Snapshot stats | On create + refresh |
| `file_synced_devices` | Device sync tracking | When files synced |

---

## The Answer (One-Liner)

**Files are saved in `remote_files` table when Syncthing discovers them, NOT when you create the project.**

---

## Where to Find the Code

### Backend Routes
- **Create project**: `cloud/src/api/projects/routes.ts` line 11
- **Refresh endpoint**: `cloud/src/api/projects/routes.ts` line 750

### Database Schema
- **remote_files table**: `cloud/migrations/007-create-remote-files-table.sql`
- **project_sync_state**: `cloud/migrations/008-create-project-events-table.sql`
- **file_synced_devices**: `cloud/migrations/007-create-remote-files-table.sql`

### Frontend
- **YourProjectsPage**: `electron/src/renderer/pages/Projects/YourProjectsPage.tsx`
- **Uses API**: `cloudAPI.get('/projects/:id/files')`
  - Actually queries `remote_files` table (see backend)

---

## Visual Summary

```
CREATE PROJECT
    ↓
[INSERT INTO projects]
    ↓
projects table now has:
  - name: "My Videos"
  - local_path: "/home/user/Videos"
  ❌ NO FILES YET!

[SYNCTHING DISCOVERS FILES]
    ↓
[INSERT INTO remote_files (per file)]
    ↓
remote_files table now has:
  - path: "Family/2024/Birthday.mp4"
  - name: "Birthday.mp4"
  - size: 2147483648
  - ✅ 250 rows (one per file)

[UPDATE project_sync_state]
    ↓
project_sync_state now has:
  - total_files: 250
  - total_size: 107374182400
  - snapshot_version: 1

[DEVICE SYNCS FILES]
    ↓
[INSERT INTO file_synced_devices (per synced file)]
    ↓
file_synced_devices now tracks:
  - Which device got which file
  - When it was synced
  - ✅ 250 rows (one per file per device)
```

---

## Related Refactoring (This Session)

We also refactored `YourProjectsPage.tsx` today:

**Before**: 915 lines (monolithic)  
**After**: 634 lines + 4 components (modular)

Files involved:
- `YourProjectsPage.tsx` (main page, 634 lines)
- `YourProjectsList.tsx` (new, 128 lines)
- `YourProjectHeader.tsx` (new, 75 lines)
- `YourProjectFilesTab.tsx` (new, 95 lines)
- `YourProjectSharedTab.tsx` (new, 135 lines)

See `YOURPROJECTS_REFACTORING_COMPLETE.md` for details.

---

## Next Steps

If you need to:
1. **Query files** → See `FILE_METADATA_SQL_SCHEMA.md` (Query Examples section)
2. **Understand sync** → See `FILE_METADATA_STORAGE_EXPLAINED.md` (Sync State section)
3. **Debug why files don't appear** → See `WHERE_FILES_SAVED_QUICK_ANSWER.md` (Troubleshooting)
4. **Write code** → See `FILE_METADATA_TABLES_REFERENCE.md` (Complete data flow section)

---

## Created Documents Today

```
✅ YOURPROJECTS_REFACTORING_COMPLETE.md
✅ YOURPROJECTS_BEFORE_AFTER.md
✅ FILE_METADATA_STORAGE_EXPLAINED.md
✅ FILE_METADATA_TABLES_REFERENCE.md
✅ FILE_METADATA_SQL_SCHEMA.md
✅ WHERE_FILES_SAVED_QUICK_ANSWER.md
✅ THIS FILE (INDEX)
```
