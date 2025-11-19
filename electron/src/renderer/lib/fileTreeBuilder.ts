/**
 * File Tree Builder - Optimized for large file sets
 * 
 * Converts flat file list to hierarchical tree structure
 * Uses Map-based indexing for O(n) performance
 * Supports virtual rendering for 1M+ files
 */

export interface FileNode {
  id: string; // Unique ID: path hash
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileNode[];
  isExpanded?: boolean;
  fileCount?: number; // For directories: total files inside
  totalSize?: number; // For directories: total size inside
}

export interface FileSnapshot {
  file_path: string;
  is_directory: boolean;
  size?: number;
  modified_at?: string;
  file_hash?: string;
}

/**
 * Build hierarchical file tree from flat snapshot
 * 
 * Optimizations:
 * - Single pass through files (O(n))
 * - Map-based directory lookup (O(1) access)
 * - Lazy child initialization (children only created when needed)
 * - Efficient sorting (directories first, then alphabetical)
 * 
 * @param files Flat array of file snapshots
 * @returns Root node with entire tree structure
 */
export function buildFileTree(files: FileSnapshot[]): FileNode {
  // Map to track all nodes by path for quick lookup
  const nodeMap = new Map<string, FileNode>();

  // Create root node
  const root: FileNode = {
    id: 'root',
    name: 'Root',
    path: '/',
    type: 'directory',
    children: [],
    fileCount: 0,
    totalSize: 0,
  };

  nodeMap.set('/', root);

  // Single pass through files
  for (const file of files) {
    const parts = file.file_path.split('/').filter(Boolean);

    // Build path chain: create missing parent directories
    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;

      if (!nodeMap.has(currentPath)) {
        // New node to create
        const isDir = i < parts.length - 1 || file.is_directory;
        const newNode: FileNode = {
          id: hashPath(currentPath),
          name: part,
          path: currentPath,
          type: isDir ? 'directory' : 'file',
          size: isDir ? undefined : file.size,
          modified: file.modified_at,
          children: isDir ? [] : undefined,
          fileCount: isDir ? 0 : undefined,
          totalSize: isDir ? 0 : undefined,
        };

        nodeMap.set(currentPath, newNode);

        // Add to parent's children
        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/')) || '/';
        const parent = nodeMap.get(parentPath);
        if (parent && parent.children) {
          parent.children.push(newNode);
        }
      }

      // Update directory stats
      const node = nodeMap.get(currentPath);
      if (node) {
        if (file.is_directory && i === parts.length - 1) {
          // It's a directory file entry
          node.type = 'directory';
          if (!node.children) node.children = [];
        } else if (i === parts.length - 1) {
          // Final file
          node.type = 'file';
          node.size = file.size;
        }
      }
    }

    // Update parent directory stats (file count and total size)
    if (!file.is_directory) {
      let currentPath = '';
      for (const part of parts.slice(0, -1)) {
        currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
        const dir = nodeMap.get(currentPath);
        if (dir) {
          dir.fileCount = (dir.fileCount || 0) + 1;
          dir.totalSize = (dir.totalSize || 0) + (file.size || 0);
        }
      }
      // Update root stats
      root.fileCount = (root.fileCount || 0) + 1;
      root.totalSize = (root.totalSize || 0) + (file.size || 0);
    }
  }

  // Sort children: directories first, then alphabetically
  sortTreeNodes(root);

  return root;
}

/**
 * Recursively sort tree nodes
 * Directories appear first, then files, all alphabetically
 */
function sortTreeNodes(node: FileNode): void {
  if (!node.children) return;

  node.children.sort((a, b) => {
    // Directories first
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    // Then alphabetically
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  // Recursively sort children
  for (const child of node.children) {
    sortTreeNodes(child);
  }
}

/**
 * Generate unique hash for path
 * Used as node ID for React keys
 */
function hashPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `node_${Math.abs(hash)}`;
}

/**
 * Find node by path
 * @param root Tree root
 * @param path File path to find
 * @returns Node if found, undefined otherwise
 */
export function findNodeByPath(root: FileNode, path: string): FileNode | undefined {
  if (root.path === path) return root;

  if (!root.children) return undefined;

  for (const child of root.children) {
    if (child.path === path) return child;
    const found = findNodeByPath(child, path);
    if (found) return found;
  }

  return undefined;
}

/**
 * Get breadcrumb path from root to node
 * @param root Tree root
 * @param path Target path
 * @returns Array of nodes from root to target
 */
export function getBreadcrumbPath(root: FileNode, path: string): FileNode[] {
  const breadcrumb: FileNode[] = [root];

  if (path === '/') return breadcrumb;

  const parts = path.split('/').filter(Boolean);
  let currentPath = '';

  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
    const node = findNodeByPath(root, currentPath);
    if (node) {
      breadcrumb.push(node);
    }
  }

  return breadcrumb;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format date for display
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString();
  } catch {
    return dateStr;
  }
}

/**
 * Count total files in tree (including nested)
 */
export function countTotalFiles(node: FileNode): number {
  let count = node.type === 'file' ? 1 : 0;

  if (node.children) {
    for (const child of node.children) {
      count += countTotalFiles(child);
    }
  }

  return count;
}

/**
 * Calculate total size in tree
 */
export function calculateTotalSize(node: FileNode): number {
  let total = node.size || 0;

  if (node.children) {
    for (const child of node.children) {
      total += calculateTotalSize(child);
    }
  }

  return total;
}

/**
 * Filter tree by search term (returns matching nodes and their parents)
 */
export function filterTree(root: FileNode, searchTerm: string): FileNode {
  const lowerSearch = searchTerm.toLowerCase();

  function filterNode(node: FileNode): FileNode | null {
    // Check if current node matches
    const matches = node.name.toLowerCase().includes(lowerSearch);

    let filteredChildren: FileNode[] = [];
    if (node.children) {
      for (const child of node.children) {
        const filtered = filterNode(child);
        if (filtered) {
          filteredChildren.push(filtered);
        }
      }
    }

    // Include node if it matches or has matching children
    if (matches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren.length > 0 ? filteredChildren : node.children,
        isExpanded: filteredChildren.length > 0, // Auto-expand if has matches
      };
    }

    return null;
  }

  const filtered = filterNode(root);
  return filtered || root;
}

/**
 * Flatten tree to array with depth info (for virtual rendering)
 */
export interface FlatFileNode extends FileNode {
  depth: number;
  index: number;
  hasVisibleChildren: boolean;
  isExpanded: boolean;
}

export function flattenTree(root: FileNode, expandedPaths: Set<string> = new Set()): FlatFileNode[] {
  const result: FlatFileNode[] = [];
  let index = 0;

  function traverse(node: FileNode, depth: number = 0): void {
    if (depth > 0) {
      // Skip root itself, but process its children
      result.push({
        ...node,
        depth,
        index: index++,
        hasVisibleChildren: node.children ? node.children.length > 0 : false,
        isExpanded: expandedPaths.has(node.path),
      });
    }

    if (node.children && expandedPaths.has(node.path)) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  traverse(root);
  return result;
}
