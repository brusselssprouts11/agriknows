import {
    getDatabase,
    ref,
    get,
    onValue,
    query,
    equalTo,
    limitToLast,
    orderByChild,
    startAt,
    set,
    update,
    remove,
    push,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-database.js";
import {
    initializeApp,
    getApps,
    getApp,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";

//latest agriknows 2026-07-03

const firebaseConfig = {
    apiKey: "AIzaSyCq4lH4tj4AS9-cqvM29um--Nu4v2UdvZw",
    authDomain: "agriknows-data.firebaseapp.com",
    databaseURL:
        "https://agriknows-data-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "agriknows-data",
    storageBucket: "agriknows-data.firebasestorage.app",
    messagingSenderId: "922008629713",
    appId: "1:922008629713:web:5cf15ca9d47036b9a8f0f0",
};

//--------popup------------
function showPopup(message) {
    const popup = document.getElementById("popup");
    const overlay = document.getElementById("overlay");
    const popupText = document.getElementById("popup-text");
    popupText.innerHTML = message;
    popup.classList.remove("hidden");
    overlay.classList.remove("hidden");
    document.getElementById("popup-btn").addEventListener("click", () => {
        document.getElementById("popup").classList.add("hidden");
        document.getElementById("overlay").classList.add("hidden");
    });
}
window.showPopup = showPopup;

// ==================== REUSABLE CONFIRM POPUP ====================
function showConfirmPopup(icon, title, message, cancelText = "Kanselahin", confirmText = "Oo") {
    return new Promise((resolve) => {
        if (document.getElementById("confirm-popup-overlay")) {
            document.getElementById("confirm-popup-overlay").remove();
        }
        const overlay = document.createElement("div");
        overlay.id = "confirm-popup-overlay";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;";
        overlay.innerHTML = `<div style="background:white;border-radius:14px;padding:32px 28px;max-width:360px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.18);font-family:inherit;"><div style="font-size:40px;margin-bottom:12px;">${icon}</div><h3 style="margin-bottom:8px;color:#1a1a1a;font-size:18px;">${title}</h3><p style="color:#666;font-size:14px;margin-bottom:24px;line-height:1.5;">${message}</p><div style="display:flex;gap:10px;"><button id="confirm-popup-cancel" style="flex:1;padding:11px;border:1.5px solid #ddd;border-radius:8px;background:white;color:#555;font-size:14px;font-weight:600;cursor:pointer;">${cancelText}</button><button id="confirm-popup-ok" style="flex:1;padding:11px;border:none;border-radius:8px;background:#c0392b;color:white;font-size:14px;font-weight:600;cursor:pointer;">${confirmText}</button></div></div>`;
        document.body.appendChild(overlay);
        document.getElementById("confirm-popup-cancel").addEventListener("click", () => { overlay.remove(); resolve(false); });
        document.getElementById("confirm-popup-ok").addEventListener("click", () => { overlay.remove(); resolve(true); });
    });
}

//-------------------------------------Firebase Initialization--------------------
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const database = getDatabase(app);
const db = getDatabase(app);
const dbPath = "sensorData";
let cachedSessionUser = null;

async function getSessionUser() {
    if (cachedSessionUser) return cachedSessionUser;
    try {
        const response = await fetch("/get-user", { headers: { Accept: "application/json" } });
        if (!response.ok) return null;
        const sessionUser = await response.json();
        cachedSessionUser = sessionUser || null;
        return cachedSessionUser;
    } catch (error) {
        console.error("Failed to fetch session user:", error);
        return null;
    }
}

async function getResolvedUser() {
    if (auth.currentUser?.uid) {
        return { uid: auth.currentUser.uid, email: auth.currentUser.email || null };
    }
    const sessionUser = await getSessionUser();
    if (sessionUser?.id) {
        return { uid: sessionUser.id, email: sessionUser.email || null };
    }
    return null;
}

function getUserCropsQuery(userId) {
    return query(ref(db, "crop"), orderByChild("user_id"), equalTo(userId));
}

function isRecordOwnedByUser(record, userId, deviceId) {
    if (!record) return false;
    if (deviceId && record.deviceId) {
        return String(record.deviceId) === String(deviceId);
    }
    const ownerId = record.user_id || record.userId || record.uid || null;
    return String(ownerId || "") === String(userId);
}

async function getDeviceIdForUser() {
    try {
        const authUser = auth.currentUser;
        if (!authUser?.email) return null;
        const usersSnap = await get(ref(db, "users"));
        if (!usersSnap.exists()) return null;
        const users = usersSnap.val();
        for (const [key, userData] of Object.entries(users)) {
            if (userData.email === authUser.email && userData.deviceId) {
                console.log("Found deviceId for user:", userData.deviceId);
                return userData.deviceId;
            }
        }
    } catch (e) {
        console.error("Error getting deviceId for user:", e);
    }
    return null;
}

function decodePushIdTimestamp(pushId) {
    const PUSH_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";
    if (!pushId || pushId.length < 8) return 0;
    let timestamp = 0;
    for (let i = 0; i < 8; i += 1) {
        const charIndex = PUSH_CHARS.indexOf(pushId.charAt(i));
        if (charIndex < 0) return 0;
        timestamp = timestamp * 64 + charIndex;
    }
    return timestamp;
}

function getRecordTimestamp(record, fallbackId = "") {
    if (!record) return 0;
    if (typeof record.timestamp === "number" && Number.isFinite(record.timestamp)) return record.timestamp;
    if (typeof record.timestamp === "string") {
        const parsed = Date.parse(record.timestamp);
        if (Number.isFinite(parsed)) return parsed;
    }
    if (typeof record.createdAt === "string") {
        const parsedCreated = Date.parse(record.createdAt);
        if (Number.isFinite(parsedCreated)) return parsedCreated;
    }
    return decodePushIdTimestamp(fallbackId || record.id || "");
}

// ==================== LOAD USER CROPS FOR MONITORING ====================
async function loadUserCropsForMonitoring() {
    if (!auth.currentUser) return;
    const userId = auth.currentUser.uid;
    try {
        const userCropsRef = getUserCropsQuery(userId);
        onValue(userCropsRef, (snapshot) => {
            if (snapshot.exists()) {
                const customCrops = snapshot.val();
                allCropData = { ...PREDEFINED_CROP_DATA, ...customCrops };
                if (typeof renderCropOptions === "function") renderCropOptions();
            } else {
                allCropData = { ...PREDEFINED_CROP_DATA };
            }
        }, (error) => { allCropData = { ...PREDEFINED_CROP_DATA }; });
    } catch (error) {
        allCropData = { ...PREDEFINED_CROP_DATA };
    }
}

setPersistence(auth, browserLocalPersistence)
    .then(() => { console.log("✅ Persistence set to LOCAL"); })
    .catch((error) => { console.error("❌ Persistence error:", error); });

onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("✅ User is logged in:", user.uid);
        currentUserEmail = user.email;
        loadHistoryData(currentTimeRange);
        currentNotificationUserId = user.uid;
        startNotificationListener();
    } else {
        console.log("❌ No user logged in — redirecting to login");
        currentUserEmail = null;
        window.location.replace("/login");
    }
});

window.addEventListener("pagehide", (event) => {});
window.onload = function () {
    if (typeof window.history.pushState === "function") {
        window.history.pushState("jt656", null, null);
        window.onpopstate = function () {
            window.history.pushState("jt656", null, null);
            window.location.href = "/login";
        };
    }
};

//-------------------------------------Global Variables-----------------------------
let deviceIdCounter = 1;
let currentDeviceId = null;
let allCropData = {};
let currentCropKey = null;
let latestHistoryData = [];
let chartInstances = {};
let currentTimeRange = "1h";
let isGraphMode = false;
let autoRefreshInterval = null;
let sensorNotifications = [];
let unreadNotificationCount = 0;
let sensorAlertStates = {};
let notificationListenerStarted = false;
let currentNotificationUserId = null;
let lastPopupTime = {};
const POPUP_COOLDOWN = 60 * 1000;

// ==================== EMAILJS CONFIG ====================
let currentUserEmail = null;
let lastEmailSentTime = {};
const EMAIL_COOLDOWN = 30 * 60 * 1000;
const EMAILJS_SERVICE_ID = 'service_l5qt0y6';
const EMAILJS_TEMPLATE_ID = 'template_jjlu31t';
const EMAILJS_PUBLIC_KEY = 'fPlF_bWJkIFtJT3v2';

const DEFAULT_SENSOR_THRESHOLDS = {
    temperature: { min: 18, max: 32 },
    moisture: { min: 40, max: 80 },
    humidity: { min: 40, max: 80 },
    ph: { min: 5.5, max: 7.5 },
};

const PREDEFINED_CROP_DATA = {
    corn:     { name: "Corn",     temperature: { min: 18, max: 28 }, moisture: { min: 75, max: 95 }, ph: { min: 6.0, max: 7.0 }, humidity: { min: 50, max: 80 } },
    rice:     { name: "Rice",     temperature: { min: 25, max: 35 }, moisture: { min: 80, max: 100 }, ph: { min: 5.0, max: 7.5 }, humidity: { min: 85, max: 90 } },
    eggplant: { name: "Eggplant", temperature: { min: 24, max: 32 }, moisture: { min: 60, max: 80 }, ph: { min: 6.0, max: 6.8 }, humidity: { min: 65, max: 80 } },
    tomato:   { name: "Tomato",   temperature: { min: 16, max: 29.5 }, moisture: { min: 70, max: 85 }, ph: { min: 6.0, max: 6.8 }, humidity: { min: 70, max: 90 } },
    onion:    { name: "Onion",    temperature: { min: 15, max: 29 }, moisture: { min: 50, max: 75 }, ph: { min: 6.0, max: 7.0 }, humidity: { min: 50, max: 60 } },
};

