
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentSingleTabManager,
    memoryLocalCache
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const isConfigValid = !!firebaseConfig.projectId && !!firebaseConfig.apiKey;


let app;
try {
    app = initializeApp(firebaseConfig);
} catch (error) {
    console.error("Firebase initialization failed:", error);
}

const analytics = (typeof window !== 'undefined' && isConfigValid && app)
    ? getAnalytics(app)
    : null;

let db = null;
if (app && isConfigValid) {
    try {
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentSingleTabManager({ forceOwnership: true })
            })
        });
    } catch {
        db = initializeFirestore(app, {
            localCache: memoryLocalCache()
        });
    }
}


export { app, analytics, db };
