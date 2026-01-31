
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env.local') });

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT || path.join(__dirname, 'serviceAccountKey.json');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} else {
  try {
    admin.initializeApp();
  } catch (e) {
    console.error('Failed to init firebase:', e);
    process.exit(1);
  }
}

const db = admin.firestore();

async function deleteChunks() {
  console.log('Finding chunks...');
  const snapshot = await db.collectionGroup('chunks').get();

  if (snapshot.empty) {
    console.log('No chunks found.');
    return;
  }

  console.log(`Found ${snapshot.size} chunks. Deleting...`);

  const batchSize = 500;
  let batch = db.batch();
  let count = 0;
  let totalDeleted = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;
    if (count >= batchSize) {
      await batch.commit();
      totalDeleted += count;
      console.log(`Deleted ${totalDeleted} chunks...`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    totalDeleted += count;
  }

  console.log(`Finished. Deleted ${totalDeleted} chunks.`);
}

deleteChunks().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