//---------------------------user input crop selector-------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("saveBtn").addEventListener("click", saveData);
});

async function saveData() {
    const user = await getResolvedUser();
    if (!user) { alert("Please login first!"); return; }
    const cropName = document.getElementById("CropName").value.trim();
    if (!cropName) { showPopup("Mangyaring maglagay ng pangalan ng pananim."); return; }
    const tempMin = Number(document.getElementById("tempMin").value);
    const tempMax = Number(document.getElementById("tempMax").value);
    const moistureMin = Number(document.getElementById("moistureMin").value);
    const moistureMax = Number(document.getElementById("moistureMax").value);
    const phMin = Number(document.getElementById("phMin").value);
    const phMax = Number(document.getElementById("phMax").value);
    const humidityMin = Number(document.getElementById("humidityMin").value);
    const humidityMax = Number(document.getElementById("humidityMax").value);
    if (tempMin >= tempMax) { showPopup("Ang minimum temperatura ay dapat mas mababa sa maximum."); return; }
    if (moistureMin >= moistureMax) { showPopup("Ang minimum moisture ay dapat mas mababa sa maximum."); return; }
    if (phMin >= phMax) { showPopup("Ang minimum pH ay dapat mas mababa sa maximum."); return; }
    if (humidityMin >= humidityMax) { showPopup("Ang minimum humidity ay dapat mas mababa sa maximum."); return; }
    const customCropsRef = getUserCropsQuery(user.uid);
    try {
        const existingSnapshot = await get(customCropsRef);
        const existingCrops = existingSnapshot.val() || {};
        const normalizedCropName = cropName.trim().toLowerCase();
        const hasDuplicate = Object.values(existingCrops).some((crop) => (crop?.name || "").trim().toLowerCase() === normalizedCropName);
        if (hasDuplicate) { showPopup("May kaparehong pangalan na ng pananim. Gumamit ng ibang pangalan."); return; }
    } catch (error) { console.error("Error checking existing crops:", error); }
    const cropRef = push(ref(db, "crop"));
    const cropData = {
        name: cropName, user_id: user.uid,
        temp: { min: tempMin, max: tempMax },
        moisture: { min: moistureMin, max: moistureMax },
        ph: { min: phMin, max: phMax },
        humidity: { min: humidityMin, max: humidityMax },
        createdAt: new Date().toISOString(),
    };
    set(cropRef, cropData)
        .then(() => {
            showPopup(`Tagumpay! Naka-save na ang ${cropName} sa iyong account.`);
            document.getElementById("addCropForm").reset();
            document.getElementById("addCropModal").style.display = "none";
        })
        .catch((error) => { showPopup("Error saving user crop: " + error.message); });
}

// ==================== CROP SELECTION MODAL ====================
function openCropSelectionModal() {
    const modal = document.getElementById("cropSelectionModal");
    modal.classList.add("active");
    modal.style.display = "flex";
    loadCropsInModal();
}
function closeCropSelectionModal() {
    const modal = document.getElementById("cropSelectionModal");
    modal.classList.remove("active");
    modal.style.display = "none";
}
document.addEventListener("DOMContentLoaded", function () {
    const modal = document.getElementById("cropSelectionModal");
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeCropSelectionModal(); });
});
async function loadCropsInModal() {
    const user = await getResolvedUser();
    if (!user) return;
    const grid = document.querySelector("#cropSelectionModal .crops-selection-grid");
    if (!grid) return;
    grid.querySelectorAll(".crop-selection-card").forEach((card) => card.remove());
    grid.querySelectorAll(".crop-selection-empty").forEach((node) => node.remove());
    try {
        const snapshot = await get(getUserCropsQuery(user.uid));
        const customCrops = snapshot.val() || {};
        const cropKeys = Object.keys(customCrops);
        if (cropKeys.length === 0) {
            const emptyMessage = document.createElement("div");
            emptyMessage.className = "crop-selection-empty";
            emptyMessage.style.padding = "12px";
            emptyMessage.style.textAlign = "center";
            emptyMessage.textContent = "Wala ka pang custom crop. Magdagdag muna ng pananim.";
            grid.appendChild(emptyMessage);
            return;
        }
        cropKeys.forEach((cropKey) => {
            const crop = customCrops[cropKey];
            const card = document.createElement("div");
            card.className = "crop-selection-card";
            card.setAttribute("data-crop-key", cropKey);
            card.setAttribute("data-custom", "true");
            card.innerHTML = `
                <div class="crop-selection-icon">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
                        <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.71-2.33c1.06.15 2.15.23 3.24.23 7.78 0 14-5.37 14-12 0-1.1-.9-2-2-2h-4.18C17.5 5.94 17 6.94 17 8z"/>
                    </svg>
                </div>
                <div class="crop-selection-name">${crop.name}</div>`;
            card.addEventListener("click", function () { selectCrop(this, cropKey, crop); });
            grid.appendChild(card);
        });
    } catch (error) {
        showPopup("Hindi ma-load ang custom crops. I-check ang Firebase read rules para sa /crop.");
    }
}
function selectCrop(cardElement, cropKey, cropData) {
    document.querySelectorAll("#cropSelectionModal .crop-selection-card").forEach((card) => card.classList.remove("selected"));
    cardElement.classList.add("selected");
    if (cropData) {
        window.selectedCropData = { name: cropData.name, temperature: cropData.temp, moisture: cropData.moisture, ph: cropData.ph, humidity: cropData.humidity, isCustom: true, cropKey };
    } else {
        const predefinedCrop = cardElement.getAttribute("data-crop");
        if (PREDEFINED_CROP_DATA?.[predefinedCrop]) {
            window.selectedCropData = { ...PREDEFINED_CROP_DATA[predefinedCrop], isCustom: false, cropKey: predefinedCrop };
        }
    }
}
document.addEventListener("DOMContentLoaded", function () {
    setTimeout(() => {
        document.querySelectorAll("#cropSelectionModal .crop-selection-card[data-crop]").forEach((card) => {
            card.addEventListener("click", function () { selectCrop(this, null, null); });
        });
    }, 300);
});
document.addEventListener("DOMContentLoaded", function () {
    const confirmBtn = document.getElementById("confirmCropSelectionBtn");
    if (confirmBtn) {
        confirmBtn.addEventListener("click", function () {
            if (!window.selectedCropData) { showPopup("Pumili muna ng pananim!"); return; }
            const user = auth.currentUser;
            if (user) {
                set(ref(db, `users/${user.uid}/activeCrop`), {
                    name: window.selectedCropData.name,
                    temperature: window.selectedCropData.temperature,
                    moisture: window.selectedCropData.moisture,
                    ph: window.selectedCropData.ph,
                    humidity: window.selectedCropData.humidity,
                    isCustom: window.selectedCropData.isCustom,
                    updatedAt: new Date().toISOString(),
                }).then(() => {
                    showPopup(`Napili: ${window.selectedCropData.name}`);
                    closeCropSelectionModal();
                    if (typeof updateCropMonitoring === "function") updateCropMonitoring(window.selectedCropData);
                });
            }
        });
    }
});
window.openCropSelectionModal = openCropSelectionModal;
window.closeCropSelectionModal = closeCropSelectionModal;

//------------------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", function () { initDashboard(); });

//----------------------------------------KASALUKUYANG STATUS-------------------------------
function initEmailJS() {
    if (typeof emailjs !== "undefined") {
        emailjs.init(EMAILJS_PUBLIC_KEY);
        console.log("✅ EmailJS initialized");
    } else {
        console.warn("⚠ EmailJS not loaded — include the EmailJS SDK in your HTML");
    }
}

function checkAndSendSensorAlerts(sensorData) {
    if (!currentUserEmail) return;
    const currentCrop = allCropData[currentCropKey];
    const cropName = currentCrop && currentCropKey !== "none" ? currentCrop.name : "Walang napiling pananim";
    const now = Date.now();
    const sensors = [
        { key: "temperature", label: "Temperatura", value: Number(sensorData.temperature || 0), unit: "°C", min: currentCrop?.temperature?.min ?? DEFAULT_SENSOR_THRESHOLDS.temperature.min, max: currentCrop?.temperature?.max ?? DEFAULT_SENSOR_THRESHOLDS.temperature.max },
        { key: "moisture", label: "Soil Moisture", value: Number(sensorData.soilMoisture || sensorData.moisture || 0), unit: "%", min: currentCrop?.moisture?.min ?? DEFAULT_SENSOR_THRESHOLDS.moisture.min, max: currentCrop?.moisture?.max ?? DEFAULT_SENSOR_THRESHOLDS.moisture.max },
        { key: "humidity", label: "Humidity", value: Number(sensorData.humidity || 0), unit: "%", min: currentCrop?.humidity?.min ?? DEFAULT_SENSOR_THRESHOLDS.humidity.min, max: currentCrop?.humidity?.max ?? DEFAULT_SENSOR_THRESHOLDS.humidity.max },
        { key: "ph", label: "pH Level", value: Number(sensorData.pH || sensorData.ph || 0), unit: "", min: currentCrop?.ph?.min ?? DEFAULT_SENSOR_THRESHOLDS.ph.min, max: currentCrop?.ph?.max ?? DEFAULT_SENSOR_THRESHOLDS.ph.max },
    ];
    sensors.forEach((sensor) => {
        if (lastEmailSentTime[sensor.key] && now - lastEmailSentTime[sensor.key] < EMAIL_COOLDOWN) return;
        let status = null;
        if (sensor.value < sensor.min) status = "MABABA (Too Low) 🔴";
        else if (sensor.value > sensor.max) status = "MATAAS (Too High) 🔵";
        if (!status) return;
        const templateParams = { to_email: currentUserEmail, sensor: sensor.label, status, value: `${sensor.value}${sensor.unit}`, min: `${sensor.min}${sensor.unit}`, max: `${sensor.max}${sensor.unit}`, crop: cropName, time: new Date().toLocaleString("en-PH") };
        emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
            .then(() => { console.log(`✅ Alert email sent for ${sensor.label}:`, sensor.value); lastEmailSentTime[sensor.key] = now; showNotification(`📧 Alert sent: ${sensor.label} is ${status}`, "on"); })
            .catch((error) => { console.error(`❌ Email failed for ${sensor.label}:`, error); });
    });
}

