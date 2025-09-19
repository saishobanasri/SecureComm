// Run this script to set up test passwords for your existing profiles

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Connect to MongoDB
async function setupDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/securecomm_db', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Update existing profiles with test password
    const testPassword = 'military123'; // Test password for all profiles
    const hashedPassword = await bcrypt.hash(testPassword, 12);

    console.log('🔐 Setting up test passwords...');
    console.log(`📝 Test password for all users: ${testPassword}`);

    // FIXED: Update the correct field names to match your existing database
    const result = await mongoose.connection.db.collection('profiles').updateMany(
      {}, // Update all documents
      { 
        $set: { 
          password: hashedPassword,
          hashedPassword: hashedPassword
        } 
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} profiles with test password`);

    // Show current profiles
    const profiles = await mongoose.connection.db.collection('profiles').find({}, {
      projection: { name: 1, militaryId: 1, email: 1, profilePhoto: 1 }
    }).toArray();

    console.log('\n📋 Current Profiles in Database:');
    console.log('================================');
    profiles.forEach((profile, index) => {
      console.log(`   Military ID: ${profile.militaryId}`);
      console.log(`   Photo: ${profile.profilePhoto}`);
      console.log(`   Password: ${testPassword} (for testing)`);
      console.log('   ---');
    });

    console.log('\n🎯 Database setup complete!');
    console.log(`💡 You can now login with any military ID and password: ${testPassword}`);

  } catch (error) {
    console.error('❌ Database setup error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔒 Database connection closed');
    process.exit(0);
  }
}

setupDatabase();