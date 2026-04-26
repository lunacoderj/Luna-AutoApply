// src/lib/firebase-admin.js
import admin from 'firebase-admin';

let initialized = false;

function initFirebase() {
  if (initialized) return admin;

  let projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Clean up potential quotes from .env
  if (projectId?.startsWith('"')) projectId = projectId.slice(1, -1);
  if (clientEmail?.startsWith('"')) clientEmail = clientEmail.slice(1, -1);
  if (privateKey?.startsWith('"')) privateKey = privateKey.slice(1, -1);

  if (privateKey) {
    // Remove quotes if present
    privateKey = privateKey.trim();
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }
    if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
      privateKey = privateKey.substring(1, privateKey.length - 1);
    }

    // Convert literal \n back to real newlines
    privateKey = privateKey.replace(/\\n/g, '\n');

    // Robust PEM check: ensure header and footer have proper newlines
    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';

    if (privateKey.includes(header) && !privateKey.startsWith(header)) {
      privateKey = privateKey.substring(privateKey.indexOf(header));
    }
    if (privateKey.includes(footer) && !privateKey.endsWith(footer)) {
      privateKey = privateKey.substring(0, privateKey.indexOf(footer) + footer.length);
    }
  }

  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (admin.apps.length > 0) {
    initialized = true;
    return admin.app();
  }

  try {
    if (projectId && clientEmail && privateKey) {
      // Final sanity check on key format
      if (!privateKey.includes('\n')) {
        console.warn('[Firebase] Private key has no newlines, attempting to fix...');
        // If it's one long line, we might need to add newlines after header/footer
        privateKey = privateKey
          .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
          .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
      }

      console.log(`[Firebase] Initializing project: ${projectId}`);
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      console.log('[Firebase] ✅ Admin SDK Initialized');
    } else if (credentialsFile) {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      console.log('[Firebase] ✅ Admin SDK Initialized (ADC)');
    } else {
      console.warn('[Firebase] ⚠️ No credentials found — auth middleware will fail.');
      admin.initializeApp();
    }
  } catch (err) {
    console.error('[Firebase] ❌ Initialization error:', err.message);
  }

  initialized = true;
  return admin;
}

export default initFirebase();