function updateCurrentReadings(sensorData) {
    if (!sensorData) return;
    const currentTime = Date.now();
    const rawTs = sensorData.timestamp;
    const dataTime = typeof rawTs === "number" ? rawTs : new Date(rawTs).getTime();
    if (isNaN(dataTime) || currentTime - dataTime > 300000) { showOfflineState(); return; }
    const temp = sensorData.temperature > 0 ? sensorData.temperature : "--";
    const moisture = sensorData.moisture > 0 || sensorData.soilMoisture > 0 ? sensorData.moisture || sensorData.soilMoisture : "--";
    const humidity = sensorData.humidity > 0 ? sensorData.humidity : "--";
    const ph = sensorData.ph > 0 || sensorData.pH > 0 ? sensorData.ph || sensorData.pH : "--";
    const light = sensorData.light || sensorData.lightStatus || sensorData.light_status || 0;
    document.getElementById("current-temperature").textContent = temp === "--" ? "-- °C" : `${temp} °C`;
    document.getElementById("current-soil-moisture").textContent = moisture === "--" ? "-- %" : `${moisture}%`;
    document.getElementById("current-humidity").textContent = humidity === "--" ? "-- %" : `${humidity}%`;
    document.getElementById("current-ph-level").textContent = ph === "--" ? "-- pH" : `${ph} pH`;
    const currentCrop = allCropData[currentCropKey];
    if (currentCrop) {
        updateStatusElement("status-temp-text", temp, currentCrop.temperature.min, currentCrop.temperature.max, "Celsius");
        updateStatusElement("status-humidity-text", humidity, currentCrop.humidity.min, currentCrop.humidity.max, "%");
        updateStatusElement("status-ph-text", ph, currentCrop.ph.min, currentCrop.ph.max, "pH");
        updateStatusElement("status-moisture-text", moisture, currentCrop.moisture.min, currentCrop.moisture.max, "%");
    } else {
        document.querySelectorAll(".status-message").forEach((el) => { el.textContent = "Pumili ng Pananim"; el.className = "status-message status-warning"; });
    }
    const isLight = light === "LIGHT" || light === "Light" || light == 1;
    const lightText = isLight ? "Maliwanag" : "Madilim";
    const lightClass = isLight ? "status-good" : "status-warning";
    const lightEl = document.getElementById("light-status");
    const lightStatEl = document.getElementById("status-light-text");
    if (lightEl) lightEl.textContent = isLight ? "Light" : "Dark";
    if (lightStatEl) { lightStatEl.textContent = lightText; lightStatEl.className = `status-message ${lightClass}`; }
    updateSoilMoistureStatus(moisture);
    checkAndSendSensorAlerts(sensorData);
    }

function updateStatusElement(elementId, value, min, max, unit) {
    const element = document.getElementById(elementId);
    if (!element || value === "--") return;
    let text = "", className = "status-message";
    const now = Date.now();
    if (value < min) {
        text = "Mababa"; className += " status-warning";
        if (!lastPopupTime[elementId] || now - lastPopupTime[elementId] > POPUP_COOLDOWN) {
            showPopup(`<br>Ang kasalukuyang halaga (<b>${value}${unit}</b>) ay mas mababa kaysa sa itinakdang minimum (<b>${min}${unit}</b>).`);
            lastPopupTime[elementId] = now;
        }
    } else if (value > max) {
        text = "Mataas"; className += " status-danger";
        if (!lastPopupTime[elementId] || now - lastPopupTime[elementId] > POPUP_COOLDOWN) {
            showPopup(`<br>Ang kasalukuyang halaga (<b>${value}${unit}</b>) ay mas mataas kaysa sa itinakdang maximum (<b>${max}${unit}</b>).`);
            lastPopupTime[elementId] = now;
        }
    } else {
        text = "Mainam"; className += " status-good";
    }
    element.textContent = text;
    element.className = className;
}

//-------------------------------------Initialize Dashboard-----------------------------
function loadAllCropData() {
    const customCropsJson = localStorage.getItem("customCrops");
    const customCrops = customCropsJson ? JSON.parse(customCropsJson) : {};
    allCropData = { ...PREDEFINED_CROP_DATA, ...customCrops };
    const lastSelectedCropKey = localStorage.getItem("selectedCropKey");
    if (lastSelectedCropKey && allCropData[lastSelectedCropKey]) {
        setCrop(lastSelectedCropKey, allCropData[lastSelectedCropKey]);
    } else {
        setCrop("none", { name: "Walang napiling pananim", temperature: { min: 0, max: 0 }, moisture: { min: 0, max: 0 }, ph: { min: 0, max: 0 }, humidity: { min: 0, max: 0 } });
    }
}

function setCrop(cropKey, cropInfo) {
    currentCropKey = cropKey;
    localStorage.setItem("selectedCropKey", cropKey);
    const cropNameEl = document.getElementById("currentCropName");
    const cropOptimalEl = document.getElementById("currentCropOptimal");
    if (cropNameEl) cropNameEl.innerHTML = `<i class="fas fa-seedling"></i> ${cropInfo.name}`;
    if (cropOptimalEl) cropOptimalEl.textContent = cropInfo.name === "Walang napiling pananim" ? "Pumili ng crop para bantayan" : `Optimal: Temp ${cropInfo.temperature.min}-${cropInfo.temperature.max}°C, Moisture ${cropInfo.moisture.min}-${cropInfo.moisture.max}%, pH ${cropInfo.ph.min}-${cropInfo.ph.max}`;
    const tempOptimal = document.getElementById("tempOptimal");
    const moistureOptimal = document.getElementById("moistureOptimal");
    const phOptimal = document.getElementById("phOptimal");
    const humidityOptimal = document.getElementById("humidityOptimal");
    if (tempOptimal) tempOptimal.textContent = `Optimal: ${cropInfo.temperature.min}-${cropInfo.temperature.max}°C`;
    if (moistureOptimal) moistureOptimal.textContent = `Optimal: ${cropInfo.moisture.min}-${cropInfo.moisture.max}%`;
    if (phOptimal) phOptimal.textContent = `Optimal: ${cropInfo.ph.min}-${cropInfo.ph.max}`;
    if (humidityOptimal) humidityOptimal.textContent = `Optimal: ${cropInfo.humidity.min}-${cropInfo.humidity.max}%`;
}

function initializeEventListeners() { initializeModals(); initializeDeviceManager(); }

// ==================== DEVICE MANAGER ====================
// Replace these functions in home.js

function initializeDeviceManager() {
    const addDeviceBtn = document.getElementById("addDeviceBtn");
    if (addDeviceBtn) addDeviceBtn.addEventListener("click", openDeviceModal);
    const closeBtn = document.getElementById("closeDeviceModal");
    if (closeBtn) closeBtn.addEventListener("click", closeDeviceModal);
    const confirmBtn = document.getElementById("confirmDeviceBtn");
    if (confirmBtn) confirmBtn.addEventListener("click", connectDevice);
    const removeBtn = document.getElementById("removeDeviceBtn");
    if (removeBtn) removeBtn.addEventListener("click", removeDevice);
    const modal = document.getElementById("deviceModal");
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeDeviceModal(); });
    loadCurrentDeviceStatus();
}

function openDeviceModal() {
    const modal = document.getElementById("deviceModal");
    if (modal) modal.style.display = "flex";
    loadCurrentDeviceStatus();
}

function closeDeviceModal() {
    const modal = document.getElementById("deviceModal");
    if (modal) modal.style.display = "none";
    const idInput = document.getElementById("deviceIdInput");
    const nameInput = document.getElementById("deviceNameInput");
    if (idInput) idInput.value = "";
    if (nameInput) nameInput.value = "";
    clearDeviceError();
}

function showDeviceError(msg) {
    const err = document.getElementById("deviceErrorMsg");
    if (err) { err.textContent = msg; err.style.display = "block"; }
}

function clearDeviceError() {
    const err = document.getElementById("deviceErrorMsg");
    if (err) { err.textContent = ""; err.style.display = "none"; }
}

