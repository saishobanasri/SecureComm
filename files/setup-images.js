const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function setupImages() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/securecomm_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log('📁 Created uploads directory');
    }

    // Get all profiles
    const profiles = await mongoose.connection.db.collection('profiles').find({}).toArray();
    console.log(`📋 Found ${profiles.length} profiles to check`);

    console.log('\n📊 Profile Image Status:');
    console.log('========================');

    let needsImageFiles = [];

    for (const profile of profiles) {
      console.log(`\n🔍 Checking profile: ${profile.name}`);
      console.log(`📸 Current photo path: ${profile.profilePhoto}`);

      let imageExists = false;
      let imagePath = '';

      // Check different possible locations
      if (profile.profilePhoto.startsWith('/uploads/')) {
        imagePath = path.join(__dirname, profile.profilePhoto);
        imageExists = fs.existsSync(imagePath);
      } else if (profile.profilePhoto.startsWith('data:')) {
        imageExists = true; // Base64 data
        console.log('✅ Base64 image data found');
      } else if (profile.profilePhoto.startsWith('http')) {
        imageExists = true; // Remote URL
        console.log('✅ Remote URL found');
      } else {
        // Try uploads folder
        const fileName = path.basename(profile.profilePhoto);
        imagePath = path.join(uploadsDir, fileName);
        imageExists = fs.existsSync(imagePath);
        
        if (!imageExists) {
          // Try public folder
          const publicPath = path.join(__dirname, 'public', profile.profilePhoto);
          if (fs.existsSync(publicPath)) {
            imageExists = true;
            imagePath = publicPath;
            console.log(`✅ Found in public folder: ${publicPath}`);
            
            // Copy to uploads folder for better organization
            const newPath = path.join(uploadsDir, fileName);
            fs.copyFileSync(publicPath, newPath);
            console.log(`📋 Copied to uploads folder: ${newPath}`);
            
            // Update database path
            await mongoose.connection.db.collection('profiles').updateOne(
              { _id: profile._id },
              { $set: { profilePhoto: `/uploads/${fileName}` } }
            );
            console.log(`🔄 Updated database path to: /uploads/${fileName}`);
          }
        }
      }

      if (imageExists) {
        console.log(`✅ Image file exists: ${imagePath}`);
      } else {
        console.log(`❌ Image file missing: ${profile.profilePhoto}`);
        needsImageFiles.push({
          name: profile.name,
          militaryId: profile.militaryId,
          expectedPath: profile.profilePhoto,
          fileName: path.basename(profile.profilePhoto)
        });
      }
    }

    if (needsImageFiles.length > 0) {
      console.log('\n⚠️  MISSING IMAGE FILES:');
      console.log('========================');
      needsImageFiles.forEach(profile => {
        console.log(`❌ ${profile.name} (${profile.militaryId})`);
        console.log(`   Expected: ${profile.expectedPath}`);
        console.log(`   File needed: ${profile.fileName}`);
        console.log(`   Place in: ${path.join(__dirname, 'uploads', profile.fileName)}`);
        console.log('   ---');
      });
      
      console.log('\n💡 INSTRUCTIONS:');
      console.log('1. Copy the missing image files to the uploads folder');
      console.log(`2. Uploads folder location: ${uploadsDir}`);
      console.log('3. Make sure image file names match exactly');
      console.log('4. Supported formats: .jpg, .jpeg, .png, .gif');
      console.log('5. Run this script again to verify');
    } else {
      console.log('\n✅ ALL IMAGE FILES FOUND!');
      console.log('🎯 Your face recognition system should work properly now.');
    }

    console.log('\n📊 FINAL SETUP STATUS:');
    console.log('======================');
    console.log(`✅ Database connected: ${mongoose.connection.readyState === 1}`);
    console.log(`✅ Uploads folder exists: ${fs.existsSync(uploadsDir)}`);
    console.log(`✅ Profiles in database: ${profiles.length}`);
    console.log(`✅ Images found: ${profiles.length - needsImageFiles.length}`);
    console.log(`❌ Images missing: ${needsImageFiles.length}`);
    
    if (needsImageFiles.length === 0) {
      console.log('\n🚀 READY TO START!');
      console.log('Run: npm start');
      console.log('Then visit: http://localhost:3000/login.html');
    }

  } catch (error) {
    console.error('❌ Error during setup:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 Database connection closed');
    process.exit(0);
  }
}

setupImages();