# Nebula Certificate Authority Setup

This directory should contain:
1. `ca.crt` — CA certificate (from your AWS EC2 lighthouse)
2. `ca.key` — CA private key (required to sign node certificates)

## Setup

### Step 1: Copy CA files from AWS EC2

```bash
# From your AWS EC2 lighthouse server
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/path/to/ca.crt ./ca.crt
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/path/to/ca.key ./ca.key

# Or if using standard nebula install:
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/etc/nebula/ca.crt ./ca.crt
scp -i your-key.pem ec2-user@YOUR_LIGHTHOUSE_IP:/etc/nebula/ca.key ./ca.key
```

### Step 2: Set permissions

```bash
chmod 644 ca.crt
chmod 600 ca.key
```

### Step 3: Verify

```bash
ls -la *.crt *.key
# Should show:
# -rw-r--r-- ca.crt
# -rw------- ca.key
```

## Usage

- **NebulaManager** (Electron) reads `ca.crt` to include in device configs
- **Cloud API** (Node.js) reads both `ca.crt` and `ca.key` to sign new device certificates
- Device configs include the CA cert so devices can verify peer certificates

## Security Notes

- `ca.key` is highly sensitive — keep it secure
- Only the cloud backend should have read access
- Consider using a secrets manager in production
- Back it up securely with restricted access