// ==================== LOAD CURRENT DEVICE STATUS ====================
async function loadCurrentDeviceStatus() {
    const user = await getResolvedUser();
    if (!user) return;
    const statusSection = document.getElementById("currentDeviceStatus");
    const removeBtn = document.getElementById("removeDeviceBtn");
    const connectSection = document.getElementById("connectDeviceSection");
    try {
        const snapshot = await get(ref(db, `users/${user.uid}`));
        if (!snapshot.exists()) return;
        const userData = snapshot.val();
        const deviceId = userData.deviceId;
        if (deviceId) {
            if (statusSection) {
                statusSection.style.display = "block";
                const idEl = document.getElementById("connectedDeviceId");
                const nameEl = document.getElementById("connectedDeviceName");
                const dateEl = document.getElementById("connectedDeviceDate");
                if (idEl) idEl.textContent = deviceId;
                if (nameEl) nameEl.textContent = userData.deviceName || "—";
                if (dateEl) dateEl.textContent = userData.deviceAssignedAt
                    ? new Date(userData.deviceAssignedAt).toLocaleDateString("en-PH")
                    : "—";
            }
            if (removeBtn) removeBtn.style.display = "flex";
            if (connectSection) connectSection.style.display = "none";
            updateDeviceBadge(deviceId, userData.deviceName);
        } else {
            if (statusSection) statusSection.style.display = "none";
            if (removeBtn) removeBtn.style.display = "none";
            if (connectSection) connectSection.style.display = "block";
            updateDeviceBadge(null, null);
        }
    } catch (e) {
        console.error("Error loading device status:", e);
    }
}

// ==================== DEVICE BADGE ====================
function updateDeviceBadge(deviceId, deviceName) {
    const btn = document.getElementById("addDeviceBtn");
    const badge = document.getElementById("deviceBadge");
    if (!btn || !badge) return;
    if (deviceId) {
        badge.textContent = deviceName ? deviceName : deviceId;
        btn.style.background = "#d8f3dc";
        btn.style.color = "#2d6a4f";
        btn.style.borderColor = "#52b788";
        btn.title = `Connected: ${deviceId}`;
    } else {
        badge.textContent = "Walang device";
        btn.style.background = "#fdecea";
        btn.style.color = "#c0392b";
        btn.style.borderColor = "#fca5a5";
        btn.title = "Walang naka-connect na device";
    }
}

// ==================== CONNECT DEVICE ====================
// Fields: Device ID (required) + Device Name (optional). No location.
async function connectDevice() {
    clearDeviceError();
    const user = await getResolvedUser();
    if (!user) { showDeviceError("Hindi ka naka-login."); return; }
    const idInput = document.getElementById("deviceIdInput");
    const nameInput = document.getElementById("deviceNameInput");
    const deviceId = idInput?.value.trim();
    const deviceName = nameInput?.value.trim() || "";   // optional
    if (!deviceId) { showDeviceError("Mangyaring ilagay ang Device ID."); return; }
    const confirmBtn = document.getElementById("confirmDeviceBtn");
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = "Nagko-connect..."; }
    try {
        const deviceSnap = await get(ref(db, `devices/${deviceId}`));
        if (deviceSnap.exists()) {
            const alreadyAssignedTo = deviceSnap.val().assignedTo;
            if (alreadyAssignedTo && alreadyAssignedTo !== user.uid) {
                showDeviceError("❌ Ang device na ito ay naka-connect na sa ibang account.");
                return;
            }
        }
        const userSnap = await get(ref(db, `users/${user.uid}`));
        const oldDeviceId = userSnap.val()?.deviceId;
        if (oldDeviceId && oldDeviceId !== deviceId) {
            const confirmSwitch = await showConfirmPopup(
                "🔄", "Palitan ang Device?",
                `Ikaw ay naka-connect na sa <b>${oldDeviceId}</b>.<br><br>Idi-disconnect ito at ico-connect ang <b>${deviceId}</b>. Magpapatuloy ba?`,
                "Kanselahin", "Oo, Palitan"
            );
            if (!confirmSwitch) {
                if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fas fa-plug"></i> I-connect ang Device'; }
                return;
            }
            await remove(ref(db, `devices/${oldDeviceId}`));
        }
        // Save to users — deviceId + optional deviceName, no location
        const updatePayload = {
            deviceId,
            deviceAssignedAt: new Date().toISOString(),
        };
        if (deviceName) updatePayload.deviceName = deviceName;
        else updatePayload.deviceName = null;

        await update(ref(db, `users/${user.uid}`), updatePayload);

        // Save to devices collection
        await set(ref(db, `devices/${deviceId}`), {
            assignedTo: user.uid,
            deviceName: deviceName || null,
            assignedAt: new Date().toISOString(),
        });
        currentDeviceId = deviceId;
        const displayName = deviceName || deviceId;
        showNotification(`✅ Device "${displayName}" na-connect!`, "on");
        closeDeviceModal();
        await loadCurrentDeviceStatus();
        listenToPumpControl(deviceId);
        showPopup(`✅ Matagumpay na na-connect ang <b>${displayName}</b>!<br>Magsisimula na ang data monitoring.`);
    } catch (e) {
        showDeviceError("Error sa pag-connect: " + e.message);
    } finally {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="fas fa-plug"></i> I-connect ang Device'; }
    }
}

// ==================== DISCONNECT DEVICE ====================
async function removeDevice() { showDisconnectPopup(); }

