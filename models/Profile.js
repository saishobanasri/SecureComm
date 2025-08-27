const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const profileSchema = new mongoose.Schema({
  militaryId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: v => /^IC-\d{5}$/.test(v),
      message: "Military ID must be in format IC-12345"
    }
  },
  password: {
    type: String,
    required: false
  },
  hashedPassword: {
    type: String,
    required: false
  },
  unitId: {
    type: String,
    required: true,
    trim: true
  },
  roleId: {
    type: String,
    required: true,
    trim: true
  },
  profilePhoto: {
    type: String,
    required: false, // Changed from required: true to match your schema
    default: null
  }
}, { 
  timestamps: true // Added timestamps from your schema
});

// Hash password before saving
profileSchema.pre('save', async function(next) {
  // Handle both password and hashedPassword fields
  const passwordField = this.password || this.hashedPassword;
  if (!this.isModified('password') && !this.isModified('hashedPassword')) return next();
  
  try {
    if (passwordField && !passwordField.startsWith('$2b$')) {
      const salt = await bcrypt.genSalt(12);
      const hashed = await bcrypt.hash(passwordField, salt);
      
      // Set both fields for compatibility
      this.password = hashed;
      this.hashedPassword = hashed;
    }
    this.updatedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method - FIXED to work with your existing database
profileSchema.methods.comparePassword = async function(candidatePassword) {
  // Use either password or hashedPassword field from your database
  const storedPassword = this.password || this.hashedPassword;
  if (!storedPassword) {
    throw new Error('No password stored for this profile');
  }
  
  console.log(`🔐 Comparing password for: ${this.militaryId}`);
  console.log(`🔐 Stored password exists: ${!!storedPassword}`);
  
  return await bcrypt.compare(candidatePassword, storedPassword);
};

// Get public profile (without sensitive data)
profileSchema.methods.getPublicProfile = function() {
  const profileObject = this.toObject();
  delete profileObject.password;
  delete profileObject.hashedPassword;
  return profileObject;
};

// Static methods
profileSchema.statics.findByMilitaryId = async function(militaryId) {
  const profile = await this.findOne({ militaryId });
  console.log(`🔍 Finding profile for military ID: ${militaryId}`);
  console.log(`🔍 Profile found: ${!!profile}`);
  return profile;
};

profileSchema.statics.authenticate = async function(militaryId, password) {
  try {
    console.log(`🔐 Starting authentication for: ${militaryId}`);
    
    const profile = await this.findByMilitaryId(militaryId);
    
    if (!profile) {
      console.log(`❌ Profile not found for: ${militaryId}`);
      throw new Error('Invalid credentials - profile not found');
    }
    
    console.log(`✅ Profile found: ${profile.militaryId}`);
    
    const isMatch = await profile.comparePassword(password);
    
    if (!isMatch) {
      console.log(`❌ Password mismatch for: ${militaryId}`);
      throw new Error('Invalid credentials - password mismatch');
    }
    
    console.log(`✅ Password verified for: ${profile.militaryId}`);
    
    // Update last login - you might want to add lastLogin field to schema
    profile.lastLogin = new Date();
    await profile.save();
    
    return profile.getPublicProfile();
  } catch (error) {
    console.error('Authentication error:', error.message);
    throw error; // Re-throw the original error
  }
};

profileSchema.statics.getAllProfilePhotos = async function() {
  try {
    const profiles = await this.find({}, {
      militaryId: 1,
      unitId: 1,
      roleId: 1,
      profilePhoto: 1
    });
    console.log(`📸 Found ${profiles.length} profile photos in database`);
    return profiles;
  } catch (error) {
    console.error('Error fetching profile photos:', error);
    throw new Error('Failed to fetch profile photos: ' + error.message);
  }
};

// Create text index for search
profileSchema.index({ 
  militaryId: 'text', 
  unitId: 'text', 
  roleId: 'text' 
});

const Profile = mongoose.model('Profile', profileSchema);
module.exports = Profile;