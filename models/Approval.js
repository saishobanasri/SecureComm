// models/Approval.js
const mongoose = require("mongoose");

const approvalSchema = new mongoose.Schema({
  approval_id: { type: String, index: true },   // generated, not unique initially
  subordinate_id: { 
    type: String, 
    required: true,
    unique: true, // Add unique constraint here instead of compound index
    validate: {
      validator: v => /^IC-\d{5}$/.test(v),
      message: "Service ID must be in format IC-12345"
    }
  },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, unique: true },
  phone_num: { type: String, required: true },
  dob: { type: Date, required: true },
  unit_id: { type: String, required: true },
  role_id: { type: String, required: true },
  profile_photo: { type: String, default: null },
  hash_password: { type: String, required: true, minlength: 8 },
  registration_date: { type: Date, default: Date.now },
  approved_by: { type: String, default: null },
  approved_date: { type: Date, default: null },
  rejection_reason: { type: String, default: null }
}, { timestamps: true });

// Auto-generate sequential approval_id
approvalSchema.pre("save", async function(next) {
  if (!this.approval_id) {
    try {
      const last = await mongoose.model("Approval").findOne({}, {}, { sort: { createdAt: -1 } });
      let seq = 1;
      if (last && last.approval_id) {
        const lastNum = parseInt(last.approval_id.split("-")[1], 10);
        if (!isNaN(lastNum)) seq = lastNum + 1;
      }
      this.approval_id = `APP-${seq.toString().padStart(5, "0")}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Remove the problematic compound index - use separate unique constraints instead
// approvalSchema.index({ subordinate_id: 1, status: 1 }, { unique: true }); // REMOVED

module.exports = mongoose.model("Approval", approvalSchema);