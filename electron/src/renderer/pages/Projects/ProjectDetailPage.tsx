import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cloudAPI } from '../../hooks/useCloudApi';
import SetupWizard from '../../components/SetupWizard';

interface Project {
  id: string;
  name: string;
  description?: string | null;
}

interface Device {
  id: string;
  device_id: string;
  device_name: string;
}

const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [assignedDevices, setAssignedDevices] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [localPath, setLocalPath] = useState<string | null>(null);
  const [syncthingStatus, setSyncthingStatus] = useState<any>({ running: false, folderConfigured: false });
  const [nebulaStatus, setNebulaStatus] = useState<any>(null);
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [files, setFiles] = useState<Array<{ name: string; isDirectory: boolean }>>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, 'red' | 'yellow' | 'green'>>({});

  const fetchProject = async () => {
    try {
      const resp = await cloudAPI.get(`/projects/${projectId}`);
      setProject(resp.data.project);
      setAssignedDevices(resp.data.devices || []);
    } catch (err) {
      console.error('Failed to fetch project', err);
    }
  };

  const fetchDevices = async () => {
    try {
      const resp = await cloudAPI.get('/devices');
      setDevices(resp.data.devices || []);
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  };

  useEffect(() => {
    fetchProject();
    fetchDevices();
    // if project has local_path, set it and load files
    // (project may not be loaded yet)
  }, [projectId]);

  // Poll syncthing status periodically for this project
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (!projectId) return;
      try {
        const s = await (window as any).api.syncthingStatusForProject(projectId);
        if (mounted) setSyncthingStatus(s || { running: false, folderConfigured: false });
      } catch (e) {
        // ignore
      }
    };
    poll();
    const tid = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(tid); };
  }, [projectId]);

  useEffect(() => {
    if (project && (project as any).local_path) {
      setLocalPath((project as any).local_path);
      loadFiles((project as any).local_path);
      
      // Start Syncthing for this project with the local path
      startSyncthingForProject((project as any).local_path);
    }
  }, [project]);

  const chooseFolder = async () => {
    const chosen = await (window as any).api.openDirectory();
    if (chosen) {
      setLocalPath(chosen);
      loadFiles(chosen);
      // Start Syncthing when folder is chosen
      startSyncthingForProject(chosen);
    }
  };

  const handleGenerateNebula = async () => {
    if (!projectId) return;
    setNebulaStatus({ status: 'generating' });
    try {
      const res = await (window as any).api.nebulaGenerateConfig(projectId, { hostname: (project && (project as any).name) || undefined });
      setNebulaStatus(res);
    } catch (e: any) {
      setNebulaStatus({ success: false, error: e?.message || String(e) });
    }
  };

  const handleOpenNebulaFolder = async () => {
    if (!projectId) return;
    try {
      await (window as any).api.nebulaOpenFolder(projectId);
    } catch (e: any) {
      console.error('Failed to open nebula folder:', e);
    }
  };

  const startSyncthingForProject = async (localPath: string) => {
    try {
      const result = await (window as any).api.syncthingStartForProject(projectId, localPath);
      if (result.success) {
        console.log('Syncthing started for project:', projectId);
      } else {
        console.error('Failed to start Syncthing:', result.error);
      }
    } catch (err) {
      console.error('Error starting Syncthing:', err);
    }
  };

  const loadFiles = async (dir: string) => {
    try {
      const resp = await (window as any).api.fsListDir(dir);
      if (resp?.entries) {
        setFiles(resp.entries);
        // fetch per-file sync status
        for (const e of resp.entries) {
          const filePath = e.name; // using name only; can be improved to relative path
          try {
            const ev = await cloudAPI.get(`/projects/${projectId}/sync-events`, { params: { file: filePath, limit: 1 } });
            const events = ev.data.events || [];
            const status = deriveStatusFromEvents(events, project);
            setFileStatuses((s) => ({ ...s, [filePath]: status }));
          } catch (err) {
            // fallback to global project device sync percentage
            const status = deriveStatusFromEvents([], project);
            setFileStatuses((s) => ({ ...s, [filePath]: status }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to list files', err);
    }
  };

  const deriveStatusFromEvents = (events: any[], project: any): 'red' | 'yellow' | 'green' => {
    // Prefer per-file events if available
    if (events && events.length > 0) {
      const latest = events[0];
      const t = latest.event_type;
      const ageMs = Date.now() - new Date(latest.created_at).getTime();
      if (t === 'scanStart' || ageMs < 5000) return 'yellow';
      if (t === 'scanComplete' || t === 'fileUpdate') return 'green';
      if (t === 'delete' || t === 'error') return 'red';
    }

    // Fallback: look at project devices sync_percentage
    try {
      const devicesSync = (project && project.devices) || [];
      if (devicesSync.length === 0) return 'red';
      // if any device has sync_percentage < 100 and > 0 => yellow
      const nums = devicesSync.map((d: any) => Number(d.sync_percentage || 0));
      if (nums.every((n: number) => n === 100)) return 'green';
      if (nums.some((n: number) => n > 0 && n < 100)) return 'yellow';
      return 'red';
    } catch (e) {
      return 'red';
    }
  };

  const handleAssign = async () => {
    if (!selectedDevice) return;
    try {
      await cloudAPI.post(`/projects/${projectId}/devices`, { deviceId: selectedDevice });
      await fetchProject();
    } catch (err) {
      console.error('Failed to assign device', err);
    }
  };

  const handleUnassign = async (deviceId: string) => {
    try {
      await cloudAPI.delete(`/projects/${projectId}/devices/${deviceId}`);
      await fetchProject();
    } catch (err) {
      console.error('Failed to unassign device', err);
    }
  };

  return (
    <div className="p-4">
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={() => setShowWizard(true)}>Onboard Nebula</button>
      </div>
      {showWizard ? <div style={{ marginTop: 12 }}><SetupWizard projectId={projectId!} onClose={() => setShowWizard(false)} /></div> : null}
      <h2 className="text-2xl font-semibold mb-4">Project</h2>
      {project ? (
        <div>
          <h3 className="text-xl">{project.name}</h3>
          {project.description ? <p className="text-sm text-gray-600">{project.description}</p> : null}

          <div className="mt-4">
            <h4 className="font-medium">Assigned Devices</h4>
            <ul>
              {assignedDevices.map((d: any) => (
                <li key={d.device_id} className="flex items-center justify-between py-2">
                  <div>{d.device_id}</div>
                  <div>
                    <button
                      className="text-red-600"
                      onClick={() => handleUnassign(d.device_id)}
                    >
                      Unassign
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <h4 className="font-medium">Assign a Device</h4>
            <select
              className="border p-2 mr-2"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
            >
              <option value="">Select device</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.device_name} ({d.device_id})
                </option>
              ))}
            </select>
            <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={handleAssign}>
              Assign
            </button>
          </div>

          <div className="mt-6">
            <h4 className="font-medium">Files</h4>
            <div className="mb-2">
              <button className="bg-gray-700 text-white px-3 py-1 rounded mr-2" onClick={chooseFolder}>
                Choose Folder
              </button>
              {localPath ? <span className="text-sm text-gray-600">{localPath}</span> : <span className="text-sm text-gray-500">No folder selected</span>}
              <span style={{ marginLeft: 12 }}>
                {syncthingStatus?.folderConfigured ? (
                  <span style={{ color: '#10B981' }}>Syncthing folder configured</span>
                ) : syncthingStatus?.running ? (
                  <span style={{ color: '#F59E0B' }}>Syncthing running — folder not configured</span>
                ) : (
                  <span style={{ color: '#6B7280' }}>Syncthing stopped</span>
                )}
              </span>
              <div style={{ display: 'inline-block', marginLeft: 12 }}>
                <button className="bg-indigo-600 text-white px-3 py-1 rounded" onClick={handleGenerateNebula}>
                  Generate Nebula Config
                </button>
                {nebulaStatus ? (
                  nebulaStatus.success ? (
                    <div style={{ marginLeft: 8, marginTop: 8 }}>
                      <span style={{ color: '#10B981' }}>✓ Config generated at:</span>
                      <br />
                      <code style={{ fontSize: '0.85em', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '4px', display: 'inline-block', marginTop: 4 }}>
                        {nebulaStatus.dir}
                      </code>
                      <br />
                      <button
                        className="bg-blue-600 text-white px-3 py-1 rounded"
                        onClick={handleOpenNebulaFolder}
                        style={{ marginTop: 8 }}
                      >
                        Open Nebula Folder
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginLeft: 8, color: '#EF4444', marginTop: 8 }}>
                      ✗ Failed: {String(nebulaStatus.error)}
                    </div>
                  )
                ) : null}
              </div>
            </div>

            <ul>
              {files.map((f) => (
                <li key={f.name} className="flex items-center py-1">
                  <div className="w-4 h-4 mr-3 rounded-full" style={{ backgroundColor: fileStatuses[f.name] === 'green' ? '#10B981' : fileStatuses[f.name] === 'yellow' ? '#F59E0B' : '#EF4444' }} />
                  <div className="flex-1">{f.name}{f.isDirectory ? '/' : ''}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div>Loading project...</div>
      )}
    </div>
  );
};

export default ProjectDetailPage;
