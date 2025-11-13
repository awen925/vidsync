import React, { useState } from 'react';

interface Props {
  projectId: string;
  onClose?: () => void;
}

const SetupWizard: React.FC<Props> = ({ projectId, onClose }) => {
  const [base64, setBase64] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [nebulaLogs, setNebulaLogs] = useState<string[]>([]);
  const [syncthingLogs, setSyncthingLogs] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);
  const [elevating, setElevating] = useState(false);
  const [elevateOutput, setElevateOutput] = useState<string | null>(null);

  const handlePaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => setBase64(e.target.value);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const buf = await f.arrayBuffer();
    const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    };
    const b64 = arrayBufferToBase64(buf);
    setBase64(b64);
  };

  const handleExtract = async () => {
    if (!base64) {
      setStatus('Please paste or upload a ZIP bundle first');
      return;
    }
    setWorking(true);
    setStatus('Saving bundle and extracting...');
    try {
      const res = await (window as any).api.bundleExtract(projectId, base64);
      if (res?.ok) {
        setLastResult(res);
        setStatus(JSON.stringify(res, null, 2));
        setDir(res.dir);
      } else {
        setStatus('Extraction failed: ' + (res?.error || 'unknown'));
      }
    } catch (e: any) {
      setStatus('Error: ' + String(e));
    } finally {
      setWorking(false);
    }
  };

  const handleApplySetcap = async () => {
    // Try to extract path from last status JSON if present
    try {
      const cmd: string | undefined = lastResult?.setcapCmd;
      if (!cmd) {
        setStatus('No setcap command available in status.');
        return;
      }
      const parts = cmd.split(' ');
      const binaryPath = parts[parts.length - 1];
      const res = await (window as any).api.applySetcap(binaryPath);
      setStatus('applySetcap result: ' + JSON.stringify(res, null, 2));
      if (res?.ok) {
        // After applying setcap, attempt to start nebula and wait for TUN, then start syncthing
        setStatus('setcap applied — starting Nebula and waiting for TUN assignment...');
        const nres = await (window as any).api.nebulaStart(projectId);
        if (nres?.success) {
          const tun = await (window as any).api.nebulaWaitForTun(30000);
          if (tun?.ok) {
            setStatus('TUN acquired: ' + tun.ip + '. Starting Syncthing...');
            await (window as any).api.syncthingStartForProject(projectId);
            setStatus('Syncthing start requested. Onboarding complete.');
          } else {
            setStatus('Nebula did not acquire TUN within timeout: ' + JSON.stringify(tun));
          }
        } else {
          setStatus('Nebula failed to start after setcap: ' + JSON.stringify(nres));
        }
      }
    } catch (e: any) {
      setStatus('applySetcap error: ' + String(e));
    }
  };

  const handleElevateSetcap = async () => {
    try {
      const cmd: string | undefined = lastResult?.setcapCmd;
      if (!cmd) {
        setStatus('No setcap command available in status.');
        return;
      }
      const parts = cmd.split(' ');
      const binaryPath = parts[parts.length - 1];
      try {
        setElevating(true);
        setElevateOutput(null);
        setStatus('Requesting elevation...');
        const res = await (window as any).api.elevateSetcap(binaryPath);
        setElevating(false);
        setElevateOutput(JSON.stringify(res, null, 2));
        if (res?.ok) {
          setStatus('Elevation succeeded. setcap applied. Starting Nebula...');
          // Start Nebula and wait for TUN, then start Syncthing
          const nres = await (window as any).api.nebulaStart(projectId);
          if (nres?.success) {
            setStatus('Nebula started. Waiting up to 30s for TUN assignment...');
            const tun = await (window as any).api.nebulaWaitForTun(30000);
            if (tun?.ok) {
              setStatus('TUN acquired: ' + tun.ip + '. Starting Syncthing...');
              await (window as any).api.syncthingStartForProject(projectId);
              setStatus('Syncthing start requested. Onboarding complete.');
            } else {
              setStatus('Nebula did not acquire TUN within timeout: ' + JSON.stringify(tun));
            }
          } else {
            setStatus('Nebula failed to start after elevation: ' + JSON.stringify(nres));
          }
        } else {
          setStatus('Elevation failed: ' + (res?.message || res?.error || JSON.stringify(res)));
        }
      } catch (e: any) {
        setElevating(false);
        setStatus('elevateSetcap error: ' + String(e));
      }
    } catch (e: any) {
      setElevating(false);
      setStatus('elevateSetcap error: ' + String(e));
    }
  };

  const handleStartNebula = async () => {
    setStatus('Starting Nebula...');
    try {
      const res = await (window as any).api.nebulaStart(projectId);
      if (res?.success) setStatus('Nebula start requested. Check status panel for runtime status.');
      else setStatus('Nebula failed to start: ' + (res?.error || 'unknown'));
    } catch (e: any) {
      setStatus('Nebula start error: ' + String(e));
    }
  };

  React.useEffect(() => {
    const nebCb = (m: string) => setNebulaLogs((s) => [...s.slice(-500), m]);
    const synCb = (m: string) => setSyncthingLogs((s) => [...s.slice(-500), m]);
    try {
      (window as any).api.onNebulaLog(nebCb);
      (window as any).api.onSyncthingLog(synCb);
    } catch (e) {
      // ignore
    }
    return () => {
      // no-op: ipcRenderer.on persists; in real app we'd remove listeners via ipcRenderer.removeListener
    };
  }, []);

  const handleStatus = async () => {
    try {
      const s = await (window as any).api.processGetStatus();
      setStatus('Agent: ' + JSON.stringify(s.agent) + '\nSyncthing: ' + JSON.stringify(s.syncthing));
    } catch (e: any) {
      setStatus('Failed to get status: ' + String(e));
    }
  };

  return (
    <div style={{ padding: 12, border: '1px solid #e5e7eb', borderRadius: 6, background: '#ffffff' }}>
      <h3>Nebula Setup Wizard</h3>
      <p style={{ color: '#6b7280' }}>Paste the base64 ZIP bundle you received from the cloud, or upload the ZIP file.</p>
      <div style={{ marginTop: 8 }}>
        <input type="file" accept=".zip" onChange={handleFile} />
      </div>
      <div style={{ marginTop: 8 }}>
        <textarea value={base64} onChange={handlePaste} rows={6} style={{ width: '100%', fontSize: 12 }} placeholder="Paste base64 ZIP bundle here" />
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <button onClick={handleExtract} disabled={working} className="bg-indigo-600 text-white px-3 py-1 rounded">Extract Bundle</button>
        <button onClick={handleStartNebula} disabled={working} className="bg-green-600 text-white px-3 py-1 rounded">Start Nebula</button>
        <button onClick={handleStatus} className="bg-gray-700 text-white px-3 py-1 rounded">Get Status</button>
        <button onClick={onClose} className="bg-transparent text-gray-700 px-3 py-1 rounded">Close</button>
      </div>

      <div style={{ marginTop: 12 }}>
        <pre style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 8, borderRadius: 6 }}>{status}</pre>
        {dir ? <div style={{ marginTop: 8 }}>Extracted to: <code>{dir}</code></div> : null}
        <div style={{ marginTop: 12 }}>
            <h4>Nebula logs</h4>
          <div style={{ maxHeight: 160, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6 }}>
            {nebulaLogs.map((l, i) => <div key={i} style={{ fontFamily: 'monospace', fontSize: 12 }}>{l}</div>)}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <h4>Syncthing logs</h4>
          <div style={{ maxHeight: 160, overflow: 'auto', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6 }}>
            {syncthingLogs.map((l, i) => <div key={i} style={{ fontFamily: 'monospace', fontSize: 12 }}>{l}</div>)}
          </div>
        </div>
          {lastResult?.setcapCmd ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleApplySetcap} className="bg-yellow-600 text-white px-3 py-1 rounded">Apply setcap (if app is root)</button>
                <button onClick={handleElevateSetcap} className="bg-orange-600 text-white px-3 py-1 rounded">Apply setcap (with elevation)</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>Suggested command: <code>{lastResult.setcapCmd}</code></div>
            </div>
          ) : null}
        {elevating ? (
          <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 520, background: '#fff', borderRadius: 8, padding: 16 }}>
              <h3>Applying capability (setcap)</h3>
              <p>Please confirm the elevation prompt that may appear. This allows Nebula to create network interfaces.
              </p>
              <div style={{ marginTop: 12 }}>
                <pre style={{ maxHeight: 240, overflow: 'auto', background: '#f3f4f6', padding: 8 }}>{elevateOutput || 'Waiting for elevation...'}</pre>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => { setElevating(false); setElevateOutput(null); }} className="bg-gray-200 px-3 py-1 rounded">Close</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SetupWizard;
