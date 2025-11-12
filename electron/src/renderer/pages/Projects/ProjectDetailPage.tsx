import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { cloudAPI } from '../../hooks/useCloudApi';

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
  }, [projectId]);

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
        </div>
      ) : (
        <div>Loading project...</div>
      )}
    </div>
  );
};

export default ProjectDetailPage;
