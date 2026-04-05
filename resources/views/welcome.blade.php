<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AgriKnows - Dashboard</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="{{ asset('css/home.css') }}">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
</head>
<body>
    <div class="container">

        <header>
            <div class="header-left">
                <img src="{{ asset('images/LOGO.png') }}" class="agri-logo" alt="AgriKnows Logo">
                <h1>AGRIKNOWS</h1>
            </div>

            @php
                $sessionUser = session('user', []);
                $displayName = $sessionUser['username'] ?? 'User';
                $displayEmail = $sessionUser['email'] ?? '';
            @endphp

            <div class="header-right">
                <div style="text-align: right; margin-right: 10px; line-height: 1.4;">
                    <div style="font-size: 0.95rem; font-weight: 600; color: #2d6a4f;">{{ $displayName }}</div>
                    <small style="color: #6b7280; font-size: 0.78rem;">{{ $displayEmail }}</small>
                </div>
                <div class="header-icons">
                    <!-- Device Badge Button -->
                    <button id="addDeviceBtn" type="button" title="I-manage ang iyong device">
                        <i class="fas fa-microchip"></i>
                        <span id="deviceBadge">Device</span>
                    </button>

                    <!-- Notification Bell -->
                    <button id="notificationBell" class="notif-bell-btn" type="button" aria-label="Notifications">
                        <i class="fas fa-bell"></i>
                        <span id="notificationBadge" class="notif-badge hidden">0</span>
                    </button>
                    <div id="notificationDropdown" class="notif-dropdown hidden">
                        <div class="notif-dropdown-header">
                            <h4>Notifications</h4>
                        </div>
                        <ul id="notificationList" class="notif-list">
                            <li class="notif-empty">Wala pang notifications.</li>
                        </ul>
                    </div>

                    <!-- Profile -->
                    <a href="{{ url('/user-setting') }}">
                        <img src="{{ asset('images/profile.png') }}" class="user-profile" alt="User Profile">
                    </a>
                </div>
            </div>
        </header>

        <!-- ══════════════ DEVICE MANAGER MODAL ══════════════ -->
        <div id="deviceModal">
            <div class="modal-content">
                <div class="modal-header">
                    <span class="modal-title">
                        <i class="fas fa-microchip"></i> I-manage ang Device
                    </span>
                    <button id="closeDeviceModal" type="button" aria-label="Close">&times;</button>
                </div>

                <!-- Connected device info -->
                <div id="currentDeviceStatus">
                    <div class="device-status-title">
                        <i class="fas fa-check-circle" style="color:#2d6a4f;"></i>
                        Naka-connect na ang Device
                    </div>
                    <div class="device-status-row">
                        <b>Device ID:</b>
                        <span id="connectedDeviceId">—</span>
                    </div>
                    <div class="device-status-row">
                        <b>Device Name:</b>
                        <span id="connectedDeviceName">—</span>
                    </div>
                    <div class="device-status-row">
                        <b>Na-connect:</b>
                        <span id="connectedDeviceDate">—</span>
                    </div>
                </div>

                <!-- Connect form -->
                <div id="connectDeviceSection">
                    <p class="hint-text">
                        Ilagay ang Device ID ng iyong AgriKnows sensor device para simulan ang monitoring.
                    </p>
                    <div class="form-group">
                        <label class="form-label" for="deviceIdInput">Device ID</label>
                        <input type="text" id="deviceIdInput" class="form-input"
                            placeholder="e.g. device_001" autocomplete="off"/>
                    </div>
                    <div class="form-group">
                        <label class="form-label" for="deviceNameInput">
                            Device Name
                            <span class="optional-label">(optional)</span>
                        </label>
                        <input type="text" id="deviceNameInput" class="form-input"
                            placeholder="e.g. Sensor sa Bukid A" autocomplete="off"/>
                    </div>
                    <div id="deviceErrorMsg"></div>
                    <button id="confirmDeviceBtn" type="button">
                        <i class="fas fa-plug"></i> I-connect ang Device
                    </button>
                </div>

                <!-- Disconnect button -->
                <button id="removeDeviceBtn" type="button">
                    <i class="fas fa-unlink"></i> I-disconnect ang Device
                </button>
            </div>
        </div>

        <!-----------------------------------CROP MANAGEMENT------------------------------------>
        <div class="main-content">
            <section class="crop-management">
                <section class="crop-selector">
                    <div id="current-date"></div>
                    <div class="form-group">
                        <h2><i class="fas fa-seedling"></i> Crop Management</h2>
                        <div class="crop-controls">
                            <button class="select-crop" id="selectCropBtn"><i class="fas fa-seedling"></i> Pumili ng Pananim</button>
                            <button class="select-crop" id="addCropBtn"><i class="fas fa-plus-circle"></i> Mag Dagdag ng Pananim</button>
                            <div class="pump-control">
                                <label for="pump-switch"><i class="fas fa-faucet reading-icon pump"></i>Patubig</label>
                                <label class="switch">
                                    <input type="checkbox" id="pump-switch">
                                    <span class="slider round"></span>
                                </label>
                            </div>
                        </div>
                    </div>
                </section>
                <div class="current-crop">
                    <div class="crop-info">
                        <div class="crop-details">
                            <h3 id="currentCropName"><i class="fas fa-seedling"></i> Walang naka piling crop</h3>
                            <p id="currentCropOptimal">Pumili ng crop Para bantayan</p>
                        </div>
                        <div class="moisture-status" id="soil-moisture-status">
                            <p>Pakabasa ng lupa: <b>pinakamainam</b></p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Notification popup -->
            <section class="notif">
                <div id="popup" class="popup hidden">
                    <div class="popup-header">
                        <img src="{{ asset('images/warning.png') }}" alt="warning">
                        <h3>BABALA!</h3>
                    </div>
                    <p id="popup-text"></p>
                    <button id="popup-btn">Okay</button>
                </div>
                <div id="overlay" class="overlay hidden"></div>
            </section>

            <!-- SELECT CROP MODAL -->
            <div class="modal" id="selectCropModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Pag-pili ng Pananim</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <p>Pumili ng isang pananim upang itakda ang pinakamainam na kondisyon. Maaaring i-edit ang mga pasadyang pananim.</p>
                    <div class="crop-grid" id="cropGrid"></div>
                    <button id="confirmCropBtn" class="btn-confirm" style="width: 100%; margin-top: 20px;">
                        <i class="fas fa-check"></i> Kumpirmahin
                    </button>
                </div>
            </div>

            <!-- ADD CROP MODAL -->
            <div class="modal" id="addCropModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">Mag Dagdag ng Custom Crop</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <form id="addCropForm">
                        <div class="form-group">
                            <label class="form-label" for="CropName">Pangalan ng Pananim</label>
                            <input type="text" id="CropName" class="form-input" placeholder="Enter crop name" required>
                        </div>
                        <div class="form-group">
                            <span class="form-label">Saklaw ng Temperatura (°C)</span>
                            <div class="range-inputs">
                                <input type="number" id="tempMin" name="tempMin" class="form-input range-input" placeholder="Min" autocomplete="off" required>
                                <input type="number" id="tempMax" name="tempMax" class="form-input range-input" placeholder="Max" autocomplete="off" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <span class="form-label">Saklaw ng pagkabasa ng lupa (%)</span>
                            <div class="range-inputs">
                                <input type="number" id="moistureMin" name="moistureMin" class="form-input range-input" placeholder="Min" autocomplete="off" required>
                                <input type="number" id="moistureMax" name="moistureMax" class="form-input range-input" placeholder="Max" autocomplete="off" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <span class="form-label">Saklaw ng pH</span>
                            <div class="range-inputs">
                                <input type="number" step="0.1" id="phMin" class="form-input range-input" placeholder="Min" required>
                                <input type="number" step="0.1" id="phMax" class="form-input range-input" placeholder="Max" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <span class="form-label">Saklaw ng Halumigmig (%)</span>
                            <div class="range-inputs">
                                <input type="number" id="humidityMin" class="form-input range-input" placeholder="Min" required>
                                <input type="number" id="humidityMax" class="form-input range-input" placeholder="Max" required>
                            </div>
                        </div>
                        <button type="button" class="btn-add" style="width: 100%; margin-top: 10px;" id="saveBtn">
                            <i class="fas fa-check"></i> Kumpirmahin
                        </button>
                    </form>
                </div>
            </div>

            <!-- EDIT/DELETE CROP MODAL -->
            <div class="modal" id="editDeleteCropModal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title" id="editDeleteCropTitle">Edit Crop: Pangalan ng Pananim</h3>
                        <button class="close-modal">&times;</button>
                    </div>
                    <form id="editCropForm">
                        <input type="hidden" id="editCropKey">
                        <div class="form-group">
                            <label class="form-label" for="editCustomCropName">Pangalan ng Pananim</label>
                            <input type="text" id="editCustomCropName" class="form-input" placeholder="Enter crop name" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Saklaw ng Temperatura
                                <div class="range-inputs">
                                    <input type="number" id="editTempMin" class="form-input range-input" placeholder="Min" required>
                                    <input type="number" id="editTempMax" class="form-input range-input" placeholder="Max" required>
                                </div>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Saklaw ng Pagkabasa ng luba
                                <div class="range-inputs">
                                    <input type="number" id="editMoistureMin" class="form-input range-input" placeholder="Min" required>
                                    <input type="number" id="editMoistureMax" class="form-input range-input" placeholder="Max" required>
                                </div>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Saklaw ng pH
                                <div class="range-inputs">
                                    <input type="number" step="0.1" id="editPhMin" class="form-input range-input" placeholder="Min" required>
                                    <input type="number" step="0.1" id="editPhMax" class="form-input range-input" placeholder="Max" required>
                                </div>
                            </label>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Saklaw ng Halumigmig
                                <div class="range-inputs">
                                    <input type="number" id="editHumidityMin" class="form-input range-input" placeholder="Min" required>
                                    <input type="number" id="editHumidityMax" class="form-input range-input" placeholder="Max" required>
                                </div>
                            </label>
                        </div>
                        <button type="submit" class="btn-confirm" style="width: 100%; margin-top: 10px;">
                            <i class="fas fa-save"></i> Save Changes
                        </button>
                    </form>
                    <button id="deleteCropBtn" class="btn-delete" style="width: 100%; margin-top: 10px;">
                        <i class="fas fa-trash"></i> Burahin
                    </button>
                </div>
            </div>

            <!-- CURRENT STATUS -->
            <section class="current-status">
                <h2><i class="fas fa-chart-line"></i> Kasalukuyang Status</h2>
                <div class="current-status-grid">
                    <div class="reading-card">
                        <div class="reading-header">
                            <i class="fas fa-thermometer-half reading-icon temperature"></i>
                            <h3>Temperatura</h3>
                        </div>
                        <div class="value" id="current-temperature">-- °C</div>
                        <div id="status-temp-text" class="status-message">Loading...</div>
                        <div class="optimal" id="tempOptimal">Optimal: --</div>
                    </div>
                    <div class="reading-card">
                        <div class="reading-header">
                            <i class="fas fa-tint reading-icon moisture"></i>
                            <h3>Pagkabasa ng Lupa</h3>
                        </div>
                        <div class="value" id="current-soil-moisture">-- %</div>
                        <div id="status-moisture-text" class="status-message">Loading...</div>
                        <div class="optimal" id="moistureOptimal">Optimal: --</div>
                    </div>
                    <div class="reading-card">
                        <div class="reading-header">
                            <i class="fas fa-flask reading-icon ph"></i>
                            <h3>Antas ng pH</h3>
                        </div>
                        <div class="value" id="current-ph-level">-- pH</div>
                        <div id="status-ph-text" class="status-message">Loading...</div>
                        <div class="optimal" id="phOptimal">Optimal: --</div>
                    </div>
                    <div class="reading-card">
                        <div class="reading-header">
                            <i class="fas fa-cloud reading-icon humidity"></i>
                            <h3>Halumigmig</h3>
                        </div>
                        <div class="value" id="current-humidity">--%</div>
                        <div id="status-humidity-text" class="status-message">Loading...</div>
                        <div class="optimal" id="humidityOptimal">Optimal: --</div>
                    </div>
                    <div class="reading-card">
                        <div class="reading-header">
                            <i class="fas fa-sun reading-icon light"></i>
                            <h3>Light Status</h3>
                        </div>
                        <div class="value" id="light-status">--</div>
                        <div id="status-light-text" class="status-message">Loading...</div>
                    </div>
                </div>
            </section>

            <!-- DATA HISTORY -->
            <section class="data-history">
                <div class="history-header">
                    <h2><i class="fas fa-history"></i> Data History</h2>
                    <div class="history-controls">
                        <div class="time-filters">
                            <button class="time-filter active" data-time="1h">1 Hour</button>
                            <button class="time-filter" data-time="6h">6 Hours</button>
                            <button class="time-filter" data-time="24h">24 Hours</button>
                            <button class="time-filter" data-time="7d">7 Days</button>
                            <button class="time-filter" data-time="all">All Data</button>
                        </div>
                        <div class="history-actions">
                            <button id="export-button" class="export-btn">
                                <i class="fas fa-file-csv"></i> Export Data
                            </button>
                            <button id="graph-mode-toggle" class="graph-mode-btn">
                                <i class="fas fa-chart-bar"></i> Graph Mode
                            </button>
                        </div>
                    </div>
                </div>
                <div id="history-table" class="history-table">
                    <div class="history-loading">
                        <i class="fas fa-spinner"></i>
                        <p>Naglo-load ng data...</p>
                    </div>
                    <table style="display: none;">
                        <thead>
                            <tr>
                                <th>Araw at Oras</th>
                                <th>Pagkabasa ng Lupa</th>
                                <th>Halumigmig</th>
                                <th>Temperatura</th>
                                <th>Light Status</th>
                                <th>Antas ng pH</th>
                            </tr>
                        </thead>
                        <tbody id="history-data"></tbody>
                    </table>
                </div>
                <div id="history-graph" class="history-graph hidden">
                    <div id="graph-empty-state" class="history-empty graph-empty-state hidden">
                        <i class="fas fa-database"></i>
                        <h3>Walang Nakuhang Data</h3>
                        <p>Walang natagpuang sensor readings sa napiling oras.</p>
                    </div>
                    <div class="graph-container"><canvas id="soil-moisture-chart"></canvas></div>
                    <div class="graph-container"><canvas id="humidity-chart"></canvas></div>
                    <div class="graph-container"><canvas id="temperature-chart"></canvas></div>
                    <div class="graph-container"><canvas id="ph-level-chart"></canvas></div>
                </div>
            </section>

            <!-- Refresh Indicator -->
            <div class="refresh-indicator" id="refresh-indicator">
                <i class="fas fa-sync-alt"></i>
                <span>Nag-uupdate...</span>
            </div>
        </div>
    </div>

    <script type="module" src="{{ asset('js/home.js') }}"></script>
    <footer>
        <p>© 2025 AgriKnows. All rights reserved.</p>
    </footer>
</body>
</html>