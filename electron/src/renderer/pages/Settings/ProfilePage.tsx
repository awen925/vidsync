import React, { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  TextField,
  Avatar,
  Card,
  CardContent,
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import {
  Mail,
  Phone,
  LocationOn,
  DateRange,
  Lock,
  Download,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useAppTheme } from '../../theme/AppThemeProvider';

const ProfilePage: React.FC = () => {
  const { isDark } = useAppTheme();
  const [profile, setProfile] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA',
    bio: 'Designer and developer passionate about creating beautiful products',
    joinedDate: 'January 15, 2024',
    profileImage: 'J',
    initials: 'JD',
  });

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState(profile);
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    setProfile(formData);
    setEditMode(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleCancel = () => {
    setFormData(profile);
    setEditMode(false);
  };

  return (
    <Box sx={{ width: '100%', py: 4 }}>
      <Container maxWidth="md">
        {/* Success Alert */}
        {saveSuccess && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Profile updated successfully!
          </Alert>
        )}

        {/* Profile Header Card */}
        <Paper
          elevation={0}
          sx={{
            mb: 4,
            background: isDark
              ? 'linear-gradient(135deg, #1976d2 0%, #1565c0 100%)'
              : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
            color: 'white',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          {/* Header Background */}
          <Box sx={{ height: 140, position: 'relative' }}>
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: '100%',
                opacity: 0.1,
                backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
          </Box>

          {/* Profile Info */}
          <Box sx={{ px: 4, pb: 3, pt: 1 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 3,
                flexWrap: { xs: 'wrap', sm: 'nowrap' },
              }}
            >
              {/* Avatar */}
              <Avatar
                sx={{
                  width: 120,
                  height: 120,
                  fontSize: '3rem',
                  fontWeight: 'bold',
                  bgcolor: 'rgba(255, 255, 255, 0.25)',
                  border: '4px solid white',
                  mt: -7,
                }}
              >
                {profile.initials}
              </Avatar>

              {/* Profile Details */}
              <Box sx={{ flex: 1, mt: 1 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                  {profile.name}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.9, mb: 2 }}>
                  Member since {profile.joinedDate}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    opacity: 0.95,
                    fontStyle: 'italic',
                    maxWidth: 500,
                  }}
                >
                  {profile.bio}
                </Typography>
              </Box>

              {/* Edit Button */}
              <Button
                variant="contained"
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.25)',
                  color: 'white',
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.35)',
                  },
                  mt: 1,
                }}
                startIcon={<EditIcon />}
                onClick={() => setEditMode(!editMode)}
              >
                {editMode ? 'Cancel' : 'Edit'}
              </Button>
            </Box>
          </Box>
        </Paper>

        {/* Edit Form or View Mode */}
        {editMode ? (
          <Paper elevation={0} sx={{ p: 4, mb: 4, bgcolor: isDark ? '#2a2a2a' : 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 'bold' }}>
              Edit Profile Information
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField
                fullWidth
                label="Full Name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                variant="outlined"
              />

              <TextField
                fullWidth
                label="Bio"
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                multiline
                rows={3}
                variant="outlined"
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
                <TextField
                  label="Email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  variant="outlined"
                />

                <TextField
                  label="Phone"
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  variant="outlined"
                />
              </Box>

              <TextField
                fullWidth
                label="Location"
                name="location"
                value={formData.location}
                onChange={handleChange}
                variant="outlined"
              />

              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 1 }}>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSave}
                >
                  Save Changes
                </Button>
              </Box>
            </Box>
          </Paper>
        ) : (
          <Paper elevation={0} sx={{ p: 4, mb: 4, bgcolor: isDark ? '#2a2a2a' : 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ mb: 3, fontWeight: 'bold' }}>
              Contact Information
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Mail sx={{ color: 'primary.main', mt: 0.5, flexShrink: 0 }} />
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Email
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {profile.email}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <Phone sx={{ color: 'primary.main', mt: 0.5, flexShrink: 0 }} />
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Phone
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {profile.phone}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <LocationOn sx={{ color: 'primary.main', mt: 0.5, flexShrink: 0 }} />
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Location
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {profile.location}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2 }}>
                <DateRange sx={{ color: 'primary.main', mt: 0.5, flexShrink: 0 }} />
                <Box>
                  <Typography variant="caption" color="textSecondary">
                    Joined
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {profile.joinedDate}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
        )}

        {/* Security & Account Sections */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
          {/* Security Card */}
          <Card elevation={0} sx={{ bgcolor: isDark ? '#2a2a2a' : 'background.paper', borderRadius: 1, height: '100%', border: 1, borderColor: 'divider' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Lock sx={{ color: 'primary.main' }} />
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    Security
                  </Typography>
                </Box>

                <Divider sx={{ mb: 2 }} />

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: isDark ? '#1a1a1a' : '#f5f5f5',
                      borderRadius: 1,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: isDark ? '#3a3a3a' : '#eeeeee',
                      },
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Change Password
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Update your password regularly to keep your account secure
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      p: 2,
                      bgcolor: isDark ? '#1a1a1a' : '#f5f5f5',
                      borderRadius: 1,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: isDark ? '#3a3a3a' : '#eeeeee',
                      },
                    }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Two-Factor Authentication
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Enable 2FA for extra security on your account
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

          {/* Account Card */}
          <Card elevation={0} sx={{ bgcolor: isDark ? '#2a2a2a' : 'background.paper', borderRadius: 1, height: '100%', border: 1, borderColor: 'divider' }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                Account
              </Typography>

              <Divider sx={{ mb: 2 }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: isDark ? '#1a1a1a' : '#f5f5f5',
                    borderRadius: 1,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: isDark ? '#3a3a3a' : '#eeeeee',
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Download sx={{ fontSize: '1.2rem', color: 'primary.main' }} />
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Export Data
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        Download your personal data in JSON format
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                <Box
                  sx={{
                    p: 2,
                    bgcolor: isDark ? 'rgba(211, 47, 47, 0.1)' : '#ffebee',
                    borderRadius: 1,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      bgcolor: isDark ? 'rgba(211, 47, 47, 0.2)' : '#ffcdd2',
                    },
                  }}
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DeleteIcon sx={{ fontSize: '1.2rem', color: 'error.main' }} />
                    <Box>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'error.main' }}>
                        Delete Account
                      </Typography>
                      <Typography variant="caption" color="error">
                        This action cannot be undone
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Delete Account
              <IconButton
                size="small"
                onClick={() => setShowDeleteConfirm(false)}
              >
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Typography sx={{ mt: 2 }}>
              Are you sure you want to delete your account? This action is permanent and cannot be undone. All your data will be permanently removed.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button color="error" variant="contained">Delete Account</Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default ProfilePage;
