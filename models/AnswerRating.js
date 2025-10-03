const mongoose = require('mongoose');

const answerRatingSchema = new mongoose.Schema({
  answer_id: {
    type: String,
    required: true,
    index: true
  },
  rating_stars: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  rated_at: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'answerratings'
});

// Index for efficient querying by answer_id
answerRatingSchema.index({ answer_id: 1, rated_at: -1 });

module.exports = mongoose.model('AnswerRating', answerRatingSchema);