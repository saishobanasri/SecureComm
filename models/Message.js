const mongoose = require('mongoose');

// Validation for the Military ID format
const militaryIdValidator = {
  validator: v => /^IC-\d{5}$/.test(v),
  message: "ID must be in format IC-12345"
};

const messageSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
    validate: militaryIdValidator,
    index: true
  },
  receiverId: {
    type: String,
    required: true,
    validate: militaryIdValidator,
    index: true
  },
  messageText: {
    type: String,
    required: true,
    trim: true
  },
  read: {
    type: Boolean,
    default: false
  },
  // --- ADD THIS FIELD ---
  deletedBy: [{ // Array of militaryIds who have hidden this message
    type: String,
    validate: militaryIdValidator,
    index: true
  }],
  senderCopy: {
    type: String,
    required: false // Not required, so old messages don't break
  }
}, {
  timestamps: true 
});

// Compound index to optimize fetching chat history
messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);