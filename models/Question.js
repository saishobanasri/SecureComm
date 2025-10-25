const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question_id: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return `QST-${Date.now().toString().slice(-6)}`;
    }
  },
  question_text: {
    type: String,
    required: true,
    trim: true
  },
  post_time: {
    type: Date,
    default: Date.now
  },
  ip_address: {
    type: String,
    required: true
  }
}, {
  timestamps: false,
  versionKey: false
});

module.exports = mongoose.model('Question', questionSchema);