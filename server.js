const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { generateKeys } = require('./utils/crypto-utils');
const { createStegoImage, decryptStegoImage } = require('./utils/stego-utils');
const bodyParser = require('body-parser');
const Message = require('./models/Message');
const { 
  getAnonymousSessionIds, 
  getAnonymousDisplayNames,
  hasVisibleAnonymousMessages 
} = require('./anonymousSessionHandler');
require('dotenv').config();

// Import Models
const Profile = require('./models/Profile.js');
const Session = require('./models/Session.js');
const Approval = require('./models/Approval.js');
const Approver = require('./models/Approver.js');
const Question = require('./models/Question');
const Answer = require('./models/Answer');
const AnswerRating = require('./models/AnswerRating');

// Import Routes
const registerRoute = require("./routes/register");

const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create Registeruploads directory
const registerUploadsDir = path.join(__dirname, "Registeruploads");
if (!fs.existsSync(registerUploadsDir)) {
  fs.mkdirSync(registerUploadsDir, { recursive: true });
  console.log("📁 Created Registeruploads directory");
}

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// MODIFIED: Increased limit for Base64 image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use("/Registeruploads", express.static(path.join(__dirname, "Registeruploads")));
app.use(express.static(path.join(__dirname, "public")));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Multer configuration for handling uploaded images
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ==================== API ROUTES ====================

// Register route
app.use("/api/register", registerRoute);

// Route to check if face recognition is available
app.get('/api/face-recognition-status', (req, res) => {
  res.json({
    available: true,
    type: 'browser-based',
    message: 'Browser-based face recognition ready'
  });
});

