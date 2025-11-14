import React, { useState } from 'react';
import { Mail, Phone, MapPin, Calendar, Key } from 'lucide-react';

const ProfilePage: React.FC = () => {
  const [profile, setProfile] = useState({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA',
    bio: 'Designer and developer passionate about creating beautiful products',
    joinedDate: 'January 15, 2024',
    profileImage: 'J'
  });

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState(profile);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    setProfile(formData);
    setEditMode(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 ml-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white">
        <div className="max-w-4xl mx-auto px-8 py-12">
          <h1 className="text-4xl font-bold mb-2">My Profile</h1>
          <p className="text-blue-100">Manage your account settings and preferences</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Profile Card */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden mb-6">
          {/* Profile Header */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 h-32"></div>

          {/* Profile Info */}
          <div className="px-8 pb-8 relative">
            {/* Avatar */}
            <div className="flex items-end gap-6 -mt-16 mb-6">
              <div className="w-32 h-32 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center text-5xl font-bold text-white border-4 border-white shadow-lg">
                {profile.profileImage}
              </div>
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-gray-900">{profile.name}</h2>
                <p className="text-gray-600 mt-1">Member since {profile.joinedDate}</p>
              </div>
              <button
                onClick={() => setEditMode(!editMode)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {editMode ? 'Cancel' : 'Edit Profile'}
              </button>
            </div>

            {/* Content */}
            {!editMode ? (
              <>
                {/* Bio */}
                <p className="text-gray-700 mb-8">{profile.bio}</p>

                {/* Contact Info Grid */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div className="flex items-start gap-4">
                    <Mail className="text-blue-600 mt-1" size={20} />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Email</p>
                      <p className="text-gray-900 font-medium">{profile.email}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Phone className="text-blue-600 mt-1" size={20} />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Phone</p>
                      <p className="text-gray-900 font-medium">{profile.phone}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <MapPin className="text-blue-600 mt-1" size={20} />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Location</p>
                      <p className="text-gray-900 font-medium">{profile.location}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <Calendar className="text-blue-600 mt-1" size={20} />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Joined</p>
                      <p className="text-gray-900 font-medium">{profile.joinedDate}</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Edit Form */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Full Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
                    <textarea
                      name="bio"
                      value={formData.bio}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                    <input
                      type="text"
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={handleSave}
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Save Changes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Additional Sections */}
        <div className="grid grid-cols-2 gap-6">
          {/* Security */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Key className="text-blue-600" size={24} />
              <h3 className="text-xl font-bold text-gray-900">Security</h3>
            </div>
            <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors mb-3">
              <p className="font-medium text-gray-900">Change Password</p>
              <p className="text-sm text-gray-600 mt-1">Update your password regularly</p>
            </button>
            <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors">
              <p className="font-medium text-gray-900">Two-Factor Authentication</p>
              <p className="text-sm text-gray-600 mt-1">Enable 2FA for extra security</p>
            </button>
          </div>

          {/* Account */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Account</h3>
            <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors mb-3">
              <p className="font-medium text-gray-900">Export Data</p>
              <p className="text-sm text-gray-600 mt-1">Download your personal data</p>
            </button>
            <button className="w-full text-left px-4 py-3 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
              <p className="font-medium text-red-900">Delete Account</p>
              <p className="text-sm text-red-700 mt-1">Permanently delete your account</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
