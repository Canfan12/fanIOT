import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBYrHD9zxBD82-P7xNhVPAemyXgLwlzUNQ",
  authDomain: "iott-esp32.firebaseapp.com",
  databaseURL: "https://iott-esp32-default-rtdb.firebaseio.com",
  projectId: "iott-esp32",
  storageBucket: "iott-esp32.firebasestorage.app",
  messagingSenderId: "283091157904",
  appId: "1:283091157904:web:38b1c1feb7dcd328c16915",
  measurementId: "G-VCS85WLSRB"
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: [browserLocalPersistence, browserSessionPersistence, inMemoryPersistence],
  popupRedirectResolver: browserPopupRedirectResolver
});
export const database = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();
