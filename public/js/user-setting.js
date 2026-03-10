import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth,
  signOut,
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  inMemoryPersistence
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

window.addEventListener('pagehide', (event) => {});

const backButtonTrap = () => {
    window.history.pushState(null, null, window.location.href);
    window.onpopstate = function() {
        window.history.go(1);
    };
};
backButtonTrap();

const firebaseConfig = {
    apiKey: "AIzaSyCq4lH4tj4AS9-cqvM29um--Nu4v2UdvZw",
    authDomain: "agriknows-data.firebaseapp.com",
    databaseURL: "https://agriknows-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "agriknows-data",
    storageBucket: "agriknows-data.firebasestorage.app",
    messagingSenderId: "922008629713",
    appId: "1:922008629713:web:5cf15ca9d47036b9a8f0f0"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || "";

setPersistence(auth, browserLocalPersistence)
    .then(() => { console.log("✅ Auth persistence set to LOCAL"); })
    .catch((error) => { console.error("❌ Persistence error:", error); });

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("✅ User logged in:", user.uid);
    } else {
        console.log("❌ No user logged in — redirecting");
        window.location.replace("/login");
    }
});

const emailInput = document.getElementById('user-email');
const usernameInput = document.getElementById('user-username');
const saveUserInfoBtn = document.getElementById('save-user-info-btn');
const currentPassInput = document.getElementById('current-password');
const newPassInput = document.getElementById('new-password');
const confirmPassInput = document.getElementById('confirm-password');
const savePassBtn = document.getElementById('save-password-btn');
const passwordToggles = document.querySelectorAll('.password-toggle');

let currentUser = null;

// ==================== LOGOUT POPUP ====================
function createLogoutPopup() {
    // Avoid duplicates
    if (document.getElementById('logout-popup-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'logout-popup-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    overlay.innerHTML = `
        <div style="
            background: white;
            border-radius: 14px;
            padding: 32px 28px;
            max-width: 360px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.18);
            font-family: inherit;
        ">
            <div style="font-size: 40px; margin-bottom: 12px;">👋</div>
            <h3 style="margin-bottom: 8px; color: #1a1a1a; font-size: 18px;">Mag-logout?</h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
                Sigurado ka bang gusto mong mag-logout sa iyong account?
            </p>
            <div style="display: flex; gap: 10px;">
                <button id="logout-cancel-btn" style="
                    flex: 1; padding: 11px;
                    border: 1.5px solid #ddd;
                    border-radius: 8px;
                    background: white;
                    color: #555;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                ">Kanselahin</button>
                <button id="logout-confirm-btn" style="
                    flex: 1; padding: 11px;
                    border: none;
                    border-radius: 8px;
                    background: #c0392b;
                    color: white;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                ">Oo, Mag-logout</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Cancel
    document.getElementById('logout-cancel-btn').addEventListener('click', () => {
        overlay.remove();
    });

    // Confirm logout
    document.getElementById('logout-confirm-btn').addEventListener('click', async () => {
        // Replace buttons with success message
        overlay.querySelector('div').innerHTML = `
            <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
            <h3 style="margin-bottom: 8px; color: #2d6a4f; font-size: 18px;">Logged out successfully!</h3>
            <p style="color: #666; font-size: 14px;">Ikaw ay na-logout na. Sandali lang...</p>
        `;

        try {
            await setPersistence(auth, inMemoryPersistence);
            await signOut(auth);
            localStorage.clear();
            sessionStorage.clear();
            const dbNames = ['firebaseLocalStorageDb', 'firebase-heartbeat-database'];
            for (const dbName of dbNames) {
                try { indexedDB.deleteDatabase(dbName); } catch (e) {}
            }
        } catch (error) {
            console.error('Logout error:', error);
            localStorage.clear();
            sessionStorage.clear();
        }

        // Short delay para makita ng user yung success message
        setTimeout(() => {
            window.location.replace('/logout');
        }, 1500);
    });
}

// ==================== SYNC + LOAD ====================
async function syncLaravelSession(user, nameOverride = null) {
    const idToken = await user.getIdToken(true);
    const response = await fetch('/auth/firebase-login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-TOKEN': csrfToken,
        },
        body: JSON.stringify({
            idToken,
            name: nameOverride || user.displayName || null,
        }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.message || 'Failed to sync session.');
    return payload;
}

async function loadSessionUser() {
    try {
        const response = await fetch('/get-user', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const sessionUser = await response.json();
        if (sessionUser) {
            usernameInput.value = sessionUser.username || '';
            emailInput.value = sessionUser.email || '';
        }
    } catch (error) {
        console.error('Failed to load session user:', error);
    }
}

loadSessionUser();

onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUser = user;
    if (!usernameInput.value) usernameInput.value = user.displayName || '';
    if (!emailInput.value) emailInput.value = user.email || '';
});

// ==================== PASSWORD TOGGLE ====================
passwordToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
        const targetId = toggle.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            toggle.textContent = '🙉';
        } else {
            passwordInput.type = 'password';
            toggle.textContent = '🙈';
        }
    });
});

// ==================== SAVE USERNAME ====================
saveUserInfoBtn.addEventListener('click', async () => {
    if (!currentUser) { alert('Error: No user is currently logged in.'); return; }
    const newUsername = usernameInput.value.trim();
    const newEmail = emailInput.value.trim();
    let updates = {};
    let changesMade = false;

    if (newUsername !== (currentUser.displayName || '')) {
        updates.displayName = newUsername;
        changesMade = true;
    }
    if (newEmail !== currentUser.email) {
        alert("To change your email address, you must first re-authenticate.");
        emailInput.value = currentUser.email;
        return;
    }
    if (!changesMade) { alert('No changes detected in username.'); return; }
    if (updates.displayName) {
        try {
            await updateProfile(currentUser, updates);
            await syncLaravelSession(currentUser, newUsername);
            alert('Username updated successfully!');
            currentUser.displayName = newUsername;
        } catch (error) {
            console.error('Username update error:', error);
            alert('Error updating username: ' + error.message);
        }
    }
});

// ==================== SAVE PASSWORD ====================
savePassBtn.addEventListener('click', async () => {
    if (!currentUser) { alert('Error: No user is currently logged in.'); return; }
    const currentPassword = currentPassInput.value;
    const newPassword = newPassInput.value;
    const confirmPassword = confirmPassInput.value;
    if (!currentPassword || !newPassword || !confirmPassword) { alert('Please fill in all password fields.'); return; }
    if (newPassword !== confirmPassword) { alert('New password and confirm password do not match.'); return; }
    const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
    try {
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        alert('Password updated successfully!');
        currentPassInput.value = '';
        newPassInput.value = '';
        confirmPassInput.value = '';
    } catch (error) {
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
            alert('Error: Incorrect current password or user not found.');
        } else if (error.code === 'auth/weak-password') {
            alert('Error: The new password is too weak.');
        } else {
            console.error('Password update error:', error);
            alert('Error updating password: ' + error.message);
        }
    }
});

// ==================== LOGOUT BUTTON ====================
document.getElementById('logout-btn').addEventListener('click', () => {
    createLogoutPopup();
});