const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bodyParser = require('body-parser');
require('dotenv').config();

const AnswerRating = require('./models/AnswerRating');
const Profile = require('./models/Profile.js');
const Session = require('./models/Session.js');
const registerRoute = require("./routes/register");
const Question = require('./models/Question');
const Answer = require('./models/Answer');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use("/Registeruploads", express.static(path.join(__dirname, "Registeruploads")));
app.use(express.static(path.join(__dirname, "public")));

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

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// API Routes
app.use("/api/register", registerRoute);

app.get('/api/face-recognition-status', (req, res) => {
  res.json({ 
    available: true,
    type: 'browser-based',
    message: 'Browser-based face recognition ready'
  });
});

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
      try {
        let base64Data = null;
        let imagePath;

        if (profile.profilePhoto.startsWith('data:')) {
          base64Data = profile.profilePhoto;
        } else if (profile.profilePhoto.startsWith('http')) {
          base64Data = profile.profilePhoto;
        } else {
          if (profile.profilePhoto.startsWith('/uploads/')) {
            imagePath = path.join(__dirname, profile.profilePhoto);
          } else {
            imagePath = path.join(__dirname, 'uploads', path.basename(profile.profilePhoto));
            if (!fs.existsSync(imagePath)) {
              imagePath = path.join(__dirname, 'public', profile.profilePhoto);
            }
          }

          if (fs.existsSync(imagePath)) {
            const imageBuffer = fs.readFileSync(imagePath);
            const ext = path.extname(imagePath).toLowerCase();
            let mimeType = 'image/jpeg';
            
            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.gif') mimeType = 'image/gif';
            
            base64Data = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
            console.log(`✅ Converted ${profile.militaryId}'s photo to base64`);
          } else {
            console.log(`⚠️  Image not found for ${profile.militaryId}: ${imagePath}`);
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

// Post a question
app.post('/api/questions', async (req, res) => {
  try {
    const { question_text } = req.body;
    const ip_address = getClientIP(req);

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

// This should already be in your server.js - just verify it's there:
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

// FIND AND REPLACE THIS ENTIRE ENDPOINT IN YOUR server.js

app.post('/api/answers/rate', async (req, res) => {
    const { answerId, rating } = req.body;  // ONLY answerId and rating

    console.log('📊 Rating submission received:', { answerId, rating });

    // Validate - NO userId check
    if (!answerId || rating === undefined) {
        return res.status(400).json({ 
            success: false, 
            message: 'Missing required fields: answerId or rating.' 
        });
    }

    const validRating = Math.max(1, Math.min(5, parseInt(rating)));

    try {
        // Check if answer exists
        const answer = await Answer.findOne({ answer_id: answerId });
        if (!answer) {
            console.log('❌ Answer not found:', answerId);
            return res.status(404).json({
                success: false,
                message: 'Answer not found'
            });
        }

        // INSERT new rating into answerratings (NO user_id field)
        const newRating = new AnswerRating({
            answer_id: answerId,
            rating_stars: validRating,
            rated_at: new Date()
        });

        await newRating.save();
        console.log(`✅ Rating inserted: answer_id=${answerId}, rating_stars=${validRating}`);

        // Recalculate average and update answers collection
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

// Keep this function as-is (it's already correct)
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

// Post an answer - ALLOW MULTIPLE ANSWERS
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

    // REMOVED: Check if question already answered - now allows multiple answers
    
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

// Add this NEW endpoint in server.js (after the existing /api/questions endpoints)

// Get ALL questions (both answered and unanswered)
app.get('/api/questions/all', async (req, res) => {
  try {
    console.log('📋 Fetching ALL questions from database...');
    
    const allQuestions = await Question.find({})
      .sort({ post_time: -1 }); // Most recent first

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

function getClientIP(req) {
  return req.headers['x-forwarded-for'] || 
         req.connection.remoteAddress || 
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
}

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
        <li><a href="/login">Login Page</a></li>
      </ul>
    `);
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

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

app.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File too large. Maximum size is 5MB.'
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

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.path,
    message: 'Endpoint not found'
  });
});

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
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`🔒 System Status: SECURE & OPERATIONAL`);
      console.log(`🤖 Face Recognition: BROWSER-BASED ENABLED ✅`);
      console.log('📊 API Endpoints:');
      console.log('   - GET  /api/health');
      console.log('   - POST /api/register');
      console.log('   - GET  /api/face-recognition-status');
      console.log('   - GET  /api/profiles/photos');
      console.log('   - POST /api/face-match');
      console.log('   - POST /api/authenticate');
      console.log('   - GET  /api/profile/:militaryId');
      console.log('   - POST /api/logout');
      console.log('   - GET  /api/sessions/:militaryId');
      console.log('   - GET  /api/questions/:questionId/all-answers ✅ FIXED');
      console.log('=====================================\n');
      
      console.log('💡 Using browser-based face recognition with TensorFlow.js');
      console.log('💡 No server-side Canvas dependencies required!');
      console.log(`🔐 Registration endpoint: http://localhost:${PORT}/api/register`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
}

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

startServer();

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

process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;