import React, { useState, useEffect } from 'react';
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
  CircularProgress,
  Chip,
} from '@mui/material';
import { LinkIcon, Users, Copy, Check, Loader } from 'lucide-react';
import { cloudAPI } from '../../hooks/useCloudApi';

interface InvitedUser {
  type: 'invited' | 'member';
  email?: string;
  userId?: string;
  role?: string;
  status?: string;
  invitedAt?: string;
  joinedAt?: string;
}

interface YourProjectSharedTabProps {
  projectId?: string;
  inviteCode: string;
  copiedCode: boolean;
  shareEmail: string;
  shareEmailError: string;
  onGenerateInvite: () => void;
  onCopyInvite: () => void;
  onShareEmailChange: (email: string) => void;
}

const YourProjectSharedTab: React.FC<YourProjectSharedTabProps> = ({
  projectId,
  inviteCode,
  copiedCode,
  shareEmail,
  shareEmailError,
  onGenerateInvite,
  onCopyInvite,
  onShareEmailChange,
}) => {
  const [invitedUsers, setInvitedUsers] = useState<InvitedUser[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (projectId) {
      fetchInvitedUsers();
    }
  }, [projectId]);

  const fetchInvitedUsers = async () => {
    if (!projectId) return;
    
    setLoading(true);
    try {
      const response = await cloudAPI.get(`/projects/${projectId}/invited-users`);
      const allUsers = [
        ...(response.data.invited || []),
        ...(response.data.members || []),
      ];
      setInvitedUsers(allUsers);
    } catch (error) {
      console.error('Failed to fetch invited users:', error);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'auto', p: 2 }}>
      {/* Members Table Section */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Project Members & Invited Users
        </Typography>
        <TableContainer component={Paper} elevation={0} sx={{ mb: 2, border: 1, borderColor: 'divider' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'action.hover' }}>
                <TableCell>Email/User</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Joined/Invited</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} sx={{ py: 3, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : invitedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} sx={{ py: 3, textAlign: 'center', color: 'text.secondary' }}>
                    No members or invites yet. Share an invite code to add collaborators.
                  </TableCell>
                </TableRow>
              ) : (
                invitedUsers.map((user, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{user.email || user.userId || 'Unknown'}</TableCell>
                    <TableCell>
                      <Chip 
                        label={user.role || 'Viewer'} 
                        size="small" 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={user.status || 'Pending'}
                        size="small"
                        color={user.status === 'accepted' ? 'success' : 'default'}
                        variant={user.status === 'accepted' ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                      {user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : (user.invitedAt ? new Date(user.invitedAt).toLocaleDateString() : '-')}
                    </TableCell>
                  </TableRow>
                ))
              )}
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