function showDisconnectPopup() {
    if (document.getElementById('disconnect-popup-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'disconnect-popup-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = `
        <div style="background:white;border-radius:14px;padding:32px 28px;max-width:360px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.18);font-family:inherit;">
            <h3 style="margin-bottom:8px;color:#1a1a1a;font-size:18px;">I-disconnect ang Device?</h3>
            <p style="color:#666;font-size:14px;margin-bottom:24px;">Sigurado ka bang gusto mong i-disconnect ang iyong device? Hindi na makikita ang sensor data hanggang mag-connect ulit.</p>
            <div style="display:flex;gap:10px;">
                <button id="disconnect-cancel-btn" style="flex:1;padding:11px;border:1.5px solid #ddd;border-radius:8px;background:white;color:#555;font-size:14px;font-weight:600;cursor:pointer;">Kanselahin</button>
                <button id="disconnect-confirm-btn" style="flex:1;padding:11px;border:none;border-radius:8px;background:#c0392b;color:white;font-size:14px;font-weight:600;cursor:pointer;">Oo, I-disconnect</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    document.getElementById('disconnect-cancel-btn').addEventListener('click', () => overlay.remove());
    document.getElementById('disconnect-confirm-btn').addEventListener('click', async () => {
        overlay.querySelector('div').innerHTML = `<div style="font-size:40px;margin-bottom:12px;">⏳</div><h3 style="margin-bottom:8px;color:#1a1a1a;font-size:18px;">Nagdi-disconnect...</h3><p style="color:#666;font-size:14px;">Sandali lang.</p>`;
        try {
            const user = await getResolvedUser();
            if (!user) { overlay.remove(); return; }
            const snapshot = await get(ref(db, `users/${user.uid}`));
            const deviceId = snapshot.val()?.deviceId;
            await update(ref(db, `users/${user.uid}`), { deviceId: null, deviceName: null, deviceAssignedAt: null });
            if (deviceId) await remove(ref(db, `devices/${deviceId}`));
            currentDeviceId = null;
            updateDeviceBadge(null, null);
            await loadCurrentDeviceStatus();
            overlay.querySelector('div').innerHTML = `<div style="font-size:40px;margin-bottom:12px;">✅</div><h3 style="margin-bottom:8px;color:#2d6a4f;font-size:18px;">Na-disconnect na!</h3><p style="color:#666;font-size:14px;">Ang iyong device ay matagumpay na na-disconnect.</p>`;
            setTimeout(() => overlay.remove(), 1500);
            showNotification("Device disconnected.", "off");
        } catch (e) {
            overlay.remove();
            showPopup("Error sa pag-disconnect ng device: " + e.message);
        }
    });
}
function updateCurrentDate() {
    const now = new Date();
    const dateElement = document.getElementById("current-date");
    if (dateElement) dateElement.textContent = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function updateLightStatus(status) {
    const lightValueElement = document.getElementById("light-status");
    if (!lightValueElement) return;
    if (status === "--" || status === null || status === undefined) lightValueElement.textContent = "--";
    else if (status === 1 || status === "Light" || status === "LIGHT" || status === "Maliwanag") lightValueElement.textContent = "Light";
    else lightValueElement.textContent = "Dark";
}

function updateSoilMoistureStatus(moistureLevel) {
    const statusElement = document.getElementById("soil-moisture-status");
    if (!statusElement) return;
    let status, message, className;
    const currentCrop = allCropData[currentCropKey];
    if (currentCrop && currentCrop.moisture && currentCrop.moisture.min > 0) {
        const min = currentCrop.moisture.min;
        const max = currentCrop.moisture.max;
        if (moistureLevel < min) { status = "Mababa"; message = "Kailangan ng Patubig"; className = "status-moderate"; }
        else if (moistureLevel > max) { status = "Mataas"; message = "Bawasan ang Tubig"; className = "status-saturated"; }
        else { status = "Mainam"; message = "Perpektong kondition ng pag kabasa ng lupa"; className = "status-optimal"; }
    } else {
        if (moistureLevel < 20) { status = "Sobrang tuyo"; message = " Kailangan agad ng Patubig"; className = "status-dry"; }
        else if (moistureLevel < 40) { status = "Tuyot"; message = " Kailangan ng Patubig"; className = "status-moderate"; }
        else if (moistureLevel < 60) { status = "Mainam"; message = " Perpektong kondition ng pag kabasa ng lupa"; className = "status-optimal"; }
        else if (moistureLevel < 80) { status = "Basa"; message = " Sapat na kahalumigmigan"; className = "status-wet"; }
        else { status = "Sobra sa tubig"; message = " Bawasan ang Tubig"; className = "status-saturated"; }
    }
    statusElement.className = `moisture-status ${className}`;
    statusElement.innerHTML = `<p>Pagkabasa ng lupa: <b>${status}</b></p><small>${message}</small>`;
}

function getNoneCropData() {
    return { name: "Walang napiling pananim", temperature: { min: 0, max: 0 }, moisture: { min: 0, max: 0 }, ph: { min: 0, max: 0 }, humidity: { min: 0, max: 0 } };
}

async function loadActiveCropSelection() {
    const user = await getResolvedUser();
    if (!user) return;
    try {
        const snapshot = await get(ref(db, `users/${user.uid}/activeCrop`));
        if (!snapshot.exists()) return;
        const activeCrop = snapshot.val();
        const cropKey = activeCrop.cropKey || `active_${user.uid}`;
        const normalizedCrop = {
            name: activeCrop.name || "Walang napiling pananim",
            temperature: activeCrop.temperature || activeCrop.temp || { min: 0, max: 0 },
            moisture: activeCrop.moisture || { min: 0, max: 0 },
            ph: activeCrop.ph || { min: 0, max: 0 },
            humidity: activeCrop.humidity || { min: 0, max: 0 },
            isCustom: activeCrop.isCustom === true,
        };
        allCropData[cropKey] = normalizedCrop;
        setCrop(cropKey, normalizedCrop);
    } catch (error) { console.error("Error loading active crop:", error); }
}

//-------------------------------Pump Control (per device)-------------------------------
function initializePumpControls() {
    const pumpSwitch = document.getElementById("pump-switch");
    if (!pumpSwitch) return;
    pumpSwitch.addEventListener("change", function () {
        const pumpValue = this.checked ? 1 : 0;
        writePumpControl(pumpValue);
        showPumpNotification(pumpValue === 1 ? "Patubig: ON" : "Patubig: OFF", pumpValue === 1 ? "on" : "off");
    });
}

async function writePumpControl(value) {
    if (!currentDeviceId) { currentDeviceId = await getDeviceIdForUser(); }
    if (!currentDeviceId) { console.warn("⚠ No deviceId found — cannot write pumpControl"); return; }
    set(ref(db, `pumpControl/${currentDeviceId}/status`), value)
        .then(() => console.log(`✅ pumpControl/${currentDeviceId}/status =`, value))
        .catch((error) => console.error("❌ Error writing pumpControl:", error));
}

function listenToPumpControl(deviceId) {
    if (!deviceId) return;
    const pumpSwitch = document.getElementById("pump-switch");
    if (!pumpSwitch) return;
    onValue(ref(db, `pumpControl/${deviceId}/status`), (snapshot) => {
        if (!snapshot.exists()) return;
        const val = snapshot.val();
        const isOn = val === 1 || val === "1" || val === true;
        if (pumpSwitch.checked !== isOn) { pumpSwitch.checked = isOn; console.log(`🔄 pumpControl/${deviceId}/status updated:`, isOn ? "ON" : "OFF"); }
    });
}

function showPumpNotification(message, type) {
    const notification = document.createElement("div");
    notification.innerHTML = `<i class="fas fa-${type === "on" ? "check-circle" : "times-circle"}"></i>${message}`;
    notification.style.cssText = `position:fixed;top:80px;right:20px;padding:12px 20px;background:${type === "on" ? "#27ae60" : "#e74c3c"};color:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:1001;font-weight:600;display:flex;align-items:center;gap:8px;`;
    document.body.appendChild(notification);
    setTimeout(() => { notification.style.animation = "slideOut 0.3s ease"; setTimeout(() => notification.remove(), 300); }, 3000);
}

function initDashboard() {
    updateCurrentDate();
    loadAllCropData();
    loadActiveCropSelection();
    initializeNotificationBell();
    initializeEventListeners();
    updateSoilMoistureStatus(42);
    updateLightStatus("--");
    initializePumpControls();
    initEmailJS();
    listenToFirebaseData();
    setTimeout(() => { initializeDataHistory(); }, 500);
}

function initializeDataHistory() {
    initializeTimeFilters();
    initializeGraphMode();
    initializeExportButton();
    initializeAutoRefresh();
    loadHistoryData("1h");
    loadHistoryData(currentTimeRange);
}

function initializeNotificationBell() {
    const bell = document.getElementById("notificationBell");
    const dropdown = document.getElementById("notificationDropdown");
    if (!bell || !dropdown) return;
    if (bell.dataset.initialized === "true") return;
    bell.dataset.initialized = "true";
    bell.addEventListener("click", (event) => {
        event.stopPropagation();
        dropdown.classList.toggle("hidden");
        if (!dropdown.classList.contains("hidden")) { unreadNotificationCount = 0; updateNotificationBadge(); }
    });
    document.addEventListener("click", (event) => {
        if (!bell.contains(event.target) && !dropdown.contains(event.target)) dropdown.classList.add("hidden");
    });
    renderNotifications();
    updateNotificationBadge();
    startNotificationListener();
}

async function startNotificationListener() {
    if (notificationListenerStarted) return;
    const user = await getResolvedUser();
    if (!user?.uid) return;
    currentNotificationUserId = user.uid;
    const notificationsQuery = query(ref(db, `users/${user.uid}/notifications`), limitToLast(50));
    onValue(notificationsQuery, (snapshot) => {
        const loaded = [];
        snapshot.forEach((childSnapshot) => {
            const value = childSnapshot.val() || {};
            loaded.push({ id: childSnapshot.key, title: value.title || "Sensor Alert", message: value.message || "May bagong sensor alert.", timestamp: getRecordTimestamp(value, childSnapshot.key) || Date.now() });
        });
        loaded.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        sensorNotifications = loaded.slice(0, 30);
        renderNotifications();
    }, (error) => { console.error("Failed to load persisted notifications:", error); });
    notificationListenerStarted = true;
}

async function persistNotification(item) {
    if (!currentNotificationUserId || !item) return;
    try {
        await push(ref(db, `users/${currentNotificationUserId}/notifications`), { title: item.title, message: item.message, timestamp: item.timestamp || Date.now() });
    } catch (error) { console.error("Failed to persist notification:", error); }
}

function updateNotificationBadge() {
    const badge = document.getElementById("notificationBadge");
    if (!badge) return;
    if (unreadNotificationCount > 0) { badge.textContent = unreadNotificationCount > 99 ? "99+" : String(unreadNotificationCount); badge.classList.remove("hidden"); }
    else badge.classList.add("hidden");
}

function renderNotifications() {
    const list = document.getElementById("notificationList");
    if (!list) return;
    list.innerHTML = "";
    if (sensorNotifications.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "notif-empty";
        emptyItem.textContent = "Wala pang notifications.";
        list.appendChild(emptyItem);
        return;
    }
    sensorNotifications.forEach((item) => {
        const li = document.createElement("li");
        li.className = "notif-item";
        const title = document.createElement("div"); title.className = "notif-title"; title.textContent = item.title;
        const message = document.createElement("div"); message.className = "notif-meta"; message.textContent = item.message;
        const time = document.createElement("div"); time.className = "notif-meta"; time.textContent = formatTimestamp(item.timestamp);
        li.appendChild(title); li.appendChild(message); li.appendChild(time);
        list.appendChild(li);
    });
}

function getAlertStatus(value, min, max) {
    if (!Number.isFinite(value)) return "normal";
    if (value < min) return "low";
    if (value > max) return "high";
    return "normal";
}

function getThresholdsForCurrentCrop() {
    const activeCrop = allCropData[currentCropKey];
    return {
        temperature: activeCrop?.temperature || DEFAULT_SENSOR_THRESHOLDS.temperature,
        moisture: activeCrop?.moisture || DEFAULT_SENSOR_THRESHOLDS.moisture,
        humidity: activeCrop?.humidity || DEFAULT_SENSOR_THRESHOLDS.humidity,
        ph: activeCrop?.ph || DEFAULT_SENSOR_THRESHOLDS.ph,
    };
}

function pushSensorAlert(metric, status, value, min, max) {
    const metricLabelMap = { ph: "pH Level", temperature: "Temperature", moisture: "Soil Moisture", humidity: "Humidity" };
    const unitMap = { ph: "", temperature: "°C", moisture: "%", humidity: "%" };
    const directionText = status === "low" ? "mababa" : "mataas";
    const roundedValue = Number.isFinite(value) ? Number(value).toFixed(metric === "ph" ? 2 : 1) : "--";
    const metricLabel = metricLabelMap[metric] || metric;
    const unit = unitMap[metric] || "";
    const item = { title: `${metricLabel} Alert`, message: `${metricLabel} ay ${directionText}: ${roundedValue}${unit} (target ${min}-${max}${unit})`, timestamp: Date.now() };
    unreadNotificationCount += 1;
    updateNotificationBadge();
    if (!notificationListenerStarted) {
        sensorNotifications.unshift(item);
        if (sensorNotifications.length > 30) sensorNotifications = sensorNotifications.slice(0, 30);
        renderNotifications();
    }
    showNotification(item.message, "off");
    persistNotification(item);
}

function evaluateSensorAlerts(latestReading) {
    if (!latestReading) return;
    const thresholds = getThresholdsForCurrentCrop();
    const values = {
        ph: Number(latestReading.pH ?? latestReading.ph ?? latestReading.phLevel),
        temperature: Number(latestReading.temperature),
        moisture: Number(latestReading.soilMoisture ?? latestReading.moisture),
        humidity: Number(latestReading.humidity),
    };
    Object.entries(values).forEach(([metric, value]) => {
        const range = thresholds[metric] || DEFAULT_SENSOR_THRESHOLDS[metric];
        const status = getAlertStatus(value, range.min, range.max);
        const stateKey = `${currentCropKey || "none"}:${metric}`;
        const previousStatus = sensorAlertStates[stateKey] || "normal";
        if (status !== "normal" && status !== previousStatus) pushSensorAlert(metric, status, value, range.min, range.max);
        sensorAlertStates[stateKey] = status;
    });
}

async function addMockSensorData(overrides = {}) {
    const user = await getResolvedUser();
    if (!user?.uid) throw new Error("No logged in user.");
    const payload = { temperature: 26.5, soilMoisture: 62, humidity: 68, pH: 6.2, light: "LIGHT", timestamp: Date.now(), user_id: user.uid, ...overrides };
    const newDataRef = push(ref(db, dbPath));
    await set(newDataRef, payload);
    return { key: newDataRef.key, payload };
}
async function addMockNotificationTest(type = "ph-low") {
    const scenarios = { normal: { temperature: 26, soilMoisture: 65, humidity: 65, pH: 6.3, light: "LIGHT" }, "ph-low": { pH: 4.6, light: "DARK" }, "ph-high": { pH: 8.2 }, "temp-high": { temperature: 40.2 }, "moisture-low": { soilMoisture: 20 }, "humidity-high": { humidity: 93 } };
    return addMockSensorData(scenarios[type] || scenarios["ph-low"]);
}
async function addMockNotificationSequence() {
    await addMockNotificationTest("normal");
    setTimeout(() => addMockNotificationTest("ph-low").catch(console.error), 1200);
}
window.addMockSensorData = addMockSensorData;
window.addMockNotificationTest = addMockNotificationTest;
window.addMockNotificationSequence = addMockNotificationSequence;

//--------------------------------Firebase Data------------------------------------------
async function listenToFirebaseData() {
    const user = await getResolvedUser();
    if (!user?.uid) { showOfflineState(); return; }
    const deviceId = await getDeviceIdForUser();
    currentDeviceId = deviceId;
    console.log("✅ User deviceId for filtering:", deviceId);
    listenToPumpControl(deviceId);
    const dataRef = ref(database, "sensorData");
    const readingsQuery = query(dataRef, limitToLast(50));
    onValue(readingsQuery, (snapshot) => {
        if (snapshot.exists()) {
            let historyDataArray = [];
            snapshot.forEach((childSnapshot) => {
                const data = childSnapshot.val();
                data.id = childSnapshot.key;
                data.timestamp = getRecordTimestamp(data, childSnapshot.key);
                historyDataArray.push(data);
            });
            historyDataArray = historyDataArray.filter((row) => isRecordOwnedByUser(row, user.uid, deviceId));
            if (historyDataArray.length === 0) { updateHistoryTable([]); showOfflineState(); return; }
            latestHistoryData = historyDataArray;
            const tableData = [...historyDataArray].reverse();
            updateHistoryTable(tableData);
            if (isGraphMode) updateAllCharts();
            const latestReading = historyDataArray[historyDataArray.length - 1];
            const currentTime = Date.now();
            const dataTime = typeof latestReading.timestamp === "number" ? latestReading.timestamp : new Date(latestReading.timestamp).getTime();
            if (currentTime - dataTime > 5 * 60 * 1000) { showOfflineState(); }
            else { updateCurrentReadings(latestReading); updateCurrentStatusCards(latestReading); evaluateSensorAlerts(latestReading); }
        } else { showOfflineState(); }
    }, (error) => { console.error("Firebase History Data Listener Error:", error); });
}

function showOfflineState() {
    ["current-temperature", "current-soil-moisture", "current-humidity", "current-ph-level", "light-status"].forEach((id) => { const el = document.getElementById(id); if (el) el.textContent = "--"; });
    ["status-temp-text", "status-moisture-text", "status-humidity-text", "status-ph-text", "status-light-text"].forEach((id) => { const el = document.getElementById(id); if (el) { el.textContent = "Offline"; el.style.color = "#e74c3c"; } });
    const sideStatus = document.getElementById("soil-moisture-status");
    if (sideStatus) sideStatus.textContent = "Offline";
}

//-------------------------------History Table-------------------------------
function formatTimestamp(timestamp) {
    if (!timestamp) return "";
    return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(timestamp));
}

function updateHistoryTable(dataArray) {
    const tableBody = document.getElementById("history-data");
    if (!tableBody) return;
    tableBody.innerHTML = "";
    dataArray.forEach((data) => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${formatTimestamp(data.timestamp || data.id)}</td><td>${data.soilMoisture || "N/A"}%</td><td>${data.humidity || "N/A"}%</td><td>${data.temperature || "N/A"}°C</td><td>${data.light || "N/A"}</td><td>${data.pH || "N/A"} pH</td>`;
        tableBody.appendChild(row);
    });
}

