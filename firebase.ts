
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyB600o5jXYF9n29W8cA4d5IzaM_Je4Usr0",
    authDomain: "diretoria-adm-bsf.firebaseapp.com",
    projectId: "diretoria-adm-bsf",
    storageBucket: "diretoria-adm-bsf.firebasestorage.app",
    messagingSenderId: "58118601035",
    appId: "1:58118601035:web:cf5f0c213929acab7510ce",
    measurementId: "G-4XSJVRW2FB"
};

const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export { app, analytics };
