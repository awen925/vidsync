# CA Certificate for Nebula PKI

This file should contain the Certificate Authority certificate from your AWS EC2 Nebula lighthouse server.

## Setup Instructions

1. **On your AWS EC2 lighthouse server**, copy the `ca.crt` file:
```bash
# If you generated it with nebula-cert:
scp ec2-user@your-lighthouse-ip:/path/to/ca.crt ./ca.crt

# Or if it's in a standard nebula install:
scp ec2-user@your-lighthouse-ip:/etc/nebula/ca.crt ./ca.crt
```

2. **Place it in this directory** (`cloud/bin/ca.crt`)

3. **Verify permissions**:
```bash
chmod 644 cloud/bin/ca.crt
ls -la cloud/bin/ca.crt
```

## Usage

The NebulaManager will read this CA cert and use it with `nebula-cert` to generate per-device certificates. When users click "Generate Nebula Config", the app will:

1. Generate a unique per-device certificate signed by this CA
2. Create nebula.yml config with the lighthouse server address
3. Bundle everything into a zip file for download

## Security Note

- Keep this CA cert safe — if compromised, all Nebula devices can be impersonated
- Use restrictive file permissions (mode 0644 minimum, consider 0600)
- Back it up securely
- Rotate regularly per your security policy
