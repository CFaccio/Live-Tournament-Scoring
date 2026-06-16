import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc, collection, query, where, onSnapshot, serverTimestamp, arrayUnion, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfeeRJN-J80Dzp_iTDHraa7ellGFlr2Ho",
  authDomain: "live-tournament-scoring-app.firebaseapp.com",
  projectId: "live-tournament-scoring-app",
  storageBucket: "live-tournament-scoring-app.firebasestorage.app",
  messagingSenderId: "101013788019",
  appId: "1:101013788019:web:57e6074daf7bca8783a106",
  measurementId: "G-3Y0BGN1VMY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export {
  GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
  doc, setDoc, getDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, onSnapshot, serverTimestamp, arrayUnion, Timestamp
};