function updateCurrentStatusCards(latestData) {
    if (!latestData) return;
    const temperature = latestData.temperature;
    const moisture = latestData.moisture ?? latestData.soilMoisture;
    const ph = latestData.ph ?? latestData.pH ?? latestData.phLevel;
    const humidity = latestData.humidity;
    const temperatureEl = document.getElementById("current-temperature");
    const moistureEl = document.getElementById("current-soil-moisture");
    const phEl = document.getElementById("current-ph-level");
    const humidityEl = document.getElementById("current-humidity");
    if (temperatureEl) temperatureEl.textContent = temperature == null ? "N/A °C" : `${temperature} °C`;
    if (moistureEl) moistureEl.textContent = moisture == null ? "N/A %" : `${moisture}%`;
    if (phEl) phEl.textContent = ph == null ? "N/A pH" : `${ph} pH`;
    if (humidityEl) humidityEl.textContent = humidity == null ? "N/A %" : `${humidity}%`;
    updateSoilMoistureStatus(latestData.moisture || latestData.soilMoisture || 0);
    updateLightStatus(latestData.light === 1 || latestData.light === "Light" || latestData.light === "LIGHT" ? 1 : 0);
}

// Modal handling
function initializeModals() {
    const selectCropModal = document.getElementById("selectCropModal");
    const addCropModal = document.getElementById("addCropModal");
    const editDeleteCropModal = document.getElementById("editDeleteCropModal");
    const selectCropBtn = document.getElementById("selectCropBtn");
    const addCropBtn = document.getElementById("addCropBtn");
    const deleteCropBtn = document.getElementById("deleteCropBtn");
    const closeButtons = document.querySelectorAll(".close-modal");
    if (selectCropBtn && selectCropModal) selectCropBtn.addEventListener("click", () => { renderCropOptions(); selectCropModal.style.display = "flex"; });
    if (addCropBtn && addCropModal) addCropBtn.addEventListener("click", () => { addCropModal.style.display = "flex"; });
    closeButtons.forEach((button) => button.addEventListener("click", (event) => { event.target.closest(".modal").style.display = "none"; }));
    window.addEventListener("click", (event) => {
        if (event.target === selectCropModal) selectCropModal.style.display = "none";
        if (event.target === addCropModal) addCropModal.style.display = "none";
        if (event.target === editDeleteCropModal) editDeleteCropModal.style.display = "none";
    });
    document.getElementById("confirmCropBtn").addEventListener("click", async () => {
        const selectedOption = document.querySelector("#selectCropModal .crop-option.selected");
        if (selectedOption) {
            const selectedCropKey = selectedOption.getAttribute("data-crop");
            const selectedCropData = allCropData[selectedCropKey];
            setCrop(selectedCropKey, selectedCropData);
            const user = await getResolvedUser();
            if (user && selectedCropData) {
                try {
                    await set(ref(db, `users/${user.uid}/activeCrop`), { cropKey: selectedCropKey, name: selectedCropData.name, temperature: selectedCropData.temperature, moisture: selectedCropData.moisture, ph: selectedCropData.ph, humidity: selectedCropData.humidity, isCustom: selectedCropData.isCustom === true, updatedAt: new Date().toISOString() });
                } catch (error) { console.error("Error saving active crop:", error); }
            }
            selectCropModal.style.display = "none";
            document.querySelectorAll("#selectCropModal .crop-option").forEach((o) => o.classList.remove("selected"));
        } else { alert("Please select a crop"); }
    });
    document.getElementById("addCropForm").addEventListener("submit", (e) => { e.preventDefault(); });
    document.getElementById("editCropForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const cropKey = document.getElementById("editCropKey").value;
        const updatedCrop = {
            name: document.getElementById("editCustomCropName").value,
            temperature: { min: parseFloat(document.getElementById("editTempMin").value), max: parseFloat(document.getElementById("editTempMax").value) },
            moisture: { min: parseFloat(document.getElementById("editMoistureMin").value), max: parseFloat(document.getElementById("editMoistureMax").value) },
            ph: { min: parseFloat(document.getElementById("editPhMin").value), max: parseFloat(document.getElementById("editPhMax").value) },
            humidity: { min: parseFloat(document.getElementById("editHumidityMin").value), max: parseFloat(document.getElementById("editHumidityMax").value) },
            isCustom: true,
        };
        const user = await getResolvedUser();
        if (!user) { showPopup("Mag-login muna bago mag-edit ng crop."); return; }
        try {
            await update(ref(db, `crop/${cropKey}`), { name: updatedCrop.name, user_id: user.uid, temp: updatedCrop.temperature, moisture: updatedCrop.moisture, ph: updatedCrop.ph, humidity: updatedCrop.humidity, updatedAt: new Date().toISOString() });
            allCropData[cropKey] = { ...updatedCrop, user_id: user.uid };
            if (currentCropKey === cropKey) setCrop(cropKey, allCropData[cropKey]);
            document.getElementById("editDeleteCropModal").style.display = "none";
            await renderCropOptions();
            showPopup("Tagumpay! Na-update ang crop.");
        } catch (error) { showPopup("Hindi ma-update ang crop: " + error.message); }
    });
    if (deleteCropBtn) {
        deleteCropBtn.addEventListener("click", async () => {
            const cropKey = document.getElementById("editCropKey").value;
            if (!cropKey) return;
            const confirmed = await showConfirmPopup("🌱", "Burahin ang Crop?", `Sigurado ka bang gusto mong burahin ang crop na ito? <br>Hindi na ito mababawi.`, "Kanselahin", "Oo, Burahin");
            if (!confirmed) return;
            const user = await getResolvedUser();
            if (!user) { showPopup("Mag-login muna bago magbura ng crop."); return; }
            try {
                await remove(ref(db, `crop/${cropKey}`));
                delete allCropData[cropKey];
                if (currentCropKey === cropKey) setCrop("none", { name: "Walang napiling pananim", temperature: { min: 0, max: 0 }, moisture: { min: 0, max: 0 }, ph: { min: 0, max: 0 }, humidity: { min: 0, max: 0 } });
                document.getElementById("editDeleteCropModal").style.display = "none";
                await renderCropOptions();
                showPopup("Nabura na ang crop.");
            } catch (error) { showPopup("Hindi mabura ang crop: " + error.message); }
        });
    }
}

