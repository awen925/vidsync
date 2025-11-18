import React from 'react';
import {
  Box,
  Button,
  Stack,
  Typography,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Divider,
  TextField,
  Alert,
  IconButton,
} from '@mui/material';
import { LinkIcon, Users, Copy, Check } from 'lucide-react';

interface YourProjectSharedTabProps {
  inviteCode: string;
  copiedCode: boolean;
  shareEmail: string;
  shareEmailError: string;
  onGenerateInvite: () => void;
  onCopyInvite: () => void;
  onShareEmailChange: (email: string) => void;
}

const YourProjectSharedTab: React.FC<YourProjectSharedTabProps> = ({
  inviteCode,
  copiedCode,
  shareEmail,
  shareEmailError,
  onGenerateInvite,
  onCopyInvite,
  onShareEmailChange,
}) => {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', p: 2 }}>
      {/* Members Table Section */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Project Members
        </Typography>
        <TableContainer component={Paper} elevation={0} sx={{ mb: 2, border: 1, borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell colSpan={4} sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                  No members have joined this project yet. Share an invite code to add collaborators.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <Divider sx={{ my: 2 }} />

      {/* Sharing Options Section */}
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Share This Project
        </Typography>

        <Stack spacing={2}>
          <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Generate Invite Code
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Create a shareable link to invite others to this project.
            </Typography>
            {inviteCode && (
              <Box sx={{ mb: 2, p: 1.5, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                  }}
                >
                  {inviteCode}
                  <IconButton
                    disableRipple
                    size="small"
                    onClick={onCopyInvite}
                    title={copiedCode ? 'Copied!' : 'Copy'}
                    sx={{ flexShrink: 0 }}
                  >
                    {copiedCode ? (
                      <Check size={18} style={{ color: '#4CAF50' }} />
                    ) : (
                      <Copy size={18} />
                    )}
                  </IconButton>
                </Typography>
              </Box>
            )}
            <Button
              disableRipple
              variant="contained"
              startIcon={<LinkIcon size={16} />}
              onClick={onGenerateInvite}
              fullWidth
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {inviteCode ? 'Regenerate Invite Code' : 'Generate Invite Code'}
            </Button>
          </Box>

          <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1, opacity: 0.6 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Share by Email (Coming Soon)
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Invite specific people by email address.
            </Typography>
            <Stack spacing={1}>
              <TextField
                size="small"
                placeholder="user@example.com"
                value={shareEmail}
                onChange={(e) => {
                  onShareEmailChange(e.target.value);
                }}
                error={!!shareEmailError}
                helperText={shareEmailError}
                fullWidth
                disabled
              />
              <Button
                disableRipple
                variant="outlined"
                startIcon={<Users size={16} />}
                disabled
                fullWidth
                sx={{ textTransform: 'none' }}
              >
                Send Invite
              </Button>
            </Stack>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
};

export default YourProjectSharedTab;
