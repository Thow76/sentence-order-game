// Firebase project: projectv20-ad8ba
// This config is not a secret — it identifies the project to the client SDK.
// All access control lives in firestore.rules, not here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDmPIcQ8C8Vo-efMwCMosMzrpPD8WrnEbQ",
  authDomain: "projectv20-ad8ba.firebaseapp.com",
  projectId: "projectv20-ad8ba",
  storageBucket: "projectv20-ad8ba.firebasestorage.app",
  messagingSenderId: "194652436557",
  appId: "1:194652436557:web:c4f130c9058e21c1e64404",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
