// models/Approver.js
const mongoose = require("mongoose");

const approverSchema = new mongoose.Schema({
  approver_id: { 
    type: String, 
    required: true,
    validate: {
      validator: v => /^IC-\d{5}$/.test(v),
      message: "Approver ID must be in format IC-12345"
    }
  },
  approval_id: { type: mongoose.Schema.Types.ObjectId, ref: "Approval", required: true },
  approval_status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  approval_date: { type: Date, default: null },
  comments: { type: String, default: null }
}, { 
  timestamps: false,  // Changed from true to false
  versionKey: false   // Added to remove __v field
});

// Compound index → one approver per approval
approverSchema.index({ approver_id: 1, approval_id: 1 }, { unique: true });

module.exports = mongoose.model("Approver", approverSchema);