async function renderCropOptions() {
    const cropGrid = document.querySelector("#selectCropModal .crop-grid");
    if (!cropGrid) return;
    cropGrid.innerHTML = "";
    const user = await getResolvedUser();
    if (!user) { cropGrid.innerHTML = `<div class="crop-selection-empty" style="padding:12px;text-align:center;">Mag-login muna para makita ang iyong crops.</div>`; allCropData = {}; return; }
    let customCrops = {};
    try {
        const snapshot = await get(getUserCropsQuery(user.uid));
        const rawCrops = snapshot.val() || {};
        Object.entries(rawCrops).forEach(([key, crop]) => {
            customCrops[key] = { name: crop.name, temperature: crop.temperature || crop.temp || { min: 0, max: 0 }, moisture: crop.moisture || { min: 0, max: 0 }, ph: crop.ph || { min: 0, max: 0 }, humidity: crop.humidity || { min: 0, max: 0 }, isCustom: true, user_id: crop.user_id || user.uid };
        });
    } catch (error) {
        cropGrid.innerHTML = `<div class="crop-selection-empty" style="padding:12px;text-align:center;">Hindi ma-load ang iyong crops.</div>`;
        allCropData = {}; return;
    }
    allCropData = { ...PREDEFINED_CROP_DATA, ...customCrops };
    const predefinedLabel = document.createElement("div");
    predefinedLabel.style.cssText = "width:100%;font-weight:600;color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding:4px 0 6px;margin-top:4px;grid-column:1/-1;";
    predefinedLabel.textContent = "Default na Pananim";
    cropGrid.appendChild(predefinedLabel);
    Object.entries(PREDEFINED_CROP_DATA).forEach(([key, crop]) => {
        const optionDiv = document.createElement("div");
        optionDiv.className = "crop-option predefined";
        optionDiv.setAttribute("data-crop", key);
        if (currentCropKey === key) optionDiv.classList.add("selected");
        optionDiv.innerHTML = `<i class="fas fa-seedling crop-icon-small"></i><div class="crop-name-small">${crop.name}</div>`;
        optionDiv.addEventListener("click", () => {
            document.querySelectorAll("#selectCropModal .crop-option").forEach((o) => o.classList.remove("selected"));
            optionDiv.classList.add("selected");
        });
        cropGrid.appendChild(optionDiv);
    });
    if (Object.keys(customCrops).length > 0) {
        const customLabel = document.createElement("div");
        customLabel.style.cssText = "width:100%;font-weight:600;color:#555;font-size:12px;text-transform:uppercase;letter-spacing:1px;padding:4px 0 6px;margin-top:12px;grid-column:1/-1;";
        customLabel.textContent = "Aking Pananim";
        cropGrid.appendChild(customLabel);
        Object.entries(customCrops).forEach(([key, crop]) => {
            const optionDiv = document.createElement("div");
            optionDiv.className = "crop-option custom";
            optionDiv.setAttribute("data-crop", key);
            if (currentCropKey === key) optionDiv.classList.add("selected");
            optionDiv.innerHTML = `<i class="fas fa-seedling crop-icon-small"></i><div class="crop-name-small">${crop.name}</div><div class="crop-actions"><button class="edit-btn" data-key="${key}"><i class="fas fa-edit"></i> Edit</button></div>`;
            optionDiv.addEventListener("click", (e) => { if (!e.target.closest(".crop-actions button")) { document.querySelectorAll("#selectCropModal .crop-option").forEach((o) => o.classList.remove("selected")); optionDiv.classList.add("selected"); } });
            const editBtn = optionDiv.querySelector(".edit-btn");
            if (editBtn) editBtn.addEventListener("click", (e) => { e.stopPropagation(); openEditDeleteModal(key); });
            cropGrid.appendChild(optionDiv);
        });
    }
}

function openEditDeleteModal(cropKey) {
    const crop = allCropData[cropKey];
    const editDeleteCropModal = document.getElementById("editDeleteCropModal");
    if (!crop || !crop.isCustom) return;
    document.getElementById("editCropKey").value = cropKey;
    document.getElementById("editDeleteCropTitle").textContent = `Edit Crop: ${crop.name}`;
    document.getElementById("editCustomCropName").value = crop.name;
    document.getElementById("editTempMin").value = crop.temperature.min;
    document.getElementById("editTempMax").value = crop.temperature.max;
    document.getElementById("editMoistureMin").value = crop.moisture.min;
    document.getElementById("editMoistureMax").value = crop.moisture.max;
    document.getElementById("editPhMin").value = crop.ph.min;
    document.getElementById("editPhMax").value = crop.ph.max;
    document.getElementById("editHumidityMin").value = crop.humidity.min;
    document.getElementById("editHumidityMax").value = crop.humidity.max;
    editDeleteCropModal.style.display = "flex";
}

//-------------------------------History Table Time Buttons-------------------------------
function initializeTimeFilters() {
    const timeFilters = document.querySelectorAll(".time-filter");
    timeFilters.forEach((filter) => {
        filter.addEventListener("click", () => {
            timeFilters.forEach((f) => f.classList.remove("active"));
            filter.classList.add("active");
            currentTimeRange = filter.getAttribute("data-time");
            showLoadingState();
            loadHistoryData(currentTimeRange);
        });
    });
}

function showLoadingState() {
    const historyTable = document.getElementById("history-table");
    const table = historyTable.querySelector("table");
    const loadingDiv = historyTable.querySelector(".history-loading");
    if (table) table.style.display = "none";
    if (loadingDiv) loadingDiv.style.display = "block";
    else historyTable.innerHTML = `<div class="history-loading"><i class="fas fa-spinner"></i><p>Naglo-load ng data...</p></div>`;
}

function hideLoadingState() {
    const historyTable = document.getElementById("history-table");
    const table = historyTable.querySelector("table");
    const loadingDiv = historyTable.querySelector(".history-loading");
    const emptyState = historyTable.querySelector(".history-empty");
    if (loadingDiv) loadingDiv.style.display = "none";
    if (emptyState) emptyState.remove();
    if (table) table.style.display = "table";
    // Hide graph empty state and restore chart containers
    const graphEmptyState = document.getElementById("graph-empty-state");
    if (graphEmptyState) graphEmptyState.classList.add("hidden");
    const graphContainers = document.querySelectorAll("#history-graph .graph-container");
    graphContainers.forEach((c) => { c.style.display = ""; });
}

function showEmptyState(range) {
    const historyTable = document.getElementById("history-table");
    const loadingDiv = historyTable.querySelector(".history-loading");
    const table = historyTable.querySelector("table");
    if (loadingDiv) loadingDiv.style.display = "none";
    if (table) table.style.display = "none";
    const messages = { "1h": "sa nakaraang 1 oras", "6h": "sa nakaraang 6 oras", "24h": "sa nakaraang 24 oras", "7d": "sa nakaraang 7 araw", "all": "sa lahat ng panahon" };
    let emptyState = historyTable.querySelector(".history-empty");
    if (!emptyState) { emptyState = document.createElement("div"); emptyState.className = "history-empty"; historyTable.appendChild(emptyState); }
    emptyState.innerHTML = `<i class="fas fa-database"></i><h3>Walang Nakuhang Data</h3><p>Walang natagpuang sensor readings ${messages[range] || "sa napiling oras"}.</p>`;
    // Also update and show the graph empty state
    const graphEmptyState = document.getElementById("graph-empty-state");
    if (graphEmptyState) {
        graphEmptyState.querySelector("p").textContent = `Walang natagpuang sensor readings ${messages[range] || "sa napiling oras"}.`;
        graphEmptyState.classList.remove("hidden");
    }
    // Hide the chart containers when there is no data
    const graphContainers = document.querySelectorAll("#history-graph .graph-container");
    graphContainers.forEach((c) => { c.style.display = "none"; });
}

