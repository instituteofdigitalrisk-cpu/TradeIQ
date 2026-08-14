import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth } from "firebase/auth";
import type { Persistence } from "firebase/auth";
import * as FirebaseAuth from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

// Use the matching Firebase client configuration for each platform.
const firebaseConfig = {
  apiKey: isWeb ? "AIzaSyBOOJfdXxrbgR6lmGHjrFPlGwx24-NCtyw" : "AIzaSyABJIIXZljuRcqx9Y7uQN1FFEp7qKpp3BM",
  authDomain: "tradeiq-26.firebaseapp.com",
  projectId: "tradeiq-26",
  storageBucket: "tradeiq-26.firebasestorage.app",
  messagingSenderId: "1013397127798",
  appId: isWeb
    ? "1:1013397127798:web:291855f83ec0abf0659557"
    : "1:1013397127798:android:affc54be5e7806b4659557",
};

// Initialize Firebase App
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth with cross-platform persistence
export const firebaseAuth =
  Platform.OS === "web"
    ? getAuth(app)
    : (() => {
        try {
          // Firebase's public facade types omit this React Native export even
          // though Metro resolves it from the RN build at runtime.
          const getReactNativePersistence = (
            FirebaseAuth as typeof FirebaseAuth & {
              getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
            }
          ).getReactNativePersistence;
          return initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage) as Persistence,
          });
        } catch {
          // Fallback if auth is already initialized during Fast Refresh
          return getAuth(app);
        }
      })();

// Alias export for compatibility
export const auth = firebaseAuth;

// Optional Web Analytics handler
export const analyticsPromise =
  Platform.OS === "web"
    ? import("firebase/analytics")
        .then(({ getAnalytics, isSupported }) =>
          isSupported().then((supported) => (supported ? getAnalytics(app) : null)),
        )
        .catch(() => null)
    : Promise.resolve(null);

export default app;
