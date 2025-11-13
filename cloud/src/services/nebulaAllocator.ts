import { supabase } from '../lib/supabaseClient';
import * as net from 'net';

/**
 * Nebula IP Allocator Service
 * Manages atomic allocation of Nebula IPs from the pool for devices in a project.
 */

export interface AllocationResult {
  success: boolean;
  ip?: string;
  error?: string;
}

/**
 * Pre-populate the nebula_ip_pool for a project with a range of IPs.
 * Call this once per project to fill the pool.
 * Example: allocateProjectPool('project-123', '10.99.1.0/24') will create IPs 10.99.1.1 through 10.99.1.254
 */
export async function populateProjectPool(
  projectId: string,
  subnetCIDR: string
): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    // Parse CIDR to get base IP and prefix length
    const parts = subnetCIDR.split('/');
    if (parts.length !== 2) {
      return { success: false, error: 'Invalid CIDR notation' };
    }

    const [baseIp, prefixStr] = parts;
    const prefix = parseInt(prefixStr, 10);

    if (!net.isIPv4(baseIp) || prefix < 0 || prefix > 32) {
      return { success: false, error: 'Invalid subnet' };
    }

    // Generate IPs in the range (simplified: assumes /24 or similar)
    // For /24: generate .1 through .254 (skip .0 and .255)
    const ips: string[] = [];
    if (prefix === 24) {
      const parts = baseIp.split('.').map(Number);
      for (let i = 1; i < 255; i++) {
        ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}/32`);
      }
    } else if (prefix <= 16) {
      // For /16 or smaller, generate a reasonable subset
      const parts = baseIp.split('.').map(Number);
      for (let i = 1; i <= 100; i++) {
        // Limit to 100 IPs per project for safety
        ips.push(`${parts[0]}.${parts[1]}.${parts[2]}.${i}/32`);
      }
    } else {
      return { success: false, error: 'Unsupported prefix length; use /24 or /16' };
    }

    // Batch insert IPs into nebula_ip_pool (avoiding duplicates)
    const { error } = await supabase
      .from('nebula_ip_pool')
      .insert(
        ips.map((ip) => ({
          project_id: projectId,
          ip,
        }))
      )
      .eq('project_id', projectId);

    if (error) {
      console.error('[Nebula] Pool population error:', error);
      return { success: false, error: error.message };
    }

    console.log(`[Nebula] Populated pool for project ${projectId} with ${ips.length} IPs`);
    return { success: true, count: ips.length };
  } catch (err: any) {
    console.error('[Nebula] Pool population exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Allocate a single Nebula IP from the pool for a device.
 * Calls the allocate_nebula_ip() DB function for atomic, race-safe allocation.
 */
export async function allocateNebulaIp(
  projectId: string,
  deviceId: string,
  allocatedBy: string
): Promise<AllocationResult> {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    // Call the Postgres function via RPC
    const { data, error } = await supabase.rpc('allocate_nebula_ip', {
      p_project_id: projectId,
      p_device_id: deviceId,
      p_allocated_by: allocatedBy,
    });

    if (error) {
      console.error(
        `[Nebula] Allocation failed for device ${deviceId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Allocation returned no IP' };
    }

    console.log(`[Nebula] Allocated IP ${data} to device ${deviceId}`);
    return { success: true, ip: String(data) };
  } catch (err: any) {
    console.error('[Nebula] Allocation exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Release a Nebula IP allocation for a device.
 */
export async function releaseNebulaIp(deviceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabase) {
      return { success: false, error: 'Supabase not initialized' };
    }

    const { error } = await supabase.rpc('release_nebula_ip_by_device', {
      p_device_id: deviceId,
    });

    if (error) {
      console.error(`[Nebula] Release failed for device ${deviceId}:`, error.message);
      return { success: false, error: error.message };
    }

    console.log(`[Nebula] Released IP for device ${deviceId}`);
    return { success: true };
  } catch (err: any) {
    console.error('[Nebula] Release exception:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get current allocation status for a device.
 */
export async function getDeviceAllocation(deviceId: string): Promise<{ ip?: string; error?: string }> {
  try {
    if (!supabase) {
      return { error: 'Supabase not initialized' };
    }

    const { data, error } = await supabase
      .from('nebula_ip_pool')
      .select('ip')
      .eq('allocated_to_device_id', deviceId)
      .maybeSingle();

    if (error) {
      return { error: error.message };
    }

    return { ip: data?.ip };
  } catch (err: any) {
    return { error: err.message };
  }
}

/**
 * List all allocations for a project (admin/debug).
 */
export async function listProjectAllocations(projectId: string): Promise<
  Array<{ ip: string; device_id: string | null; allocated_at: string }>
> {
  try {
    if (!supabase) {
      return [];
    }

    const { data } = await supabase
      .from('nebula_ip_pool')
      .select('ip, allocated_to_device_id, allocated_at')
      .eq('project_id', projectId)
      .order('ip', { ascending: true });

    return (
      data?.map((row: any) => ({
        ip: row.ip,
        device_id: row.allocated_to_device_id,
        allocated_at: row.allocated_at || 'unallocated',
      })) || []
    );
  } catch (err: any) {
    console.error('[Nebula] List allocations error:', err);
    return [];
  }
}