async function loadHistoryData(range) {
    const user = await getResolvedUser();
    if (!user?.uid) { showEmptyState(range); return; }
    const deviceId = await getDeviceIdForUser();
    const now = Date.now();
    let startTime, limitCount = 100;
    if (range === "all") { startTime = 0; limitCount = 5000; }
    else {
        const map = { "1h": 60*60*1000, "6h": 6*60*60*1000, "24h": 24*60*60*1000, "7d": 7*24*60*60*1000 };
        startTime = now - (map[range] || 60*60*1000);
        if (range === "7d") limitCount = 200;
    }
    const historyQuery = query(ref(db, dbPath), limitToLast(limitCount));
    try {
        onValue(historyQuery, (snapshot) => {
            let dataArray = [];
            snapshot.forEach((childSnapshot) => {
                const raw = childSnapshot.val() || {};
                dataArray.push({ id: childSnapshot.key, ...raw, timestamp: getRecordTimestamp(raw, childSnapshot.key) });
            });
            dataArray = dataArray.filter((row) => isRecordOwnedByUser(row, user.uid, deviceId));
            dataArray = dataArray.filter((row) => (row.timestamp || 0) >= startTime);
            dataArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            latestHistoryData = dataArray;
            if (dataArray.length === 0) showEmptyState(range);
            else { hideLoadingState(); populateHistoryTable(dataArray); if (isGraphMode) updateAllCharts(); }
        }, { onlyOnce: true });
    } catch (error) { showEmptyState(range); }
}

function populateHistoryTable(dataArray) {
    const tbody = document.getElementById("history-data");
    const table = document.querySelector("#history-table table");
    if (!tbody || !table) return;
    tbody.innerHTML = "";
    function getColorClass(value, type) {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return "";
        const ranges = { temperature: [22, 28, "value-cold", "value-normal", "value-hot"], moisture: [50, 80, "value-low", "value-normal", "value-high"], humidity: [50, 80, "value-low", "value-normal", "value-high"], ph: [5.5, 6.5, "value-acidic", "value-normal", "value-alkaline"] };
        const r = ranges[type];
        if (!r) return "";
        if (numValue < r[0]) return r[2];
        if (numValue <= r[1]) return r[3];
        return r[4];
    }
    function formatValue(value, unit = "") {
        if (!value && value !== 0) return '<span class="offline-status">Offline</span>';
        return value + unit;
    }
    dataArray.forEach((row) => {
        const tr = document.createElement("tr");
        const moistureValue = row.soilMoisture || row.moisture;
        const phValue = row.phLevel || row.pH;
        const lightValue = row.lightStatus || row.light;
        tr.innerHTML = `<td>${formatTimestamp(row.timestamp || row.id)}</td><td class="${getColorClass(moistureValue, "moisture")}">${formatValue(moistureValue, "%")}</td><td class="${getColorClass(row.humidity, "humidity")}">${formatValue(row.humidity, "%")}</td><td class="${getColorClass(row.temperature, "temperature")}">${formatValue(row.temperature, "°C")}</td><td>${lightValue || '<span class="offline-status">Offline</span>'}</td><td class="${getColorClass(phValue, "ph")}">${formatValue(phValue, "")}</td>`;
        tbody.appendChild(tr);
    });
    table.style.display = "table";
}

function initializeGraphMode() {
    const toggleBtn = document.getElementById("graph-mode-toggle");
    const tableView = document.getElementById("history-table");
    const graphView = document.getElementById("history-graph");
    if (!toggleBtn) return;
    if (toggleBtn.dataset.graphModeInitialized) return;
    toggleBtn.dataset.graphModeInitialized = "true";
    toggleBtn.addEventListener("click", () => {
        isGraphMode = !isGraphMode;
        if (isGraphMode) {
            if (tableView) { tableView.classList.add("hidden"); tableView.style.display = "none"; }
            if (graphView) { graphView.classList.remove("hidden"); graphView.style.display = "grid"; void graphView.offsetHeight; }
            toggleBtn.innerHTML = '<i class="fas fa-table"></i> Table Mode';
            setTimeout(() => {
                graphView?.querySelectorAll("canvas").forEach((canvas) => { canvas.style.display = "block"; canvas.style.visibility = "visible"; });
                Object.keys(chartInstances).forEach((key) => { if (chartInstances[key]) { chartInstances[key].destroy(); delete chartInstances[key]; } });
                updateAllCharts();
            }, 700);
        } else {
            if (graphView) { graphView.classList.add("hidden"); graphView.style.display = "none"; }
            if (tableView) { tableView.classList.remove("hidden"); tableView.style.display = "block"; }
            toggleBtn.innerHTML = '<i class="fas fa-chart-bar"></i> Graph Mode';
        }
    });
}

function initializeExportButton() {
    const exportButton = document.getElementById("export-button");
    if (exportButton) {
        exportButton.addEventListener("click", () => {
            if (latestHistoryData?.length > 0) exportDataToCSV(latestHistoryData, currentTimeRange);
            else alert("Walang data na mai-export. Subukang pumili ng ibang time range.");
        });
    }
}

function exportDataToCSV(dataArray, range) {
    if (dataArray.length === 0) { alert("Walang data na mai-export."); return; }
    const headers = ["Date Time", "Soil Moisture (%)", "Humidity (%)", "Temperature (°C)", "Light Status", "pH Level"];
    let csvContent = headers.join(",") + "\n";
    dataArray.forEach((row) => {
        csvContent += [`"${formatTimestamp(row.timestamp || row.id)}"`, row.soilMoisture || row.moisture || "", row.humidity || "", row.temperature || "", row.lightStatus || row.light || "", row.phLevel || row.pH || ""].join(",") + "\n";
    });
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", ""); a.setAttribute("href", url);
    const dateStr = new Date().toISOString().split("T")[0];
    a.setAttribute("download", `agriknows-data-${range}-${dateStr}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showNotification(`Matagumpay na na-export ang ${dataArray.length} entries!`, "on");
}

function showNotification(message, type) {
    const notification = document.createElement("div");
    notification.innerHTML = `<i class="fas fa-${type === "on" ? "check-circle" : "times-circle"}"></i>${message}`;
    notification.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 20px;background:${type === "on" ? "#27ae60" : "#e74c3c"};color:white;border-radius:5px;box-shadow:0 4px 6px rgba(0,0,0,0.1);z-index:1001;font-weight:500;display:flex;align-items:center;gap:8px;`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

function updateAllCharts() {
    const graphEmptyState = document.getElementById("graph-empty-state");
    const graphContainers = document.querySelectorAll("#history-graph .graph-container");
    if (!latestHistoryData?.length) {
        if (graphEmptyState) graphEmptyState.classList.remove("hidden");
        graphContainers.forEach((c) => { c.style.display = "none"; });
        return;
    }
    if (graphEmptyState) graphEmptyState.classList.add("hidden");
    graphContainers.forEach((c) => { c.style.display = ""; });
    const dataToGraph = [...latestHistoryData].slice(-15).reverse();
    const labels = dataToGraph.map((d) => { const parts = formatTimestamp(d.timestamp || d.id).split(" "); return parts.length >= 2 ? parts.slice(1).join(" ") : parts[0]; });
    renderEnhancedChart("soil-moisture-chart", "Pagkabasa ng Lupa (%)", labels, dataToGraph.map((d) => d.soilMoisture || d.moisture || 0), "#3498db", 0, 100, 10);
    renderEnhancedChart("humidity-chart", "Halumigmig (%)", labels, dataToGraph.map((d) => d.humidity || 0), "#2980b9", 0, 100, 10);
    renderEnhancedChart("temperature-chart", "Temperatura (°C)", labels, dataToGraph.map((d) => d.temperature || 0), "#e74c3c", 0, 50, 5);
    renderEnhancedChart("ph-level-chart", "Antas ng pH", labels, dataToGraph.map((d) => d.pH || d.phLevel || 0), "#9b59b6", 0, 14, 2);
}

function renderEnhancedChart(canvasId, label, labels, data, color, yMin, yMax, yStep) {
    const ctxElement = document.getElementById(canvasId);
    if (!ctxElement) return;
    const ctx = ctxElement.getContext("2d");
    if (chartInstances[canvasId]) { chartInstances[canvasId].destroy(); }
    chartInstances[canvasId] = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label,
                data,
                backgroundColor: color + "22",
                borderColor: color,
                borderWidth: 2.5,
                pointBackgroundColor: color,
                pointBorderColor: "#fff",
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: yMin, max: yMax, beginAtZero: false,
                    grid: { color: "rgba(0,0,0,0.05)" },
                    ticks: { stepSize: yStep, color: "#6b7280", callback: (v) => v + (label.includes("°C") ? "°C" : label.includes("pH") ? "" : "%") },
                    title: { display: true, text: "Value", color: "#374151" }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: "#6b7280", maxRotation: 45, minRotation: 45 },
                    title: { display: true, text: "Oras", color: "#374151" }
                }
            },
            plugins: {
                legend: { display: false },
                title: { display: true, text: label, font: { size: 16, weight: "bold" }, color: "#1f2937", padding: { bottom: 15, top: 5 } },
                tooltip: {
                    backgroundColor: "rgba(0,0,0,0.8)", borderColor: color, borderWidth: 2,
                    callbacks: { label: (context) => `${label}: ${context.parsed.y.toFixed(1)}${label.includes("°C") ? "°C" : label.includes("pH") ? "" : "%"}` }
                }
            }
        }
    });
}

function initializeAutoRefresh() {
    autoRefreshInterval = setInterval(() => {
        if (!isGraphMode) { showRefreshIndicator(); loadHistoryData(currentTimeRange); setTimeout(() => hideRefreshIndicator(), 1500); }
    }, 30000);
}

function showRefreshIndicator() { document.getElementById("refresh-indicator")?.classList.add("active"); }
function hideRefreshIndicator() { document.getElementById("refresh-indicator")?.classList.remove("active"); }