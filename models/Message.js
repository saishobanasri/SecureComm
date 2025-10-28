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
    required: true,
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
  // ========== ADD THESE TWO FIELDS ==========
  anonymousSenderSession: {
    type: String,
    required: false,
    index: true
  },
  anonymousReceiverSession: {
    type: String,
    required: false,
    index: true
  }
  // ==========================================
}, {
  timestamps: true 
});

messageSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, receiverId: 1, isAnonymous: 1 });

module.exports = mongoose.model('Message', messageSchema);