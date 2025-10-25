const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  answer_id: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return `ANS-${Date.now().toString().slice(-6)}`;
    }
  },
  question_id: {
    type: String,
    required: true,
    ref: 'Question'
  },
  answer_text: {
    type: String,
    required: true
  },
  session_id: {
    type: String,
    required: true,
    ref: 'Session'
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  }
}, {
  timestamps: false,
  versionKey: false
});

module.exports = mongoose.model('Answer', answerSchema);