// routes/register.js - Updated to use Profile model instead of User
const express = require("express");
const multer = require("multer");
const Approval = require("../models/Approval");
const Approver = require("../models/Approver");
const Profile = require("../models/Profile"); // Changed from User to Profile
const Role = require("../models/Role");
const { hashPassword } = require('../utils/password-utils');

const router = express.Router();

// Multer configuration - already correct for Registeruploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require("fs");
    const uploadDir = "Registeruploads/";
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

router.post("/", upload.single("profilePhoto"), async (req, res) => {
  console.log("🚀 Registration request received");
  console.log("📋 Request body:", req.body);
  console.log("📸 File uploaded:", req.file ? req.file.filename : "No file");

  try {
    // Note: email is not in Profile model, so we'll remove it from validation
    const { fullName, dateOfBirth, contactNumber, email, serviceId, unit_id, role_id, password } = req.body;

    console.log("✅ Validating inputs...");
    // Updated validation - removed email since it's not in Profile model
    if (!fullName || !dateOfBirth || !contactNumber || !serviceId || !unit_id || !role_id || !password) {
      return res.status(400).json({ error: "All fields (fullName, dateOfBirth, contactNumber, serviceId, unit_id, role_id, password) are required" });
    }

    console.log("✅ Validating Service ID format...");
    if (!/^IC-\d{5}$/.test(serviceId)) {
      return res.status(400).json({ error: "Service ID must be in format IC-12345" });
    }

    console.log("✅ Checking for duplicates...");
    const existingApproval = await Approval.findOne({ 
      subordinate_id: serviceId 
      // Removed email check since email might not be in Approval model either
    });
    if (existingApproval) {
      return res.status(400).json({ error: "A registration for this Service ID is already pending." });
    }

    // Changed from User to Profile and updated field names
    const existingProfile = await Profile.findOne({ militaryId: serviceId });
    if (existingProfile) {
      return res.status(400).json({ error: "A profile with this Service ID is already registered." });
    }

    console.log("✅ Validating role ID:", role_id);
    const applicantRole = await Role.findOne({ role_id: role_id });
    if (!applicantRole) {
      console.log("❌ Role ID not found:", role_id);
      return res.status(400).json({ error: "Invalid role_id specified" });
    }
    console.log("✅ Role found:", applicantRole);

    console.log("✅ Hashing password...");
    const hashedPassword = hashPassword(password);

    console.log("✅ Creating approval record...");
    const approval = new Approval({
      subordinate_id: serviceId,
      status: "pending",
      name: fullName.trim(),
      email: email ? email.toLowerCase() : null, // Handle email if provided
      phone_num: contactNumber,
      dob: new Date(dateOfBirth),
      unit_id: unit_id,
      role_id: role_id,
      profile_photo: req.file ? req.file.filename : null,
      hash_password: hashedPassword,
    });
    await approval.save();
    console.log(`✅ Approval record created: ${approval.approval_id}`);

    const targetLevel = applicantRole.level - 1;
    console.log(`🔍 Looking for approvers with level = ${targetLevel} in unit ${unit_id}`);
    
    const approverRoles = await Role.find({ level: targetLevel });
    const approverRoleIds = approverRoles.map(r => r.role_id);
    console.log("📋 Approver role IDs:", approverRoleIds);

    // Changed from User to Profile and updated field names
    console.log(`🔍 Searching in Profile collection for:`, {
      unitId: unit_id,
      roleId: { $in: approverRoleIds }
    });
    
    const validApprovers = await Profile.find({
      unitId: unit_id,           // Changed from unit_id to unitId
      roleId: { $in: approverRoleIds }  // Changed from role_id to roleId
      // Removed status and isActive checks since they don't exist in Profile model
    });
    
    console.log(`📊 Profile collection query result:`, validApprovers);

    console.log(`👥 Found ${validApprovers.length} valid approvers:`, validApprovers);

    if (validApprovers.length === 0) {
      console.log("❌ No approvers found - cleaning up approval record");
      await Approval.findByIdAndDelete(approval._id);
      return res.status(400).json({ 
        error: "No approvers available in your unit for this role level",
        details: `Need approvers with role level ${targetLevel} in unit ${unit_id}`
      });
    }

    console.log("✅ Creating approver records...");
    const approverPromises = validApprovers.map(approver => 
      new Approver({
        approver_id: approver.militaryId, // Changed from service_id to militaryId
        approval_id: approval._id,
        approval_status: "pending",
      }).save()
    );
    await Promise.all(approverPromises);

    console.log(`✅ Registration completed for ${serviceId}`);
    res.status(201).json({
      success: true,
      message: "Registration submitted for approval",
      data: {
        approvalId: approval.approval_id,
        applicantServiceId: serviceId,
        applicantRole: applicantRole.role_name,
        unit: unit_id,
        approversAssigned: validApprovers.length
      }
    });

  } catch (err) {
    console.error("❌ DETAILED Registration Error:", err);
    console.error("STACK TRACE:", err.stack);
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
});

module.exports = router;