// models/Session.js
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const sessionSchema = new mongoose.Schema({
  session_id: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      const timestamp = Date.now().toString().slice(-3);
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `SES-${timestamp}${random.substring(0, 3)}`;
    }
  },
  military_id: {
    type: String,
    required: true,
    trim: true
  },
  login_time: {
    type: Date,
    required: true,
    default: Date.now
  },
  logout_time: {
    type: Date,
    default: null
  },
  ip_address: {
    type: String,
    required: true
  }
}, {
  timestamps: false,  // Changed from true to false
  versionKey: false   // Added to remove __v field
});

// Static method to create a new session
sessionSchema.statics.createSession = async function(militaryId, ipAddress) {
  try {
    const session = new this({
      military_id: militaryId,
      ip_address: ipAddress
    });
    await session.save();
    return session;
  } catch (error) {
    throw new Error('Failed to create session: ' + error.message);
  }
};

// Static method to end a session
sessionSchema.statics.endSession = async function(sessionId, militaryId) {
  try {
    const session = await this.findOneAndUpdate(
      { session_id: sessionId, military_id: militaryId },
      { logout_time: new Date() },
      { new: true }
    );
    return session;
  } catch (error) {
    throw new Error('Failed to end session: ' + error.message);
  }
};

// Static method to get active sessions for a user
sessionSchema.statics.getActiveSessions = async function(militaryId) {
  try {
    return await this.find({
      military_id: militaryId,
      logout_time: null
    }).sort({ login_time: -1 });
  } catch (error) {
    throw new Error('Failed to get active sessions: ' + error.message);
  }
};

const Session = mongoose.model('Session', sessionSchema);
module.exports = Session;