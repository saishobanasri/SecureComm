// models/Message.js - REPLACE YOUR EXISTING FILE WITH THIS
const mongoose = require('mongoose');

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
    required: false, // --- MODIFIED --- (No longer required, can be null if it's an image)
    trim: true
  },
  read: {
    type: Boolean,
    default: false
  },
  deletedBy: [{ 
    type: String,
    validate: militaryIdValidator,
    index: true
  }],
  senderCopy: {
    type: String,
    required: false
  },
  isAnonymous: {
    type: Boolean,
    default: false,
    index: true
  },
  anonymousSenderSession: {
    type: String,
    required: false,
    index: true
  },
  anonymousReceiverSession: {
    type: String,
    required: false,
    index: true
  },
  // ========== ADD THESE TWO FIELDS FOR IMAGES ==========
  imageText: {
    type: String, // Will store the encrypted Base64 string for the receiver
    required: false
  },
  senderImageCopy: {
    type: String, // Will store the encrypted Base64 string for the sender
    required: false
  }
  // ==========================================
}, {
  timestamps: true 
});

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1, isAnonymous: 1 });

// --- NEW: Ensure at least text or image is present ---
messageSchema.pre('validate', function(next) {
  if (!this.messageText && !this.imageText) {
    next(new Error('Message must contain either text or an image.'));
  } else {
    next();
  }
});

module.exports = mongoose.model('Message', messageSchema);