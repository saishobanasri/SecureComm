const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bodyParser = require('body-parser'); // Added from File 1
require('dotenv').config();

// Import Profile model
const Profile = require('./models/Profile.js');
// Import Session model
const Session = require('./models/Session.js');
// Import register route from File 1
const registerRoute = require("./routes/register"); // Added from File 1

const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create Registeruploads directory from File 1
const registerUploadsDir = path.join(__dirname, "Registeruploads"); // Added from File 1
if (!fs.existsSync(registerUploadsDir)) {
  fs.mkdirSync(registerUploadsDir, { recursive: true });
  console.log("📁 Created Registeruploads directory");
}

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:5000'], // Added port 5000
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Add bodyParser from File 1
app.use(bodyParser.json({ limit: '10mb' })); // Added from File 1
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' })); // Added from File 1

// Serve static files
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Add static file serving from File 1
app.use("/Registeruploads", express.static(path.join(__dirname, "Registeruploads"))); // Added from File 1
app.use(express.static(path.join(__dirname, "public"))); // Added from File 1

// CORS middleware from File 1 (additional implementation)
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

// Request logging middleware from File 1
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

// API Routes

// Add register route from File 1
app.use("/api/register", registerRoute); // Added from File 1

// Route to check if face recognition is available (always true for browser-based)
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

    // Convert profile photos to base64 for browser processing
    const profilesWithBase64 = [];
    
    for (const profile of profiles) {
      try {
        let base64Data = null;
        let imagePath;

        // Handle different photo path formats
        if (profile.profilePhoto.startsWith('data:')) {
          // Already base64
          base64Data = profile.profilePhoto;
        } else if (profile.profilePhoto.startsWith('http')) {
          // Remote URL - we'll let the browser handle this
          base64Data = profile.profilePhoto;
        } else {
          // Local file - convert to base64
          if (profile.profilePhoto.startsWith('/uploads/')) {
            imagePath = path.join(__dirname, profile.profilePhoto);
          } else {
            // Try uploads folder first
            imagePath = path.join(__dirname, 'uploads', path.basename(profile.profilePhoto));
            if (!fs.existsSync(imagePath)) {
              // Fallback to public folder
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
            continue; // Skip this profile
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

// Route for browser-based face matching (receives face descriptors from browser)
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
    const threshold = 0.6; // Similarity threshold

    // Compare descriptors
    for (const profileDesc of profileDescriptors) {
      try {
        // Calculate Euclidean distance
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
    
    // CREATE SESSION HERE - Get client IP and create session
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
      // Still allow login even if session creation fails
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

// Route to get specific profile details
app.get('/api/profile/:militaryId', async (req, res) => {
  try {
    const profile = await Profile.findByMilitaryId(req.params.militaryId);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile.getPublicProfile());
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint - Enhanced with File 1 approach
app.get('/api/health', async (req, res) => {
  try {
    const sessionsCount = await Session.countDocuments({});
    const activeSessionsCount = await Session.countDocuments({ logout_time: null });
    
    res.json({ 
      status: 'operational', 
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? "Connected" : "Disconnected", // Added from File 1
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

// Root route - Enhanced with File 1 approach
app.get('/', (req, res) => {
  // Check if index.html exists, otherwise show info page like File 1
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

// Error handling middleware - Enhanced with File 1 approach
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
  
  console.error('❌ Unhandled error:', error); // Added from File 1
  res.status(500).json({
    success: false,
    error: "Internal server error", // Added from File 1
    message: process.env.NODE_ENV === 'development' ? error.message : "Something went wrong!" // Added from File 1
  });
});

// 404 handler - Enhanced with File 1 approach
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found", // Added from File 1
    path: req.path, // Added from File 1
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
    console.log("📊 Database: securecomm_db"); // Added from File 1
    
    // Start the server
    app.listen(PORT, () => {
      console.log('\n🚀 ===== MILITARY SECURECOMM SERVER =====');
      console.log(`📍 URL: http://localhost:${PORT}`);
      console.log(`🔐 System Status: SECURE & OPERATIONAL`);
      console.log(`🤖 Face Recognition: BROWSER-BASED ENABLED ✅`);
      console.log('📊 API Endpoints:');
      console.log('   - GET  /api/health');
      console.log('   - POST /api/register'); // Added from File 1
      console.log('   - GET  /api/face-recognition-status');
      console.log('   - GET  /api/profiles/photos');
      console.log('   - POST /api/face-match');
      console.log('   - POST /api/authenticate');
      console.log('   - GET  /api/profile/:militaryId');
      console.log('   - POST /api/logout');
      console.log('   - GET  /api/sessions/:militaryId');
      console.log('=====================================\n');
      
      console.log('💡 Using browser-based face recognition with TensorFlow.js');
      console.log('💡 No server-side Canvas dependencies required!');
      console.log(`📝 Registration endpoint: http://localhost:${PORT}/api/register`); // Added from File 1
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error("❌ MongoDB connection error:", error); // Added from File 1
    process.exit(1);
  }
}

// MongoDB connection event handlers from File 1
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
  console.log('\n⚠️ Received SIGINT. Shutting down gracefully...'); // Added from File 1
  
  try {
    await mongoose.connection.close();
    console.log('🔒 Database connection closed');
    console.log('✅ Database connection closed.'); // Added from File 1
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