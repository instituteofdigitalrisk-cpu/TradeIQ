import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { Platform } from "react-native";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBOOJfdXxrbgR6lmGHjrFPlGwx24-NCtyw",
  authDomain: "tradeiq-26.firebaseapp.com",
  projectId: "tradeiq-26",
  storageBucket: "tradeiq-26.firebasestorage.app",
  messagingSenderId: "1013397127798",
  appId: "1:1013397127798:web:291855f83ec0abf0659557",
  measurementId: "G-WQZ7BE0H9Q"
};

// Initialize Firebase exactly once. The app's backend session/token is persisted
// through auth-store.ts using AsyncStorage on native platforms.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

export const analyticsPromise =
  Platform.OS === "web"
    ? import("firebase/analytics")
        .then(({ getAnalytics, isSupported }) =>
          isSupported().then((supported) => (supported ? getAnalytics(app) : null)),
        )
        .catch(() => null)
    : Promise.resolve(null);
