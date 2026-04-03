import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getDatabase,
  ref,
  update,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

//web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCq4lH4tj4AS9-cqvM29um--Nu4v2UdvZw",
    authDomain: "agriknows-data.firebaseapp.com",
    databaseURL: "https://agriknows-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "agriknows-data",
    storageBucket: "agriknows-data.firebasestorage.app",
    messagingSenderId: "922008629713",
    appId: "1:922008629713:web:5cf15ca9d47036b9a8f0f0"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getDatabase(app);

// =====================
//   TOAST HELPER
// =====================
function showToast(message, type = "success", duration = 4000) {
  // Create toast element if it doesn't exist yet
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.innerHTML = `<span class="toast-icon"></span><span class="toast-message"></span>`;
    document.body.appendChild(toast);
  }

  const icon = toast.querySelector(".toast-icon");
  const msg = toast.querySelector(".toast-message");

  icon.textContent = type === "success" ? "✔" : "✖";
  msg.textContent = message;

  // Reset classes
  toast.className = "";
  toast.classList.add(type, "show");

  // Auto-hide after duration
  clearTimeout(toast._hideTimeout);
  toast._hideTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

async function ensureUserProfileInDatabase(user) {
  const userRef = ref(db, `users/${user.uid}`);
  const fallbackName = user.email ? user.email.split("@")[0] : "User";

  await update(userRef, {
    username: user.displayName || fallbackName,
    email: user.email || "",
    provider: user.providerData?.[0]?.providerId || "password",
    last_login_at: new Date().toISOString(),
  });
}

async function createLaravelSessionFromFirebaseUser(user) {
  const idToken = await user.getIdToken();
  const csrfToken = document.querySelector('input[name="_token"]')?.value;

  const response = await fetch("/auth/firebase-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-CSRF-TOKEN": csrfToken || "",
    },
    body: JSON.stringify({
      idToken,
      name: user.displayName || null,
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Server session login failed.");
  }

  return payload;
}

// Show/hide password toggle
document.addEventListener("DOMContentLoaded", () => {
  const togglePassword = document.getElementById("togglePassword");
  if (togglePassword) {
    togglePassword.addEventListener("click", () => {
      const password = document.getElementById("password");
      const isHidden = password.type === "password";
      password.type = isHidden ? "text" : "password";
      togglePassword.src = isHidden
        ? togglePassword.dataset.hide
        : togglePassword.dataset.show;
    });
  }
});

// Google Sign-In
const googleLoginBtn = document.getElementById("google-login-btn");
if (googleLoginBtn) {
  const provider = new GoogleAuthProvider();

  googleLoginBtn.addEventListener("click", async (event) => {
    event.preventDefault();

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      await ensureUserProfileInDatabase(user);
      const payload = await createLaravelSessionFromFirebaseUser(user);
      window.location.href = payload.redirect || "/welcome";
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      showToast(error.message || "Google sign-in failed.", "error");
    }
  });
}

// Email/Password Login
const loginForm = document.querySelector("form.login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email")?.value?.trim();
    const password = document.getElementById("password")?.value;

    if (!email || !password) {
      showToast("Please enter email and password.", "error");
      return;
    }

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await ensureUserProfileInDatabase(credential.user);
      const payload = await createLaravelSessionFromFirebaseUser(credential.user);
      window.location.href = payload.redirect || "/welcome";
    } catch (error) {
      console.error("Email login error:", error);
      showToast(error.message || "Login failed.", "error");
    }
  });
}

// Forgot Password / Reset
const reset = document.getElementById("reset");
if (reset) {
  reset.addEventListener("click", function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();

    if (!email) {
      showToast("Please enter your email address first.", "error");
      return;
    }

    sendPasswordResetEmail(auth, email)
      .then(() => {
        showToast("Password reset email sent! Check your inbox.", "success");
      })
      .catch((error) => {
        console.error("Reset error:", error);
        showToast(error.message || "Failed to send reset email.", "error");
      });
  });
}

