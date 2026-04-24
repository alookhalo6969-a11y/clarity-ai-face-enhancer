document.addEventListener('DOMContentLoaded', () => {
    // Auth State
    let currentUser = null;
    let sessionToken = localStorage.getItem('sb-token');

    // Auth Elements
    const authOverlay = document.getElementById('auth-overlay');
    const mainContent = document.getElementById('main-content');
    const authForm = document.getElementById('auth-form');
    const authTabs = document.querySelectorAll('.auth-tab');
    const authTitle = document.getElementById('auth-title');
    const authError = document.getElementById('auth-error');
    const userEmailSpan = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    
    let authMode = 'login'; // login or signup

    // Tab switching for auth
    authTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            authTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            authMode = tab.dataset.type;
            authTitle.textContent = authMode === 'login' ? 'Login to Clarity AI' : 'Create an Account';
            authError.classList.add('hidden');
        });
    });

    // Handle Auth Submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        
        authError.classList.add('hidden');
        const endpoint = authMode === 'login' ? '/auth/login' : '/auth/signup';
        
        try {
            const response = await fetch(`http://localhost:5001${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            
            if (data.success) {
                if (authMode === 'signup') {
                    alert('Signup successful! Please login.');
                    authTabs[0].click(); // Switch to login
                } else {
                    currentUser = data.user;
                    sessionToken = data.session.access_token;
                    localStorage.setItem('sb-token', sessionToken);
                    localStorage.setItem('user-email', currentUser.email);
                    showMainApp();
                }
            } else {
                authError.textContent = data.error;
                authError.classList.remove('hidden');
            }
        } catch (err) {
            authError.textContent = "Connection error";
            authError.classList.remove('hidden');
        }
    });

    function showMainApp() {
        authOverlay.classList.add('hidden');
        mainContent.classList.remove('hidden');
        userEmailSpan.textContent = localStorage.getItem('user-email');
    }

    // Check existing session
    if (sessionToken) {
        showMainApp();
    }

    logoutBtn.addEventListener('click', async () => {
        await fetch('http://localhost:5001/auth/logout', { method: 'POST' });
        localStorage.clear();
        window.location.reload();
    });

    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const sections = {
        'upload-section': document.getElementById('upload-section'),
        'webcam-section': document.getElementById('webcam-section')
    };

    const historyTabBtn = document.getElementById('history-tab-btn');
    const historyGrid = document.getElementById('history-grid');
    const historyEmpty = document.getElementById('history-empty');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            Object.values(sections).forEach(s => s.classList.add('hidden'));

            // Add active class to clicked
            btn.classList.add('active');
            sections[btn.dataset.target].classList.remove('hidden');

            if (btn.dataset.target === 'history-section') {
                loadHistory();
            }
        });
    });

    async function loadHistory() {
        historyGrid.innerHTML = '';
        historyEmpty.classList.add('hidden');
        
        try {
            const response = await fetch('http://localhost:5001/user-history', {
                headers: { 'Authorization': `Bearer ${sessionToken}` }
            });
            const data = await response.json();
            
            if (data.success) {
                if (data.history.length === 0) {
                    historyEmpty.classList.remove('hidden');
                } else {
                    data.history.forEach(item => {
                        const div = document.createElement('div');
                        div.className = 'result-card';
                        div.innerHTML = `
                            <div class="result-images" style="aspect-ratio: 1/1;">
                                <img src="http://localhost:5001${encodeURI(item.enhanced_url)}" alt="Enhanced" style="width: 100%;">
                            </div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                                <p style="font-size:0.8rem; color:#94a3b8; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:60%;" title="${item.original_name}">${item.original_name}</p>
                                <a href="http://localhost:5001${encodeURI(item.enhanced_url)}" download="${item.original_name.replace(/\.[^/.]+$/, "")}_enhanced.jpg" class="download-btn" style="padding: 4px 8px; font-size: 0.7rem;">Download</a>
                            </div>
                        `;
                        historyGrid.appendChild(div);
                    });
                }
            }
        } catch (err) {
            console.error('Failed to load history:', err);
        }
    }

    // --- Upload Logic ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const enhanceBtn = document.getElementById('enhance-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const resultsContainer = document.getElementById('results-container');
    const resultsGrid = document.getElementById('results-grid');
    const settingsContainer = document.getElementById('settings-container');
    const fidelitySlider = document.getElementById('fidelity-slider');
    const fidelityVal = document.getElementById('fidelity-val');
    
    let selectedFiles = [];

    // Slider text update
    if (fidelitySlider) {
        fidelitySlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            if (val <= 0.3) fidelityVal.textContent = "🔥 Maximum AI Enhancement";
            else if (val <= 0.5) fidelityVal.textContent = "✨ Best Quality (Recommended)";
            else if (val <= 0.7) fidelityVal.textContent = "🎯 Balanced";
            else fidelityVal.textContent = "📷 Close to Original";
        });
    }

    // Drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    });

    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        const newFiles = Array.from(files).filter(file => file.type.startsWith('image/')).slice(0, 10);
        selectedFiles = [...newFiles]; // replace or append, let's replace for simplicity
        
        updatePreviews();
        enhanceBtn.classList.remove('disabled');
        settingsContainer.classList.remove('hidden');
    }

    function updatePreviews() {
        previewContainer.innerHTML = '';
        previewContainer.classList.remove('hidden');
        
        selectedFiles.forEach(file => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onloadend = () => {
                const div = document.createElement('div');
                div.className = 'preview-item';
                div.innerHTML = `<img src="${reader.result}" alt="Preview">`;
                previewContainer.appendChild(div);
            }
        });
    }

    enhanceBtn.addEventListener('click', async () => {
        if (selectedFiles.length === 0) return;

        enhanceBtn.classList.add('hidden');
        dropZone.classList.add('hidden');
        previewContainer.classList.add('hidden');
        settingsContainer.classList.add('hidden');
        loadingOverlay.classList.remove('hidden');
        resultsContainer.classList.add('hidden');

        const formData = new FormData();
        selectedFiles.forEach(file => formData.append('images', file));
        formData.append('fidelity_weight', fidelitySlider.value);

        try {
            const response = await fetch('http://localhost:5001/upload-images', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                },
                body: formData
            });
            const data = await response.json();

            if (data.success) {
                renderResults(data.results);
            } else {
                alert('Enhancement failed: ' + data.error);
                resetUploadView();
            }
        } catch (err) {
            console.error(err);
            alert('Failed to connect to backend.');
            resetUploadView();
        }
    });

    function renderResults(results) {
        loadingOverlay.classList.add('hidden');
        resultsContainer.classList.remove('hidden');
        resultsGrid.innerHTML = '';

        results.forEach((res, i) => {
            const file = selectedFiles[i];
            const originalUrl = URL.createObjectURL(file);
            
            const div = document.createElement('div');
            div.className = 'result-card';
            
            if (res.error) {
                div.innerHTML = `
                    <p style="color:#ef4444; text-align:center; padding: 20px;">Failed: ${res.error}</p>
                    <p style="text-align:center; font-size:0.9rem; color:#94a3b8">${res.original}</p>
                `;
            } else {
                div.innerHTML = `
                    <div class="result-images">
                        <img src="${originalUrl}" alt="Original">
                        <img src="http://localhost:5001${encodeURI(res.enhanced_url)}" alt="Enhanced">
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                        <p style="font-size:0.9rem; color:#94a3b8; margin:0; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; max-width:65%;" title="${res.original}">${res.original}</p>
                        <a href="http://localhost:5001${encodeURI(res.enhanced_url)}" download="${res.original.replace(/\.[^/.]+$/, "")}_enhanced.jpg" class="download-btn">Download</a>
                    </div>
                `;
            }
            resultsGrid.appendChild(div);
        });

        // Show back button
        const backBtn = document.createElement('button');
        backBtn.className = 'secondary-btn';
        backBtn.textContent = 'Process New Images';
        backBtn.style.marginTop = '20px';
        backBtn.onclick = resetUploadView;
        resultsContainer.appendChild(backBtn);
    }

    function resetUploadView() {
        selectedFiles = [];
        enhanceBtn.classList.remove('hidden');
        enhanceBtn.classList.add('disabled');
        dropZone.classList.remove('hidden');
        previewContainer.classList.add('hidden');
        loadingOverlay.classList.add('hidden');
        resultsContainer.classList.add('hidden');
        
        // Remove back button if exists
        const btn = resultsContainer.querySelector('.secondary-btn');
        if(btn) btn.remove();
    }

    // --- Webcam Logic ---
    const video = document.getElementById('webcam-video');
    const enhancedImg = document.getElementById('enhanced-frame');
    const startWebcamBtn = document.getElementById('start-webcam');
    const stopWebcamBtn = document.getElementById('stop-webcam');
    const canvas = document.getElementById('hidden-canvas');
    const ctx = canvas.getContext('2d');
    
    let ws = null;
    let stream = null;
    let streamingInterval = null;

    startWebcamBtn.addEventListener('click', async () => {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
            video.srcObject = stream;
            
            startWebcamBtn.classList.add('hidden');
            stopWebcamBtn.classList.remove('hidden');

            connectWebSocket();
            
            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                
                // Start sending frames
                streamingInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const frameData = canvas.toDataURL('image/jpeg', 0.8);
                        ws.send(frameData);
                    }
                }, 200); // 5 FPS for demo to not overload system immediately
            };
        } catch (err) {
            console.error('Webcam error:', err);
            alert('Could not access webcam.');
        }
    });

    stopWebcamBtn.addEventListener('click', () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        if (streamingInterval) {
            clearInterval(streamingInterval);
        }
        if (ws) {
            ws.close();
        }
        
        startWebcamBtn.classList.remove('hidden');
        stopWebcamBtn.classList.add('hidden');
        enhancedImg.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    });

    function connectWebSocket() {
        ws = new WebSocket('ws://localhost:5001'); // Connects to Node.js backend relay
        
        ws.onopen = () => console.log('Connected to Enhancement WS');
        
        ws.onmessage = (event) => {
            try {
                // Check if it's a JSON error message
                if (event.data.startsWith('{')) {
                    const msg = JSON.parse(event.data);
                    if (msg.error) {
                        console.error('AI Service Error:', msg.error);
                        // Optionally show this on the UI
                        return;
                    }
                }
                // Update enhanced image src
                enhancedImg.src = event.data;
            } catch (e) {
                // If not JSON, it's the raw image data string
                enhancedImg.src = event.data;
            }
        };
        
        ws.onclose = () => console.log('Disconnected from WS');
        ws.onerror = (err) => console.error('WS Error:', err);
    }
});
