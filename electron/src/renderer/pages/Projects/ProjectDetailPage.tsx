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
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [remoteInvite, setRemoteInvite] = useState<string>('');
  const [pairingStatus, setPairingStatus] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [nebulaStatus, setNebulaStatus] = useState<any>(null);
  const [showWizard, setShowWizard] = useState<boolean>(false);
  const [files, setFiles] = useState<Array<{ name: string; isDirectory: boolean }>>([]);
  const [fileStatuses, setFileStatuses] = useState<Record<string, 'red' | 'yellow' | 'green'>>({});
  const [fileProgress, setFileProgress] = useState<Record<string, number>>({});

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
      // Ensure Syncthing is running and fetch device id for UI pairing.
      (async () => {
        try {
          // Start Syncthing for this project (no-op if already running)
          await (window as any).api.syncthingStartForProject(projectId, (project as any).local_path);

          // Poll for device id for up to 15s
          const start = Date.now();
          let found = null;
          while (Date.now() - start < 15000) {
            try {
              const r = await (window as any).api.syncthingGetDeviceId(projectId);
              if (r?.ok && r.id) { found = r.id; break; }
            } catch (e) {
              // ignore and retry
            }
            await new Promise((res) => setTimeout(res, 1000));
          }
          if (found) setDeviceId(found);
        } catch (e) {
          // ignore — deviceId will remain null and UI will show helpful messages
        }
      })();
    }
  }, [project]);

  // Poll Syncthing for active transfers and completion to surface per-file progress
  useEffect(() => {
    let mounted = true;
    const pollProgress = async () => {
      if (!projectId) return;
      try {
        const s = await (window as any).api.syncthingProgressForProject(projectId);
        if (!mounted) return;
        if (s && s.success) {
          const active = s.activeTransfers || [];
          const progressMap: Record<string, number> = {};
          for (const a of active) {
            const name = a.file || a.path || a.filename || '';
            const done = Number(a.bytesDone || 0);
            const total = Number(a.bytesTotal || 0) || 0;
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;
            if (name) progressMap[name] = percent;
          }
          setFileProgress(progressMap);

          // Update fileStatuses heuristically based on progress
          setFileStatuses((prev) => {
            const next = { ...prev };
            for (const f of files) {
              const p = progressMap[f.name];
              if (p >= 100) next[f.name] = 'green';
              else if (p > 0) next[f.name] = 'yellow';
              else if (!next[f.name]) next[f.name] = 'red';
            }
            return next;
          });
        }
      } catch (e) {
        // ignore
      }
      if (mounted) setTimeout(pollProgress, 2000);
    };
    pollProgress();
    return () => { mounted = false; };
  }, [projectId, files]);

  // If we created a token, poll for acceptor_device_id
  useEffect(() => {
    if (!createdToken) return;
    let mounted = true;
    const poll = async () => {
      try {
        const resp = await cloudAPI.get(`/pairings/${createdToken}`);
        const data = resp.data;
        if (data.acceptor_device_id) {
          setTokenStatus(`Accepted by ${data.acceptor_device_id}`);
          // import remote device into our local syncthing config
          try {
            await (window as any).api.syncthingImportRemote(projectId, data.acceptor_device_id, 'peer');
          } catch (e) {}
          return;
        }
      } catch (e) {
        // ignore
      }
      if (mounted) setTimeout(poll, 2000);
    };
    poll();
    return () => { mounted = false; };
  }, [createdToken]);

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
                  <span style={{ color: '#10B981' }}>✓ Folder synced</span>
                ) : syncthingStatus?.running ? (
                  <span style={{ color: '#F59E0B' }}>↻ Syncing...</span>
                ) : (
                  <span style={{ color: '#6B7280' }}>○ Not syncing</span>
                )}
                {syncthingStatus?.running && !syncthingStatus?.pid && syncthingStatus?.apiKey ? (
                  <span style={{ marginLeft: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <button className="ml-3 bg-gray-200 px-2 py-1 rounded" onClick={async () => {
                      try { await (window as any).api.syncthingOpenGui(projectId); } catch (e) { console.error('Failed to open sync details', e); }
                    }}>View sync details</button>
                  </span>
                ) : null}
              </span>
              <div style={{ display: 'inline-block', marginLeft: 12 }}>
                <button className="bg-indigo-600 text-white px-3 py-1 rounded" onClick={handleGenerateNebula}>
                  Set up network connection
                </button>
                {nebulaStatus ? (
                  nebulaStatus.success ? (
                    <div style={{ marginLeft: 8, marginTop: 8 }}>
                      <span style={{ color: '#10B981' }}>✓ Network configured at:</span>
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
                        View files
                      </button>
                    </div>
                  ) : (
                    <div style={{ marginLeft: 8, color: '#EF4444', marginTop: 8 }}>
                      ✗ Error: {String(nebulaStatus.error)}
                    </div>
                  )
                ) : null}
              </div>
              <div style={{ marginTop: 12 }}>
                <h5 className="font-medium">Connect & Sync with Devices</h5>
                
                <div style={{ marginTop: 8, marginBottom: 12, padding: 10, backgroundColor: '#F0F9FF', borderRadius: 4, border: '1px solid #BAE6FD' }}>
                  <div style={{ marginBottom: 8 }}>
                    <button 
                      className="bg-purple-600 text-white px-3 py-1 rounded"
                      onClick={async () => {
                        setPairingStatus('Generating invite code...');
                        try {
                          const resp = await cloudAPI.post('/pairings', {
                            projectId,
                            fromDeviceId: deviceId,
                            expiresIn: 3600
                          });
                          if (resp.data?.token) {
                            setCreatedToken(resp.data.token);
                            setPairingStatus(`✓ Invite created! Share code: ${resp.data.token}`);
                          }
                        } catch (e) {
                          setPairingStatus('Failed to generate invite: ' + String(e));
                        }
                      }}
                    >
                      Generate Invite Code
                    </button>
                  </div>
                  
                  {createdToken && (
                    <div style={{ backgroundColor: '#ECFDF5', padding: 8, borderRadius: 4, marginBottom: 8 }}>
                      <strong style={{ color: '#065F46' }}>Share this code with another device:</strong>
                      <code style={{ display: 'block', marginTop: 4, padding: 8, backgroundColor: '#F0FDF4', fontWeight: 'bold', fontSize: '1.1em', letterSpacing: '0.1em', fontFamily: 'monospace' }}>
                        {createdToken}
                      </code>
                      <button 
                        onClick={() => navigator.clipboard.writeText(createdToken)}
                        className="bg-green-600 text-white px-2 py-1 rounded mt-2 text-sm"
                      >
                        Copy Invite Code
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 8 }}>
                    <strong>Your Device Code:</strong>
                    <div style={{ marginTop: 6 }}>
                      <code style={{ backgroundColor: '#f3f4f6', padding: '6px 8px', borderRadius: 4 }}>{deviceId || 'Starting...'}</code>
                      <button className="ml-3 bg-gray-200 px-2 py-1 rounded" onClick={async () => {
                        try { await navigator.clipboard.writeText(deviceId || ''); } catch (e) {}
                      }}>Copy</button>
                    </div>
                  </div>

                  <div>
                    <strong>Connect with another device (paste their code)</strong>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                      <input value={remoteInvite} onChange={(e) => setRemoteInvite(e.target.value)} placeholder="Paste device code or invite token here" className="border p-2 flex-1" />
                      <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={async () => {
                        if (!remoteInvite) return;
                        setPairingStatus('Importing...');
                        try {
                          // If input looks like a token (short hex), try cloud lookup first
                          const isToken = /^[0-9a-f]{12}$/i.test(remoteInvite);
                          if (isToken) {
                            // Fetch invite from cloud
                            const r = await cloudAPI.get(`/pairings/${remoteInvite}`);
                            const d = r.data;
                            if (!d || !d.from_device_id) { setPairingStatus('Invalid invite token'); return; }
                            // Import inviter device id
                            await (window as any).api.syncthingStartForProject(projectId, localPath);
                            const res = await (window as any).api.syncthingImportRemote(projectId, d.from_device_id, 'remote');
                            if (res?.success) {
                              // Accept the invite by posting our device id
                              const ourIdResp = await (window as any).api.syncthingGetDeviceId(projectId);
                              const ourId = ourIdResp?.id;
                              if (ourId) {
                                await cloudAPI.post(`/pairings/${remoteInvite}/accept`, { acceptorDeviceId: ourId });
                              }
                              setPairingStatus('Device connected. Files will sync shortly.');
                            } else {
                              setPairingStatus('Failed to connect device: ' + (res?.error || JSON.stringify(res)));
                            }
                          } else {
                            // Treat as device ID
                            await (window as any).api.syncthingStartForProject(projectId, localPath);
                            const res = await (window as any).api.syncthingImportRemote(projectId, remoteInvite, 'remote');
                            if (res?.success) setPairingStatus('Device connected.'); else setPairingStatus('Failed: ' + (res?.error || JSON.stringify(res)));
                          }
                        } catch (e: any) {
                          setPairingStatus('Error: ' + String(e));
                        }
                      }}>Connect Device</button>
                    </div>
                    {pairingStatus ? <div style={{ marginTop: 8 }}>{pairingStatus}</div> : null}
                  </div>
                </div>
              </div>
            </div>
              <div style={{ marginTop: 12 }}>
                <h5 className="font-medium">Create cloud invite</h5>
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={async () => {
                    try {
                      setCreatedToken(null);
                      setTokenStatus('Ensuring Syncthing is running...');
                      // Ensure syncthing is running and device id is available
                      await (window as any).api.syncthingStartForProject(projectId, localPath);
                      const start = Date.now();
                      let ourId: string | null = null;
                      while (Date.now() - start < 15000) {
                        try {
                          const ourIdResp = await (window as any).api.syncthingGetDeviceId(projectId);
                          if (ourIdResp?.ok && ourIdResp.id) { ourId = ourIdResp.id; break; }
                        } catch (e) {}
                        await new Promise((r) => setTimeout(r, 1000));
                      }
                      if (!ourId) { setTokenStatus('Failed to read local device ID'); return; }
                      setTokenStatus('Creating token...');
                      const r = await cloudAPI.post('/pairings', { projectId, fromDeviceId: ourId, expiresIn: 300 });
                      const t = r.data.token;
                      setCreatedToken(t);
                      setTokenStatus('Token created: ' + t + ' — waiting for acceptor...');
                    } catch (e: any) {
                      setTokenStatus('Error creating token: ' + String(e));
                    }
                  }}>Create Invite Token</button>
                  {createdToken ? <div style={{ display: 'flex', alignItems: 'center' }}><code style={{ backgroundColor: '#f3f4f6', padding: '6px 8px', borderRadius: 4 }}>{createdToken}</code>
                  <button className="ml-3 bg-gray-200 px-2 py-1 rounded" onClick={() => { try { navigator.clipboard.writeText(createdToken || ''); } catch (e) {} }}>Copy</button></div> : null}
                </div>
                {tokenStatus ? <div style={{ marginTop: 8 }}>{tokenStatus}</div> : null}
              </div>

            <ul>
              {files.map((f) => (
                <li key={f.name} className="flex items-center py-1">
                  <div className="w-4 h-4 mr-3 rounded-full" style={{ backgroundColor: fileStatuses[f.name] === 'green' ? '#10B981' : fileStatuses[f.name] === 'yellow' ? '#F59E0B' : '#EF4444' }} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span>{f.name}{f.isDirectory ? '/' : ''}</span>
                      {fileProgress[f.name] !== undefined && fileProgress[f.name] > 0 ? <span style={{ fontSize: '0.85em', color: '#6B7280', marginLeft: 8 }}>{fileProgress[f.name]}%</span> : null}
                    </div>
                    {fileProgress[f.name] !== undefined && fileProgress[f.name] > 0 && fileProgress[f.name] < 100 ? (
                      <div style={{ width: '100%', height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${fileProgress[f.name]}%`, backgroundColor: fileProgress[f.name] < 50 ? '#F59E0B' : '#10B981', transition: 'width 0.3s ease' }} />
                      </div>
                    ) : null}
                  </div>
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
