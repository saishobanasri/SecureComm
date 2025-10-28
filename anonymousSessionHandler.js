// anonymousSessionHandler.js
// Complete implementation for persistent anonymous sessions using only Message collection
// Place this file in the same directory as your server.js

const crypto = require('crypto');

/**
 * Gets or creates anonymous session IDs for a conversation.
 * - If no messages exist: Uses current session IDs (new conversation)
 * - If both users hid ALL messages: Uses current session IDs (fresh start)
 * - Otherwise: Reuses session IDs from the oldest message (persistent)
 * 
 * @param {string} userA_militaryId - First user's military ID (e.g., "IC-12345")
 * @param {string} userA_currentSession - First user's current session ID (e.g., "SES-AAAAA")
 * @param {string} userB_militaryId - Second user's military ID (e.g., "IC-67890")
 * @param {string} userB_currentSession - Second user's current session ID (e.g., "SES-BBBBB")
 * @returns {Promise<object>} { sessionA, sessionB, isNewConversation }
 */
async function getAnonymousSessionIds(
  userA_militaryId, 
  userA_currentSession,
  userB_militaryId, 
  userB_currentSession
) {
  const Message = require('./models/Message');

  // Find ALL anonymous messages between these two users
  const existingMessages = await Message.find({
    $or: [
      { senderId: userA_militaryId, receiverId: userB_militaryId, isAnonymous: true },
      { senderId: userB_militaryId, receiverId: userA_militaryId, isAnonymous: true }
    ]
  }).sort({ createdAt: 1 }); // Sort by oldest first

  // CASE 1: No messages exist - this is a brand new conversation
  if (existingMessages.length === 0) {
    console.log(`🆕 New anonymous conversation between ${userA_militaryId} and ${userB_militaryId}`);
    console.log(`   Using current session IDs: ${userA_currentSession} ↔ ${userB_currentSession}`);
    
    return {
      sessionA: userA_currentSession,
      sessionB: userB_currentSession,
      isNewConversation: true
    };
  }

  // CASE 2: Check if BOTH users have hidden ALL messages
  const bothHaveHidden = existingMessages.every(msg => 
    msg.deletedBy.includes(userA_militaryId) && 
    msg.deletedBy.includes(userB_militaryId)
  );

  if (bothHaveHidden) {
    console.log(`🔄 Both users hid all messages. Starting fresh conversation.`);
    console.log(`   Using NEW session IDs: ${userA_currentSession} ↔ ${userB_currentSession}`);
    
    return {
      sessionA: userA_currentSession,
      sessionB: userB_currentSession,
      isNewConversation: true
    };
  }

  // CASE 3: Messages exist and at least one user hasn't hidden them
  // Reuse the session IDs from the OLDEST message
  const firstMessage = existingMessages[0];
  
  // Determine which session belongs to which user
  let sessionA, sessionB;
  
  if (firstMessage.senderId === userA_militaryId) {
    // User A sent the first message
    sessionA = firstMessage.anonymousSenderSession;
    sessionB = firstMessage.anonymousReceiverSession;
  } else {
    // User B sent the first message
    sessionA = firstMessage.anonymousReceiverSession;
    sessionB = firstMessage.anonymousSenderSession;
  }

  console.log(`♻️ Using existing session IDs from oldest message`);
  console.log(`   Sessions: ${sessionA} ↔ ${sessionB}`);
  
  return {
    sessionA: sessionA,
    sessionB: sessionB,
    isNewConversation: false
  };
}

/**
 * Gets the display names (session IDs) for an anonymous conversation.
 * Used when rendering the chat UI to show what session IDs to display.
 * 
 * @param {string} myMilitaryId - The current user's military ID
 * @param {string} otherMilitaryId - The other user's military ID
 * @returns {Promise<object>} { myDisplaySession, otherDisplaySession }
 */
async function getAnonymousDisplayNames(myMilitaryId, otherMilitaryId) {
  const Message = require('./models/Message');

  // Find messages that are NOT deleted by the current user
  // (Only messages visible to ME)
  const myVisibleMessages = await Message.find({
    $or: [
      { senderId: myMilitaryId, receiverId: otherMilitaryId, isAnonymous: true },
      { senderId: otherMilitaryId, receiverId: myMilitaryId, isAnonymous: true }
    ],
    deletedBy: { $ne: myMilitaryId } // Not in MY deletedBy array
  }).sort({ createdAt: 1 }); // Oldest first

  // If no visible messages, return placeholder
  if (myVisibleMessages.length === 0) {
    console.log(`📭 No visible messages between ${myMilitaryId} and ${otherMilitaryId}`);
    return { 
      myDisplaySession: 'ANON-NEW', 
      otherDisplaySession: 'ANON-NEW' 
    };
  }

  // Use the OLDEST visible message to determine display names
  const firstMessage = myVisibleMessages[0];
  
  let myDisplaySession, otherDisplaySession;
  
  if (firstMessage.senderId === myMilitaryId) {
    // I sent this message
    myDisplaySession = firstMessage.anonymousSenderSession;
    otherDisplaySession = firstMessage.anonymousReceiverSession;
  } else {
    // They sent this message
    myDisplaySession = firstMessage.anonymousReceiverSession;
    otherDisplaySession = firstMessage.anonymousSenderSession;
  }

  console.log(`📺 Display names for ${myMilitaryId}:`);
  console.log(`   My session: ${myDisplaySession}`);
  console.log(`   Other session: ${otherDisplaySession}`);

  return { myDisplaySession, otherDisplaySession };
}

/**
 * Checks if an anonymous conversation has any visible messages for a user.
 * Used to determine if the conversation should appear in the chat list.
 * 
 * @param {string} userId - The user's military ID
 * @param {string} otherUserId - The other user's military ID
 * @returns {Promise<boolean>} True if there are visible messages
 */
async function hasVisibleAnonymousMessages(userId, otherUserId) {
  const Message = require('./models/Message');
  
  // Count messages NOT deleted by this user
  const count = await Message.countDocuments({
    $or: [
      { senderId: userId, receiverId: otherUserId, isAnonymous: true },
      { senderId: otherUserId, receiverId: userId, isAnonymous: true }
    ],
    deletedBy: { $ne: userId } // Not in this user's deletedBy array
  });

  const hasMessages = count > 0;
  console.log(`🔍 ${userId} has ${count} visible anonymous messages with ${otherUserId}`);
  
  return hasMessages;
}

// Export all functions for use in server.js
module.exports = {
  getAnonymousSessionIds,
  getAnonymousDisplayNames,
  hasVisibleAnonymousMessages
};