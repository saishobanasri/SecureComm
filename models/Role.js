// models/Role.js
const mongoose = require("mongoose");

const roleSchema = new mongoose.Schema({
  role_id: { type: String, required: true, unique: true },  // e.g. ROLE003
  role_name: { type: String, required: true },              // e.g. Sergeant
  level: { type: Number, required: true }                   // numeric order
});

module.exports = mongoose.model("Role", roleSchema, "Roles");