// Route to get all profile photos for face matching
app.get('/api/profiles/photos', async (req, res) => {
  try {
    console.log('📸 Fetching all profile photos...');

    const profiles = await Profile.find({}, {
      militaryId: 1,
      unitId: 1,
      roleId: 1,
      profilePhoto: 1
    });

    const profilesWithBase64 = [];

    for (const profile of profiles) {
      if (!profile.profilePhoto) continue;

      try {
        let base64Data = null;
        const photoPath = profile.profilePhoto;

        if (photoPath.startsWith('data:')) {
          base64Data = photoPath;
        } else if (photoPath.startsWith('http')) {
          base64Data = photoPath;
        } else {
          let imagePath = path.join(__dirname, photoPath);
          
          if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            const ext = path.extname(imagePath).toLowerCase();
            let mimeType = 'image/jpeg';

            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.gif') mimeType = 'image/gif';

            base64Data = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
            console.log(`✅ Converted ${profile.militaryId}'s photo from ${imagePath} to base64`);
          } else {
            console.log(`⚠️  Image not found for ${profile.militaryId} at path: ${imagePath}`);
            continue;
          }
        }

        if (base64Data) {
          profilesWithBase64.push({
            militaryId: profile.militaryId,
            unitId: profile.unitId,
            roleId: profile.roleId,
            profilePhoto: base64Data
          });
        }

      } catch (error) {
        console.log(`⚠️  Error processing photo for ${profile.militaryId}:`, error.message);
      }
    }

    console.log(`📸 Returning ${profilesWithBase64.length} profiles with photos`);
    res.json(profilesWithBase64);

  } catch (error) {
    console.error('Error fetching profile photos:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Route for browser-based face matching
app.post('/api/face-match', async (req, res) => {
  try {
    console.log('🔍 Browser-based face matching request received...');

    const { capturedDescriptor, profileDescriptors } = req.body;

    if (!capturedDescriptor || !profileDescriptors) {
      return res.status(400).json({
        match: false,
        error: 'Face descriptors not provided'
      });
    }

    console.log(`🔍 Comparing against ${profileDescriptors.length} profile descriptors...`);

    let bestMatch = null;
    let bestDistance = Infinity;
    const threshold = 0.6;

    for (const profileDesc of profileDescriptors) {
      try {
        const distance = euclideanDistance(capturedDescriptor, profileDesc.descriptor);

        console.log(`📊 Distance for ${profileDesc.name}: ${distance.toFixed(3)} (threshold: ${threshold})`);

        if (distance < bestDistance && distance < threshold) {
          bestDistance = distance;
          bestMatch = {
            militaryId: profileDesc.militaryId,
            name: profileDesc.name,
            confidence: ((1 - distance) * 100)
          };
          console.log(`🎯 New best match: ${profileDesc.name} with confidence ${bestMatch.confidence.toFixed(1)}%`);
        }
      } catch (error) {
        console.log(`⚠️  Error processing descriptor for ${profileDesc.name}:`, error.message);
      }
    }

    if (bestMatch) {
      console.log(`✅ MATCH FOUND: ${bestMatch.name} (${bestMatch.confidence.toFixed(1)}%)`);
      res.json({
        match: true,
        profile: bestMatch,
        confidence: bestMatch.confidence
      });
    } else {
      console.log('❌ NO MATCHING FACE FOUND');
      res.json({
        match: false,
        message: 'No matching face found in database'
      });
    }

  } catch (error) {
    console.error('❌ Face matching error:', error);
    res.status(500).json({
      match: false,
      error: 'Face matching failed: ' + error.message
    });
  }
});

// Helper function to calculate Euclidean distance
function euclideanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

// Helper function to get client IP address
function getClientIP(req) {
  return req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
    '127.0.0.1';
}

// Route for password authentication
app.post('/api/authenticate', async (req, res) => {
  try {
    const { militaryId, password } = req.body;

    console.log('🔐 Authentication request received');
    console.log(`📋 Military ID: ${militaryId}`);
    console.log(`🔑 Password provided: ${!!password}`);

    if (!militaryId || !password) {
      return res.status(400).json({
        success: false,
        error: 'Military ID and password are required'
      });
    }

    const profile = await Profile.authenticate(militaryId, password);

    console.log(`✅ Authentication successful for: ${profile.militaryId}`);

    const clientIP = getClientIP(req);
    console.log(`🌐 Client IP: ${clientIP}`);

    try {
      const session = await Session.createSession(profile.militaryId, clientIP);
      console.log(`📊 Session created: ${session.session_id}`);

      res.json({
        success: true,
        message: 'Authentication successful',
        profile: profile,
        session: {
          session_id: session.session_id,
          login_time: session.login_time
        }
      });

    } catch (sessionError) {
      console.error('❌ Session creation error:', sessionError);
      res.json({
        success: true,
        message: 'Authentication successful',
        profile: profile,
        session: null
      });
    }

  } catch (error) {
    console.error('❌ Authentication error:', error.message);
    res.status(401).json({
      success: false,
      error: error.message || 'Invalid credentials'
    });
  }
});

// Get profile by military ID
app.get('/api/profile/:militaryId', async (req, res) => {
  try {
    const profile = await Profile.findByMilitaryId(req.params.militaryId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profileData = {
      militaryId: profile.militaryId,
      unitId: profile.unitId,
      roleId: profile.roleId,
      name: profile.name,
      email: profile.email,
      dateOfBirth: profile.dateOfBirth,
      contact: profile.contact,
      profilePhoto: profile.profilePhoto
    };

    res.json(profileData);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== APPROVAL ROUTES ====================

// GET PENDING APPROVALS FOR A USER
app.get('/api/approvals/:militaryId', async (req, res) => {
  try {
    const { militaryId } = req.params;
    console.log(`🔍 Fetching pending approvals for approver: ${militaryId}`);

    const approverTasks = await Approver.find({
      approver_id: militaryId,
      approval_status: 'pending'
    });

    if (!approverTasks || approverTasks.length === 0) {
      console.log(`✅ No pending approvals found for ${militaryId}`);
      return res.json([]);
    }

    const approvalIds = approverTasks.map(task => task.approval_id);
    console.log(`📋 Found ${approvalIds.length} pending approval IDs.`);

    const approvals = await Approval.find({
      _id: { $in: approvalIds },
      status: 'pending'
    }).sort({ createdAt: -1 });

    console.log(`✅ Returning ${approvals.length} approval details.`);
    res.json(approvals);

  } catch (error) {
    console.error('❌ Error fetching pending approvals:', error);
    res.status(500).json({ error: 'Failed to fetch approvals', details: error.message });
  }
});

app.post('/api/approvals/action', async (req, res) => {
  try {
    const { approvalId, approverId, action } = req.body;
    console.log(`🚀 Processing action '${action}' for approval ${approvalId} by ${approverId}`);

    if (!approvalId || !approverId || !action) {
      return res.status(400).json({ error: 'approvalId, approverId, and action are required.' });
    }

    const approval = await Approval.findById(approvalId);
    if (!approval) {
      return res.status(404).json({ error: 'Approval request not found.' });
    }
    
    console.log('📋 Approval document:', {
      id: approval._id,
      name: approval.name,
      email: approval.email,
      subordinate_id: approval.subordinate_id,
      unit_id: approval.unit_id,
      role_id: approval.role_id,
      status: approval.status
    });
    
    if (approval.status !== 'pending') {
      return res.status(400).json({ error: `This request has already been ${approval.status}.` });
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Prepare approval data for email BEFORE any other operations
    let approvalData = null;
    if (action === 'approve') {
      console.log('📧 Preparing email data...');
      approvalData = {
        email: approval.email || null,
        name: approval.name || 'Unknown',
        subordinate_id: approval.subordinate_id || 'N/A',
        unit_id: approval.unit_id || 'N/A',
        role_id: approval.role_id || 'N/A'
      };
      
      console.log('📧 Email data prepared:', approvalData);
      
      if (!approvalData.email) {
        console.warn('⚠️ WARNING: No email address found in approval document!');
      }
    }

    if (action === 'approve') {
      console.log(`✅ Approving profile for ${approval.subordinate_id}`);

      if (!approval.profile_photo || !approval.plain_password_temp || !approval.salt) {
        return res.status(400).json({ error: 'Required data (photo, temp password, or salt) missing from approval record.' });
      }

      console.log("🔐 Generating cryptographic keys...");
      const { publicKey } = generateKeys(approval.plain_password_temp, approval.salt);

      const decryptionKey = approval.plain_password_temp;

      const dobString = approval.dob ? approval.dob.toISOString().split('T')[0] : 'N/A';
      const secretMessage = `NAME : ${approval.name} | MAIL ID : ${approval.email} | dateofbirth : ${dobString} | contact : +91${approval.phone_num}`;
      
      console.log(`💬 Secret message to encrypt and hide: "${secretMessage}"`);

      const originalImagePath = path.join(__dirname, 'Registeruploads', approval.profile_photo);
      
      const uploadsDir = path.join(__dirname, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir);
      }
      const stegoImageFilename = `stego-${approval.subordinate_id}-${Date.now()}.png`;
      const stegoImagePath = path.join(uploadsDir, stegoImageFilename);

      if (!fs.existsSync(originalImagePath)) {
        console.error(`❌ Original profile photo not found at: ${originalImagePath}`);
        return res.status(500).json({ error: 'Original profile photo not found on server. Cannot create stego image.' });
      }

      console.log('🖼️ Creating steganographic image with custom encryption...');
      const stegoImageBuffer = await createStegoImage(originalImagePath, secretMessage, decryptionKey);
      fs.writeFileSync(stegoImagePath, stegoImageBuffer);
      console.log(`💾 Stego image saved to: ${stegoImagePath}`);

      const newProfile = new Profile({
        militaryId: approval.subordinate_id,
        hashedPassword: approval.hash_password,
        salt: approval.salt,
        unitId: approval.unit_id,
        roleId: approval.role_id,
        profilePhoto: `/uploads/${stegoImageFilename}`,
        publicKey: {
          n: publicKey.n.toString(),
          e: publicKey.e.toString()
        }
      });
      await newProfile.save();
      console.log(`👤 Profile created successfully for ${newProfile.militaryId}`);
      
      approval.plain_password_temp = undefined;
    }
    
    approval.status = newStatus;
    approval.approved_by = approverId;
    approval.approved_date = new Date();
    await approval.save();

    await Approver.findOneAndUpdate({
      approval_id: approvalId,
      approver_id: approverId
    }, {
      approval_status: newStatus,
      approval_date: new Date()
    });

    console.log('📤 Sending response with approvalData:', approvalData);

    res.json({ 
      success: true, 
      message: `Registration successfully ${newStatus}.`,
      approvalData: approvalData
    });

  } catch (error) {
    console.error(`❌ Error processing approval action:`, error);
    res.status(500).json({ error: 'Failed to process approval action', details: error.message });
  }
});

// DECRYPTION ROUTE
app.post('/api/profile/decrypt', async (req, res) => {
  try {
    const { militaryId, password } = req.body;

    const profile = await Profile.findOne({ militaryId: militaryId });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    const isMatch = await profile.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid password.' });
    }

    const stegoImagePath = path.join(__dirname, profile.profilePhoto);
    
    if (!fs.existsSync(stegoImagePath)) {
      console.error(`❌ Stego image not found for decryption at: ${stegoImagePath}`);
      return res.status(500).json({ error: 'Steganographic profile image not found for decryption.' });
    }

    console.log(`🔑 Decrypting data from ${stegoImagePath} for ${militaryId}`);
    const decryptedMessage = await decryptStegoImage(stegoImagePath, password);

    res.json({
      success: true,
      decryptedData: decryptedMessage
    });

  } catch (error) {
    console.error(`❌ Error during decryption for ${req.body.militaryId}:`, error);
    res.status(500).json({ error: 'Failed to decrypt profile data', details: error.message });
  }
});

// ==================== QUESTION & ANSWER ROUTES ====================

// Post a question
app.post('/api/questions', async (req, res) => {
  try {
    const { question_text } = req.body;
    const ip_address = getClientIP(req);

    const QUESTION_LIMIT = 3;
    const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000); // 1 hour in milliseconds

    // 1. Count recent questions from this IP
    const recentQuestionsCount = await Question.countDocuments({
      ip_address: ip_address,
      post_time: { $gte: ONE_HOUR_AGO } // Find questions posted in the last hour
    });

    // 2. Check if the limit is exceeded
    if (recentQuestionsCount >= QUESTION_LIMIT) {
      console.warn(`RATE LIMIT: IP ${ip_address} blocked. Found ${recentQuestionsCount} posts in the last hour.`);
      
      // 429 "Too Many Requests" is the correct HTTP status code
      return res.status(429).json({ 
        success: false, 
        error: 'You have posted too many questions recently. Please try again after 1 hour.' 
      });
    }

    if (!question_text || question_text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Question text is required' });
    }

    const question = new Question({
      question_text: question_text.trim(),
      ip_address
    });

    await question.save();
    res.json({ success: true, question });
  } catch (error) {
    console.error('Error posting question:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get ALL questions (both answered and unanswered)
app.get('/api/questions/all', async (req, res) => {
  try {
    console.log('📋 Fetching ALL questions from database...');
    
    const allQuestions = await Question.find({})
      .sort({ post_time: -1 });

    console.log(`✅ Found ${allQuestions.length} total questions`);
    
    res.json({ 
      success: true, 
      data: allQuestions,
      count: allQuestions.length
    });
  } catch (error) {
    console.error('❌ Error fetching all questions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get answered questions with highest-rated answer
app.get('/api/questions/answered', async (req, res) => {
  try {
    const answeredQuestions = await Question.aggregate([
      {
        $lookup: {
          from: 'answers',
          localField: 'question_id',
          foreignField: 'question_id',
          as: 'answers'
        }
      },
      {
        $match: {
          'answers.0': { $exists: true }
        }
      },
      {
        $unwind: '$answers'
      },
      {
        $lookup: {
          from: 'answerratings',
          localField: 'answers.answer_id',
          foreignField: 'answer_id',
          as: 'ratings'
        }
      },
      {
        $addFields: {
          'answers.calculatedRating': {
            $cond: {
              if: { $gt: [{ $size: '$ratings' }, 0] },
              then: { $avg: '$ratings.rating_stars' },
              else: 0
            }
          }
        }
      },
      {
        $sort: { 'answers.calculatedRating': -1 }
      },
      {
        $group: {
          _id: '$question_id',
          question_text: { $first: '$question_text' },
          question_id: { $first: '$question_id' },
          post_time: { $first: '$post_time' },
          highestRatedAnswer: { $first: '$answers' }
        }
      },
      {
        $project: {
          _id: 0,
          question_id: 1,
          question_text: 1,
          post_time: 1,
          answer_id: '$highestRatedAnswer.answer_id',
          answer_text: '$highestRatedAnswer.answer_text',
          session_id: '$highestRatedAnswer.session_id',
          rating: '$highestRatedAnswer.calculatedRating'
        }
      },
      {
        $sort: { post_time: -1 }
      }
    ]);

    res.json({
      success: true,
      data: answeredQuestions
    });
  } catch (error) {
    console.error('Error fetching answered questions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get unanswered questions
app.get('/api/questions/unanswered', async (req, res) => {
  try {
    const answeredQuestionIds = await Answer.distinct('question_id');
    const unansweredQuestions = await Question.find({
      question_id: { $nin: answeredQuestionIds }
    }).sort({ post_time: -1 });

    res.json({ success: true, data: unansweredQuestions });
  } catch (error) {
    console.error('Error fetching unanswered questions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all answers for a specific question
app.get('/api/questions/:questionId/all-answers', async (req, res) => {
  try {
    const questionId = req.params.questionId;
    console.log('🔍 Fetching answers for question_id:', questionId);
    
    const question = await Question.findOne({ question_id: questionId });
    
    if (!question) {
      console.log('❌ Question not found:', questionId);
      return res.status(404).json({
        success: false,
        error: 'Question not found'
      });
    }

    const answers = await Answer.find({ question_id: questionId })
      .sort({ rating: -1 });

    res.json({
      success: true,
      question: question,
      answers: answers
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Post an answer (allows multiple answers)
app.post('/api/answers', async (req, res) => {
  try {
    const { question_id, answer_text, session_id, military_id } = req.body;

    if (!question_id || !answer_text || !session_id || !military_id) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const session = await Session.findOne({ session_id, military_id, logout_time: null });
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    const question = await Question.findOne({ question_id });
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const answer = new Answer({
      question_id,
      answer_text: answer_text.trim(),
      session_id
    });

    await answer.save();
    console.log(`✅ Answer submitted for question ${question_id} by session ${session_id}`);
    
    res.json({ success: true, answer });
  } catch (error) {
    console.error('Error posting answer:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Rate an answer
app.post('/api/answers/rate', async (req, res) => {
  const { answerId, rating } = req.body;

  console.log('📊 Rating submission received:', { answerId, rating });

  if (!answerId || rating === undefined) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields: answerId or rating.' 
    });
  }

  const validRating = Math.max(1, Math.min(5, parseInt(rating)));

  try {
    const answer = await Answer.findOne({ answer_id: answerId });
    if (!answer) {
      console.log('❌ Answer not found:', answerId);
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }

    const newRating = new AnswerRating({
      answer_id: answerId,
      rating_stars: validRating,
      rated_at: new Date()
    });

    await newRating.save();
    console.log(`✅ Rating inserted: answer_id=${answerId}, rating_stars=${validRating}`);

    const averageRating = await updateAnswerAverageRating(answerId);

    console.log(`✅ Average rating updated: ${averageRating}`);

    res.json({ 
      success: true, 
      message: 'Rating submitted successfully!',
      averageRating: averageRating,
      newRating: validRating
    });

  } catch (error) {
    console.error('❌ Error submitting rating:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to submit rating: ' + error.message 
    });
  }
});

async function getActiveSessionId(militaryId) {
  const Session = require('./models/Session');
  
  const session = await Session.findOne({ 
    military_id: militaryId,
    logout_time: null // Only get active sessions (not logged out)
  }).sort({ login_time: -1 }); // Get the most recent session

  return session ? session.session_id : null;
}

// Helper function to update answer average rating
async function updateAnswerAverageRating(answerId) {
  try {
    console.log(`📊 Calculating average for answer_id: ${answerId}`);

    const ratings = await AnswerRating.find({ answer_id: answerId });
    
    console.log(`📊 Found ${ratings.length} ratings`);
    
    let newAverageRating = 0;
    
    if (ratings.length > 0) {
      const sum = ratings.reduce((acc, r) => acc + r.rating_stars, 0);
      newAverageRating = parseFloat((sum / ratings.length).toFixed(2));
      
      console.log(`📊 Ratings: [${ratings.map(r => r.rating_stars).join(', ')}]`);
      console.log(`📊 Sum: ${sum}, Count: ${ratings.length}, Average: ${newAverageRating}`);
    }

    const updatedAnswer = await Answer.findOneAndUpdate(
      { answer_id: answerId },
      { rating: newAverageRating },
      { new: true }
    );

    if (updatedAnswer) {
      console.log(`✅ Updated answer ${answerId} with rating: ${newAverageRating}`);
      return newAverageRating;
    } else {
      console.warn(`⚠️ Answer ${answerId} not found`);
      return 0;
    }

  } catch (error) {
    console.error(`❌ Error updating average for ${answerId}:`, error);
    throw new Error("Failed to update average rating: " + error.message);
  }
}

// ==================== OTHER ROUTES ====================

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const sessionsCount = await Session.countDocuments({});
    const activeSessionsCount = await Session.countDocuments({ logout_time: null });

    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
      services: {
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        faceRecognition: 'browser-based-active'
      },
      statistics: {
        totalSessions: sessionsCount,
        activeSessions: activeSessionsCount
      }
    });
  } catch (error) {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected"
    });
  }
});

// Root route
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send(`
      <h1>SecureComm Server</h1>
      <p>Server is running successfully!</p>
      <ul>
        <li><a href="/api/health">Health Check</a></li>
        <li><strong>Registration API:</strong> POST /api/register</li>
        <li><strong>Authentication API:</strong> POST /api/authenticate</li>
        <li><strong>Face Recognition API:</strong> POST /api/face-match</li>
        <li><strong>Questions API:</strong> GET /api/questions/all</li>
        <li><a href="/login">Login Page</a></li>
      </ul>
    `);
  }
});

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Route for logout
app.post('/api/logout', async (req, res) => {
  try {
    const { session_id, military_id } = req.body;

    if (!session_id || !military_id) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and Military ID are required'
      });
    }

    console.log(`🚪 Logout request for session: ${session_id}`);

    const session = await Session.endSession(session_id, military_id);

    if (session) {
      console.log(`✅ Session ended successfully: ${session_id}`);
      res.json({
        success: true,
        message: 'Logout successful',
        session: {
          session_id: session.session_id,
          logout_time: session.logout_time
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Logout failed: ' + error.message
    });
  }
});

// Route to get user sessions
app.get('/api/sessions/:militaryId', async (req, res) => {
  try {
    const sessions = await Session.getActiveSessions(req.params.militaryId);
    res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions'
    });
  }
});

// Serve main.html
app.get('/main.html', (req, res) => {
  console.log('main.html requested directly');
  const mainPath = path.join(__dirname, 'public', 'main.html');

  if (fs.existsSync(mainPath)) {
    console.log('Serving main.html from:', mainPath);
    res.sendFile(mainPath);
  } else {
    console.error('main.html not found at:', mainPath);
    res.status(404).send('main.html file not found');
  }
});

app.get('/main', (req, res) => {
  console.log('main route requested');
  const mainPath = path.join(__dirname, 'public', 'main.html');
  res.sendFile(mainPath);
});


// ==================== CHAT ROUTES ====================

/**
 * POST /api/chat/send
 * Sends a new chat message.
 */
app.post('/api/chat/send', async (req, res) => {
  try {
    const { senderId, receiverId, messageText, senderCopy, isAnonymous } = req.body;

    // ========== NEW: Handle Anonymous Messages ==========
    if (isAnonymous) {
      // Get current active session IDs for both users
      const senderSession = await getActiveSessionId(senderId);
      const receiverSession = await getActiveSessionId(receiverId);

      if (!senderSession || !receiverSession) {
        return res.status(400).json({ 
          success: false, 
          error: 'One or both users do not have active sessions' 
        });
      }

      console.log(`📤 Sending anonymous message from ${senderId} to ${receiverId}`);
      console.log(`   Current sessions: ${senderSession} → ${receiverSession}`);

      // Get the persistent session IDs (will reuse old ones or create new)
      const { sessionA, sessionB, isNewConversation } = 
        await getAnonymousSessionIds(
          senderId,
          senderSession,
          receiverId,
          receiverSession
        );

      console.log(`   Using sessions: ${sessionA} ↔ ${sessionB} (New: ${isNewConversation})`);

      // Create the message with persistent session IDs
      const message = await Message.create({
        senderId: senderId,
        receiverId: receiverId,
        messageText: messageText,
        senderCopy: senderCopy,
        isAnonymous: true,
        anonymousSenderSession: sessionA,      // ← NEW FIELD
        anonymousReceiverSession: sessionB,    // ← NEW FIELD
        deletedBy: [] // Fresh message, not deleted by anyone
      });

      console.log(`✅ Anonymous message saved with ID: ${message._id}`);
      return res.json({ success: true, message });
    }
    // ========== END NEW CODE ==========

    // Non-anonymous message (your existing code)
    const message = await Message.create({
      senderId,
      receiverId,
      messageText,
      senderCopy,
      isAnonymous: false
    });

    res.json({ success: true, message });

  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/chat/message/hide
 * Hides a single message for the current user (soft delete).
 */
app.post('/api/chat/message/hide', async (req, res) => {
  try {
    const { messageId, myId } = req.body;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Add user to deletedBy array if not already there
    if (!message.deletedBy.includes(myId)) {
      message.deletedBy.push(myId);
      await message.save();
    }

    res.json({ success: true, message: 'Message hidden' });

  } catch (error) {
    console.error('Error hiding message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
/**
 * GET /api/chat/conversations/:militaryId
 * Gets the list of all conversations (chat list) for a user.
 */
app.get('/api/chat/conversations/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all messages where this user is sender or receiver
    // EXCLUDE messages that this user has hidden
    const messages = await Message.find({
      $or: [
        { senderId: userId },
        { receiverId: userId }
      ],
      deletedBy: { $ne: userId } // Not in this user's deletedBy array
    }).sort({ createdAt: -1 });

    // Group messages by conversation partner
    const conversationsMap = new Map();

    for (const msg of messages) {
      const otherPartyId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      const isAnonymous = msg.isAnonymous;

      // Create a unique key for this conversation
      // Anonymous and non-anonymous chats with same person are separate
      const convoKey = isAnonymous 
        ? `${otherPartyId}-ANON` 
        : otherPartyId;

      if (!conversationsMap.has(convoKey)) {
        let displayName = otherPartyId;
        let displayAvatar = otherPartyId.substring(3, 5).toUpperCase();

        // ========== NEW: Get persistent session names for anonymous chats ==========
        if (isAnonymous) {
          const { otherDisplaySession } = await getAnonymousDisplayNames(userId, otherPartyId);
          displayName = otherDisplaySession; // Use session ID instead of military ID
          displayAvatar = 'AN'; // Anonymous avatar
        }
        // ========== END NEW CODE ==========

        // --- NEW: Calculate unread count for this conversation ---
        const unreadCount = await Message.countDocuments({
          senderId: otherPartyId,  // From the other person
          receiverId: userId,    // To me
          isAnonymous: isAnonymous,
          read: false,
          deletedBy: { $ne: userId } // And not hidden by me
        });
        // --- END NEW ---

        conversationsMap.set(convoKey, {
          otherPartyId: otherPartyId,
          isAnonymous: isAnonymous,
          name: displayName,
          avatar: displayAvatar,
          lastMessage: 'Encrypted message',
          timestamp: msg.createdAt,
          unread: unreadCount // --- MODIFIED: Use the calculated count ---
        });
      }
    }

    const conversations = Array.from(conversationsMap.values());
    res.json({ success: true, conversations });

  } catch (error) {
    console.error('❌ Error fetching conversations:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}); // End of the route handler

/**
 * Gets the display names (session IDs) for an anonymous conversation.
 * Used when opening a chat to show the correct session IDs.
 */
app.get('/api/chat/anonymous-display/:myId/:otherId', async (req, res) => {
  try {
    const { myId, otherId } = req.params;

    console.log(`📺 Getting display names for ${myId} ↔ ${otherId}`);

    // Check if there are any visible messages
    const hasMessages = await hasVisibleAnonymousMessages(myId, otherId);

    if (!hasMessages) {
      // No conversation exists yet or all hidden
      console.log(`   No visible messages found`);
      return res.json({ 
        success: true, 
        myDisplaySession: 'ANON-NEW', 
        otherDisplaySession: 'ANON-NEW',
        isNew: true
      });
    }

    // Get the display names from existing messages
    const names = await getAnonymousDisplayNames(myId, otherId);
    
    console.log(`   Display names: You=${names.myDisplaySession}, Other=${names.otherDisplaySession}`);
    
    res.json({ success: true, ...names, isNew: false });

  } catch (error) {
    console.error('❌ Error getting display names:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/chat/history/:myId/:otherId
 * Gets the full message history between two users.
 */
app.get('/api/chat/history/:myId/:otherId', async (req, res) => {
  try {
    const { myId, otherId } = req.params;
    const { anonymous } = req.query;
    const isAnonymous = anonymous === 'true';

    // --- NEW: Mark messages as read when history is fetched ---
    try {
      await Message.updateMany(
        {
          senderId: otherId,    // Messages sent by the other person
          receiverId: myId,   // to me
          isAnonymous: isAnonymous,
          read: false         // that are unread
        },
        {
          $set: { read: true } // Set them to read
        }
      );
      console.log(`Marked messages as read for ${myId} from ${otherId} (anon: ${isAnonymous})`);
    } catch (updateError) {
      console.error('Error marking messages as read:', updateError);
      // Don't stop the request, just log the error
    }
    // --- END NEW ---

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherId },
        { senderId: otherId, receiverId: myId }
      ],
      isAnonymous: isAnonymous,
      deletedBy: { $ne: myId } // ← IMPORTANT: Don't show hidden messages
    }).sort({ createdAt: 1 });

    res.json({ success: true, messages });

  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/profiles/search/:myId/:query
 * Searches for profiles by militaryId, excluding the user's own ID.
 */
app.get('/api/profiles/search/:myId/:query', async (req, res) => {
  try {
    const { myId, query } = req.params;

    if (!query) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    // Use a case-insensitive regex for a "starts with" search
    const searchRegex = new RegExp('^' + query, 'i');

    // Find profiles that match the regex and are NOT the user's own ID
    const profiles = await Profile.find({
      militaryId: { $regex: searchRegex, $ne: myId } 
    }, {
      militaryId: 1, // Only select these fields
      unitId: 1,
      roleId: 1,
    }).limit(10); // Limit results to 10

    // Format the results to match the object structure our chat list expects
    const formattedProfiles = profiles.map(profile => ({
      otherPartyId: profile.militaryId,
      lastMessage: `Unit: ${profile.unitId} | Role: ${profile.roleId}`, // Show unit/role as preview
      timestamp: new Date(), // Use current time as placeholder
      unread: 0,
      name: profile.militaryId, // Use militaryId as the name
      avatar: profile.militaryId.substring(0, 2) // e.g., "IC"
    }));

    res.json({ success: true, results: formattedProfiles });

  } catch (error) {
    console.error('Error searching profiles:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * POST /api/chat/hide
 * Hides a conversation for one user (soft delete).
 */
app.post('/api/chat/hide', async (req, res) => {
  try {
    const { myId, otherId, isAnonymous } = req.body;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: otherId },
        { senderId: otherId, receiverId: myId }
      ],
      isAnonymous: isAnonymous
    });

    let hiddenCount = 0;
    for (const msg of messages) {
      if (!msg.deletedBy.includes(myId)) {
        msg.deletedBy.push(myId);
        await msg.save();
        hiddenCount++;
      }
    }

    res.json({ success: true, hiddenCount });

  } catch (error) {
    console.error('Error hiding conversation:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- NEW ROUTE: Get total unread message count ---
app.get('/api/chat/unread-count/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const totalUnread = await Message.countDocuments({
      receiverId: userId,
      read: false,
      deletedBy: { $ne: userId } // Don't count hidden messages
    });

    res.json({ success: true, totalUnread: totalUnread });

  } catch (error) {
    console.error('Error fetching total unread count:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// --- END NEW ROUTE ---

/**
 * DELETE /api/chat/message
 * Deletes a single message by its _id.
 */
app.delete('/api/chat/message', async (req, res) => {
  try {
    const { messageId, myId } = req.body;

    if (!messageId || !myId) {
      return res.status(400).json({ success: false, error: 'Missing messageId or myId' });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Security check: Only allow the sender to delete their own message
    if (message.senderId !== myId) {
      return res.status(403).json({ success: false, error: 'You are not authorized to delete this message' });
    }

    await Message.findByIdAndDelete(messageId);

    res.json({ success: true, message: 'Message deleted' });

  } catch (error) {
    console.error('Error deleting single message:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/profile/key/:militaryId
 * Gets the public key for a given user.
 */
app.get('/api/profile/key/:militaryId', async (req, res) => {
  try {
    const { militaryId } = req.params;
    const profile = await Profile.findOne({ militaryId }, { publicKey: 1 });

    if (!profile || !profile.publicKey || !profile.publicKey.n) {
      return res.status(404).json({ success: false, error: 'Public key not found for user.' });
    }

    // Return the key components as strings
    res.json({ success: true, publicKey: profile.publicKey });

  } catch (error) {
    console.error('Error fetching public key:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/profiles/list/:myId
 * Gets a list of all profiles (ID, Unit, Role) to populate recipient lists,
 * excluding the user who is logged in.
 */
app.get('/api/profiles/list/:myId', async (req, res) => {
  try {
    const { myId } = req.params;

    // Find all profiles *except* the user's own
    const profiles = await Profile.find(
      { militaryId: { $ne: myId } },
      { militaryId: 1, unitId: 1, roleId: 1, _id: 0 } // Only select these fields
    ).lean(); // .lean() makes it faster, returns plain JS objects

    res.json({ success: true, profiles: profiles });

  } catch (error) {
    console.error('Error fetching profile list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 5MB.'
    });
  }
  
  // Handle PayloadTooLargeError from body-parser
  if (error.type === 'entity.too.large') {
      console.error('❌ PayloadTooLargeError:', error.message);
      return res.status(413).json({
          success: false,
          error: "Payload too large",
          message: `Request entity is too large. Limit is ${error.limit}.`
      });
  }

  if (error instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: 'File upload error: ' + error.message
    });
  }

  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? error.message : "Something went wrong!"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.path,
    message: 'Endpoint not found'
  });
});

// Connect to MongoDB and start server
async function startServer() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/securecomm_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('🎖️  Connected to MongoDB successfully');
    console.log('📡 Military SecureComm Database Online');
    console.log("📊 Database: securecomm_db");

    app.listen(PORT, () => {
      console.log('\n🚀 ===== MILITARY SECURECOMM SERVER =====');
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🔐 System Status: SECURE & OPERATIONAL`);
      console.log('=====================================\n');

      console.log('💡 Using browser-based face recognition with TensorFlow.js');
      console.log(`📝 Registration endpoint: http://localhost:${PORT}/api/register`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

// MongoDB connection event handlers
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

// Start the server
startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  console.log('\n⚠️ Received SIGINT. Shutting down gracefully...');

  try {
    await mongoose.connection.close();
    console.log('🔒 Database connection closed');
    console.log('✅ Database connection closed.');
  } catch (error) {
    console.error('Error closing database:', error);
  }

  console.log('✅ Server shutdown complete');
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;