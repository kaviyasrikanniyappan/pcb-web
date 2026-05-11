// ===========================================
// PCB VISION - UPLOAD SYSTEM REWRITE
// Professional Image Upload & Processing Workflow
// ===========================================

class UploadManager {
    constructor() {
        this.uploadedImage = null;
        this.detectionResults = null;
        this.uploadedFilename = null;
        this.isProcessing = false;
        this.currentSection = 'home';
        this.cameraCaptured = false;
        this.invalidPcbImage = false;

        // DOM elements
        this.elements = {};

        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.initializeApp();
    }

    cacheElements() {
        this.elements = {
            // Upload elements
            uploadArea: document.getElementById('upload-area'),
            fileInput: document.getElementById('file-input'),
            fileBrowseBtn: document.getElementById('file-browse-btn'),
            cameraTriggerBtn: document.getElementById('camera-trigger-btn'),
            cameraModal: document.getElementById('camera-modal'),
            cameraVideo: document.getElementById('camera-video'),
            cameraCanvas: document.getElementById('camera-canvas'),
            cameraActionBtn: document.getElementById('camera-action-btn'),
            analyzeBtn: document.getElementById('analyze-btn'),
            closePreviewBtn: document.getElementById('close-preview-btn'),

            // Preview elements
            previewCard: document.getElementById('preview-card'),
            emptyState: document.getElementById('empty-state'),
            previewImage: document.getElementById('preview-image'),
            previewFilename: document.getElementById('preview-filename'),
            previewSize: document.getElementById('preview-size'),
            historySearch: document.getElementById('history-search'),
            historyDateFilter: document.getElementById('history-date-filter'),
            historyStatusFilter: document.getElementById('history-status-filter'),
            defectTypesChartCanvas: document.getElementById('defect-types-chart'),
            monthlyTrendChartCanvas: document.getElementById('monthly-trend-chart'),
            defectTypesPlaceholder: document.getElementById('defect-types-placeholder'),
            monthlyTrendPlaceholder: document.getElementById('monthly-trend-placeholder'),

            // Loading elements
            uploadProgress: document.getElementById('upload-progress'),
            uploadProgressBar: document.getElementById('upload-progress-bar'),
            uploadStatus: document.getElementById('upload-status'),

            // Results elements
            resultImage: document.getElementById('result-image'),
            statusCard: document.getElementById('status-card'),
            confidence: document.getElementById('confidence'),
            normalPercentage: document.getElementById('result-normal-percentage'),
            defectedPercentage: document.getElementById('result-defected-percentage'),
            pcbType: document.getElementById('pcb-type'),
            severityLevel: document.getElementById('severity-level'),
            reliabilityScore: document.getElementById('reliability-score'),
            reliabilityBreakdown: document.getElementById('reliability-breakdown'),
            boundingBoxes: document.getElementById('bounding-boxes')
        };
    }

    bindEvents() {
        // Upload area click - open file chooser
        if (this.elements.uploadArea) {
            this.elements.uploadArea.addEventListener('click', (e) => {
                // Only trigger if clicking the upload area itself, not buttons inside
                if (e.target === this.elements.uploadArea ||
                    e.target.closest('.upload-text') ||
                    e.target.closest('.upload-animation')) {
                    e.preventDefault();
                    this.openFileChooser();
                }
            });
        }

        // Browse button click
        if (this.elements.fileBrowseBtn) {
            this.elements.fileBrowseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openFileChooser();
            });
        }

        // File input change - prepare preview and wait for manual prediction
        if (this.elements.fileInput) {
            this.elements.fileInput.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            });
        }

        // Drag and drop
        if (this.elements.uploadArea) {
            this.elements.uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.elements.uploadArea.classList.add('dragover');
            });

            this.elements.uploadArea.addEventListener('dragleave', (e) => {
                this.elements.uploadArea.classList.remove('dragover');
            });

            this.elements.uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                this.elements.uploadArea.classList.remove('dragover');
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    this.handleFileSelect(files[0]);
                }
            });
        }

        // Camera button
        if (this.elements.cameraTriggerBtn) {
            this.elements.cameraTriggerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.startCamera();
            });
        }

        // Camera action button inside modal
        if (this.elements.cameraActionBtn) {
            this.elements.cameraActionBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.captureImage();
            });
        }

        // History filters
        if (this.elements.historySearch) {
            this.elements.historySearch.addEventListener('input', () => {
                this.loadHistory();
            });
        }
        if (this.elements.historyDateFilter) {
            this.elements.historyDateFilter.addEventListener('change', () => {
                this.loadHistory();
            });
        }
        if (this.elements.historyStatusFilter) {
            this.elements.historyStatusFilter.addEventListener('change', () => {
                this.loadHistory();
            });
        }

        // Chart toggles
        document.querySelectorAll('.chart-toggle').forEach(toggle => {
            toggle.addEventListener('click', (event) => {
                const button = event.currentTarget;
                const card = button.closest('.chart-card');
                if (!card) return;

                card.querySelectorAll('.chart-toggle').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                const canvas = card.querySelector('canvas');
                const chartId = canvas ? canvas.id : null;
                const chartType = button.dataset.chart;
                if (chartId === 'defect-types-chart' && this.defectChart) {
                    this.defectChart.config.type = chartType === 'bar' ? 'bar' : 'doughnut';
                    this.defectChart.update();
                }
                if (chartId === 'monthly-trend-chart' && this.trendChart) {
                    this.trendChart.config.type = chartType === 'area' ? 'line' : chartType;
                    this.trendChart.options.scales.y.beginAtZero = true;
                    this.trendChart.update();
                }
            });
        });

        // Analyze button (manual trigger)
        if (this.elements.analyzeBtn) {
            this.elements.analyzeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.uploadedImage && !this.isProcessing) {
                    this.processImage(this.uploadedImage);
                }
            });
        }

        // Close preview button
        if (this.elements.closePreviewBtn) {
            this.elements.closePreviewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.clearPreview();
            });
        }
    }

    openFileChooser() {
        if (this.elements.fileInput) {
            this.elements.fileInput.click();
        }
    }

    async handleFileSelect(file) {
        try {
            console.log('File selected for upload:', file.name, file.type, file.size);

            // Validate file
            if (!this.validateFile(file)) {
                return;
            }

            this.invalidPcbImage = false;
            this.uploadedImage = file;
            this.displayPreview(file);

            const validPcb = await this.estimatePcbValidity(file);
            if (!validPcb) {
                this.invalidPcbImage = true;
                if (this.elements.analyzeBtn) {
                    this.elements.analyzeBtn.disabled = true;
                }
                this.showToast('Invalid PCB Image Detected', 'The selected image does not resemble a PCB board. Please upload a valid PCB image.', 'error');
                return;
            }

            // Show success toast
            this.showToast('Image Selected', `Ready to predict "${file.name}"`, 'success');

            // Enable manual prediction once the image is ready
            if (this.elements.analyzeBtn) {
                this.elements.analyzeBtn.disabled = false;
                this.elements.analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Predict PCB Defect';
            }

        } catch (error) {
            console.error('File selection error:', error);
            this.showToast('Error', 'Failed to select file', 'error');
        }
    }

    validateFile(file) {
        // Check file type
        if (!file.type.startsWith('image/') ||
            !['image/jpeg', 'image/jpg', 'image/png'].includes(file.type.toLowerCase())) {
            this.showToast('Invalid File Type', 'Please select a JPG, JPEG, or PNG image', 'error');
            return false;
        }

        // Check file size (16MB)
        const MAX_SIZE = 16 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            this.showToast('File Too Large', 'Please select an image smaller than 16MB', 'error');
            return false;
        }

        return true;
    }

    async estimatePcbValidity(file) {
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => {
                const maxSide = 512;
                const ratio = Math.min(maxSide / image.width, maxSide / image.height, 1);
                const width = Math.max(100, Math.round(image.width * ratio));
                const height = Math.max(100, Math.round(image.height * ratio));

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0, width, height);

                const imageData = ctx.getImageData(0, 0, width, height);
                const data = imageData.data;
                let edgeScore = 0;
                let greenScore = 0;
                let brightnessSum = 0;
                let varianceSum = 0;
                let count = 0;
                let lastLum = null;

                for (let y = 0; y < height; y += 4) {
                    for (let x = 0; x < width; x += 4) {
                        const idx = (y * width + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                        brightnessSum += lum;
                        if (lastLum !== null) {
                            edgeScore += Math.abs(lum - lastLum);
                        }
                        lastLum = lum;
                        const minChannel = Math.min(r, g, b);
                        const maxChannel = Math.max(r, g, b);
                        const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
                        if (g > r * 0.9 && g > b * 0.9 && g > 70 && saturation > 0.2) {
                            greenScore += 1;
                        }
                        count += 1;
                    }
                }

                const meanBrightness = brightnessSum / count;
                const edgeDensity = edgeScore / count;
                const greenDensity = greenScore / count;

                const invalid = (edgeDensity < 7 && greenDensity < 0.08) ||
                                (meanBrightness > 240 && edgeDensity < 3) ||
                                (meanBrightness < 20 && edgeDensity < 3);

                resolve(!invalid);
            };
            image.onerror = () => resolve(false);
            image.src = URL.createObjectURL(file);
        });
    }

    displayPreview(file) {
        try {
            // Hide empty state, show preview
            if (this.elements.emptyState) {
                this.elements.emptyState.style.display = 'none';
            }
            if (this.elements.previewCard) {
                this.elements.previewCard.style.display = 'block';
            }

            // Set preview image
            if (this.elements.previewImage) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.elements.previewImage.src = e.target.result;
                };
                reader.readAsDataURL(file);
            }

            // Set file info
            if (this.elements.previewFilename) {
                this.elements.previewFilename.textContent = file.name;
            }
            if (this.elements.previewSize) {
                const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                this.elements.previewSize.textContent = `${sizeMB} MB`;
            }

            if (this.elements.analyzeBtn) {
                this.elements.analyzeBtn.disabled = false;
                this.elements.analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Predict PCB Defect';
            }

            console.log('Preview displayed successfully');
        } catch (error) {
            console.error('Preview display error:', error);
            this.showToast('Error', 'Failed to display preview', 'error');
        }
    }

    clearPreview() {
        try {
            this.uploadedImage = null;
            this.detectionResults = null;
            this.uploadedFilename = null;

            // Clear file input
            if (this.elements.fileInput) {
                this.elements.fileInput.value = '';
            }

            // Reset UI
            if (this.elements.previewCard) {
                this.elements.previewCard.style.display = 'none';
            }
            if (this.elements.emptyState) {
                this.elements.emptyState.style.display = 'block';
            }
            if (this.elements.previewImage) {
                this.elements.previewImage.src = '';
            }

            // Reset analyze button
            if (this.elements.analyzeBtn) {
                this.elements.analyzeBtn.disabled = true;
                this.elements.analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Predict PCB Defect';
            }

            console.log('Preview cleared');
        } catch (error) {
            console.error('Clear preview error:', error);
        }
    }

    async processImage(file) {
        if (this.isProcessing) {
            console.log('Process skipped because another operation is already running');
            return;
        }

        console.log('Beginning image processing pipeline', {
            fileName: file?.name,
            uploadedFilename: this.uploadedFilename
        });

        this.isProcessing = true;
        this.disableUploadControls();

        try {
            // Step 1: Upload with progress
            await this.uploadImage(file);

            // Step 2: Run prediction
            await this.runPrediction(file);

            // Step 3: Display results
            this.displayResults(file, this.detectionResults);
            this.showSection('results');
            this.showToast('Analysis Complete', 'PCB defect detection finished successfully!', 'success');

            // Refresh data
            await this.loadHistory();
            await this.loadAnalytics();

        } catch (error) {
            console.error('Image processing error:', error);
            this.showToast('Processing Error', error.message || 'Failed to process image', 'error');
        } finally {
            this.isProcessing = false;
            this.enableUploadControls();
            this.hideLoading();
        }
    }

    async fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        options.signal = controller.signal;
        options.credentials = 'same-origin';

        console.log(`[Network] Fetch start: ${url}`, options);
        try {
            const response = await fetch(url, options);
            clearTimeout(timeout);
            console.log(`[Network] Fetch complete: ${url}`, {
                status: response.status,
                ok: response.ok,
                redirected: response.redirected,
                type: response.type
            });
            return response;
        } catch (error) {
            clearTimeout(timeout);
            console.error(`[Network] Fetch error: ${url}`, error);
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            throw error;
        }
    }

    async parseJsonResponse(response) {
        const text = await response.text();
        console.log('[Network] Response body:', text);
        if (!text) {
            throw new Error('Empty server response');
        }

        try {
            return JSON.parse(text);
        } catch (error) {
            console.error('[Network] JSON parse error', error, text);
            throw new Error('Server returned invalid JSON');
        }
    }

    async uploadImage(file) {
        this.showLoading('Uploading image...');

        const formData = new FormData();
        formData.append('file', file);

        console.log('Upload start:', file.name);
        const response = await this.fetchWithTimeout('/api/upload', {
            method: 'POST',
            body: formData
        }, 60000);

        const data = await this.parseJsonResponse(response);
        if (!response.ok || !data.success) {
            throw new Error(data.message || `Upload failed: ${response.status}`);
        }

        this.uploadedFilename = data.result.filename;
        console.log('Upload success:', this.uploadedFilename, data);
    }

    async runPrediction(file) {
        this.showLoading('Analyzing with AI model...');

        const formData = new FormData();
        if (this.uploadedFilename) {
            formData.append('filename', this.uploadedFilename);
            console.log('Prediction start using stored filename:', this.uploadedFilename);
        } else {
            formData.append('file', file);
            console.log('Prediction start with direct file upload');
        }

        const response = await this.fetchWithTimeout('/api/predict', {
            method: 'POST',
            body: formData
        }, 90000);

        const data = await this.parseJsonResponse(response);
        
        // Handle PCB validation failure
        if (!response.ok || !data.success) {
            console.error('Prediction response error:', data);
            
            // Check if it's a PCB validation error
            if (data.result && data.result.is_valid_pcb === false) {
                throw new Error(`Invalid PCB Image Detected: ${data.result.validation_reason || 'Image does not appear to be a PCB'}`);
            }
            
            throw new Error(data.message || 'Prediction failed');
        }

        this.detectionResults = data.result;
        console.log('Prediction completed:', data);
    }

    disableUploadControls() {
        // Disable all upload-related buttons
        const buttons = [
            this.elements.fileBrowseBtn,
            this.elements.cameraTriggerBtn,
            this.elements.analyzeBtn
        ];

        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.6';
                btn.style.cursor = 'not-allowed';
            }
        });

        // Disable file input
        if (this.elements.fileInput) {
            this.elements.fileInput.disabled = true;
        }

        // Disable upload area
        if (this.elements.uploadArea) {
            this.elements.uploadArea.style.pointerEvents = 'none';
            this.elements.uploadArea.style.opacity = '0.6';
        }
    }

    enableUploadControls() {
        const buttons = [
            this.elements.fileBrowseBtn,
            this.elements.cameraTriggerBtn,
            this.elements.analyzeBtn
        ];

        buttons.forEach(btn => {
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '';
                btn.style.cursor = '';
            }
        });

        if (this.elements.fileInput) {
            this.elements.fileInput.disabled = false;
        }

        if (this.elements.uploadArea) {
            this.elements.uploadArea.style.pointerEvents = '';
            this.elements.uploadArea.style.opacity = '';
        }
    }

    async startCamera() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera access is not supported in this browser. Please update your browser.');
            }

            if (this.elements.cameraModal) {
                this.elements.cameraModal.classList.remove('hidden');
            }

            // Show loading state
            this.showLoading('Starting camera...');
            
            // Request camera access with specific constraints
            const constraints = {
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            try {
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                this.cameraStream = stream;
                this.cameraCaptured = false;

                if (this.elements.cameraVideo) {
                    this.elements.cameraVideo.muted = true;
                    this.elements.cameraVideo.playsInline = true;
                    this.elements.cameraVideo.setAttribute('muted', '');
                    this.elements.cameraVideo.setAttribute('playsinline', '');
                    this.elements.cameraVideo.srcObject = stream;
                    this.elements.cameraVideo.onloadedmetadata = async () => {
                        try {
                            await this.elements.cameraVideo.play();
                        } catch (err) {
                            console.error('Play video error:', err);
                            this.showToast('Camera Error', 'Failed to play camera stream.', 'error');
                        }
                    };
                }

                if (this.elements.cameraActionBtn) {
                    this.elements.cameraActionBtn.innerHTML = '<i class="fas fa-camera"></i> Capture Image';
                    this.elements.cameraActionBtn.disabled = false;
                }

                this.hideLoading();
                this.showToast('Camera Ready', 'Position your PCB board and click Capture', 'info');
            } catch (err) {
                this.hideLoading();
                if (err.name === 'NotAllowedError') {
                    throw new Error('Camera permission denied. Please allow camera access in your browser settings.');
                } else if (err.name === 'NotFoundError') {
                    throw new Error('No camera device found. Please connect a camera.');
                } else {
                    throw err;
                }
            }
        } catch (error) {
            console.error('Camera error:', error);
            this.hideLoading();
            this.showToast('Camera Error', error.message || 'Unable to access the camera.', 'error');
            this.closeCamera();
        }
    }

    captureImage() {
        // If image already captured, this click is a "Retake" request
        if (this.cameraCaptured) {
            this.uploadedImage = null;
            this.cameraCaptured = false;
            this.invalidPcbImage = false;
            
            if (this.elements.cameraActionBtn) {
                this.elements.cameraActionBtn.innerHTML = '<i class="fas fa-camera"></i> Capture';
            }
            
            if (this.elements.analyzeBtn) {
                this.elements.analyzeBtn.disabled = true;
            }
            
            this.startCamera();
            return;
        }

        if (!this.elements.cameraVideo || !this.elements.cameraCanvas) {
            return;
        }

        try {
            const video = this.elements.cameraVideo;
            const canvas = this.elements.cameraCanvas;
            
            if (video.readyState !== video.HAVE_ENOUGH_DATA) {
                this.showToast('Camera Error', 'Camera is not ready. Please wait a moment and try again.', 'error');
                return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            if (canvas.width === 0 || canvas.height === 0) {
                this.showToast('Capture Error', 'Failed to capture video frame.', 'error');
                return;
            }

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    this.showToast('Capture Error', 'Unable to capture camera frame.', 'error');
                    return;
                }

                if (blob.size < 10000) {
                    this.showToast('Capture Error', 'Captured image is too small. Please try again.', 'error');
                    return;
                }

                const fileName = `camera_capture_${Date.now()}.png`;
                const file = new File([blob], fileName, { type: 'image/png' });

                const validPcb = await this.estimatePcbValidity(file);
                if (!validPcb) {
                    this.showToast('Invalid PCB Image', 'The captured image does not appear to be a valid PCB. Please retake the image.', 'error');
                    this.uploadedImage = null;
                    this.invalidPcbImage = true;
                    return;
                }

                this.uploadedImage = file;
                this.cameraCaptured = true;
                this.invalidPcbImage = false;

                this.displayPreview(file);
                this.showToast('Image Captured', 'Camera image captured successfully. Ready for analysis.', 'success');

                if (this.elements.cameraActionBtn) {
                    this.elements.cameraActionBtn.innerHTML = '<i class="fas fa-redo"></i> Retake Image';
                }

                if (this.elements.analyzeBtn) {
                    this.elements.analyzeBtn.disabled = false;
                }

                if (this.elements.cameraVideo) {
                    this.elements.cameraVideo.pause();
                }

                this.closeCamera();
            }, 'image/png');
        } catch (error) {
            console.error('Capture error:', error);
            this.showToast('Capture Error', error.message || 'Failed to capture image.', 'error');
        }
    }

    closeCamera() {
        if (this.elements.cameraModal) {
            this.elements.cameraModal.classList.add('hidden');
        }

        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => {
                try {
                    track.stop();
                } catch (err) {
                    console.error('Error stopping camera track:', err);
                }
            });
            this.cameraStream = null;
        }

        if (this.elements.cameraVideo) {
            this.elements.cameraVideo.srcObject = null;
            this.elements.cameraVideo.pause();
        }
    }

    async loadHistory() {
        try {
            console.log('Loading history...');
            const params = new URLSearchParams();
            if (this.elements.historySearch && this.elements.historySearch.value.trim()) {
                params.append('search', this.elements.historySearch.value.trim());
            }
            if (this.elements.historyStatusFilter && this.elements.historyStatusFilter.value) {
                params.append('status', this.elements.historyStatusFilter.value);
            }
            if (this.elements.historyDateFilter && this.elements.historyDateFilter.value) {
                params.append('month', this.elements.historyDateFilter.value);
            }
            const response = await this.fetchWithTimeout(`/api/history?${params.toString()}`, { method: 'GET' }, 30000);
            const data = await this.parseJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.message || 'Failed to load history');
            }

            const historyList = document.getElementById('history-list');
            const recentActivity = document.getElementById('recent-activity');

            if (historyList) {
                historyList.innerHTML = '';
                if (Array.isArray(data) && data.length > 0) {
                    data.forEach(item => {
                        const card = document.createElement('div');
                        card.className = 'history-card';
                        card.innerHTML = `
                            <div class="history-card-image">
                                <img src="${item.image_url || ''}" alt="History thumbnail">
                            </div>
                            <div class="history-card-body">
                                <div class="history-card-header">
                                    <h4>${item.defectType || item.status || 'Unknown'}</h4>
                                    <span>${item.created_at || ''}</span>
                                </div>
                                <div class="history-card-meta">
                                    <span class="status-chip ${item.status === 'Defected' ? 'chip-danger' : 'chip-success'}">${item.status || 'Unknown'}</span>
                                    <span>PCB: ${item.pcbType || 'Unknown'}</span>
                                    <span>Confidence: ${item.confidence != null ? item.confidence + '%' : 'N/A'}</span>
                                </div>
                                <p class="history-card-text">${item.explanation ? item.explanation.substring(0, 120) + '...' : 'No additional details available.'}</p>
                            </div>
                        `;
                        historyList.appendChild(card);
                    });
                } else {
                    historyList.innerHTML = `
                        <div class="history-empty">
                            <p>No history data available yet.</p>
                        </div>
                    `;
                }
            }

            if (recentActivity) {
                recentActivity.innerHTML = '';
                const historyItems = Array.isArray(data) ? data.slice(0, 5) : [];
                if (historyItems.length > 0) {
                    historyItems.forEach(item => {
                        const activity = document.createElement('div');
                        activity.className = 'activity-item';
                        activity.innerHTML = `
                            <div class="activity-icon">
                                <i class="fas fa-history"></i>
                            </div>
                            <div class="activity-content">
                                <p>${item.defectType || item.status || 'Scan'}</p>
                                <small>${item.created_at || 'Unknown date'}</small>
                            </div>
                        `;
                        recentActivity.appendChild(activity);
                    });
                } else {
                    recentActivity.innerHTML = `
                        <div class="activity-item">
                            <div class="activity-icon">
                                <i class="fas fa-spinner fa-spin"></i>
                            </div>
                            <div class="activity-content">
                                <p>No recent activity available.</p>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('History loading error:', error);
        }
    }

    async loadAnalytics() {
        try {
            console.log('Loading analytics...');
            const response = await this.fetchWithTimeout('/api/stats', { method: 'GET' }, 30000);
            const data = await this.parseJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.message || 'Failed to load analytics');
            }

            const updateElement = (id, value) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value != null ? value : el.textContent;
            };

            updateElement('summary-total', data.total || 0);
            updateElement('summary-normal', data.normal || 0);
            updateElement('summary-defected', data.defected || 0);
            updateElement('summary-success', `${data.accuracy || 0}%`);
            updateElement('total-analyses', data.total || 0);
            updateElement('normal-count', data.normal || 0);
            updateElement('defected-count', data.defected || 0);
            updateElement('success-rate', `${data.accuracy || 0}%`);
            updateElement('avg-confidence', data.average_confidence ? `${data.average_confidence}%` : `${data.accuracy || 0}%`);
            updateElement('common-defect', data.defect_types && data.defect_types.length > 0 ? data.defect_types[0].name : 'None');

            this.updateCharts(data);
        } catch (error) {
            console.error('Analytics loading error:', error);
        }
    }

    initializeApp() {
        // App initialization
        this.showSection('home');
        this.initializeCharts();
        this.loadHistory();
        this.loadAnalytics();
        console.log('UploadManager initialized');
    }

    showLoading(message = 'Processing...') {
        // Show global loading overlay using auth utilities if available
        if (window.AuthUtils && window.AuthUtils.showLoading) {
            window.AuthUtils.showLoading(message);
        } else if (typeof showAuthLoading === 'function') {
            showAuthLoading(message);
        }
        
        // Update analyze button to show loading state
        if (this.elements.analyzeBtn) {
            this.elements.analyzeBtn.innerHTML = `
                <div class="btn-spinner"></div>
                ${message}
            `;
            this.elements.analyzeBtn.disabled = true;
        }
    }

    hideLoading() {
        // Hide global loading overlay using auth utilities if available
        if (window.AuthUtils && window.AuthUtils.hideLoading) {
            window.AuthUtils.hideLoading();
        } else if (typeof hideAuthLoading === 'function') {
            hideAuthLoading();
        }
        
        // Reset analyze button
        if (this.elements.analyzeBtn) {
            this.elements.analyzeBtn.innerHTML = '<i class="fas fa-magic"></i> Predict PCB Defect';
        }
    }

    displayResults(file, results) {
        try {
            // Display image
            if (this.elements.resultImage) {
                this.elements.resultImage.src = URL.createObjectURL(file);
            }

            // Update status card
            this.updateStatusCard(results);

            // Update metrics
            this.updateMetrics(results);

            // Update PCB classification overview
            this.updateAnalysisOverview(results);

            // Update defect details
            this.updateDefectDetails(results);

            // Draw bounding boxes
            this.drawBoundingBoxes(results.boundingBoxes || []);

            console.log('Results displayed successfully');
        } catch (error) {
            console.error('Display results error:', error);
            this.showToast('Error', 'Failed to display results', 'error');
        }
    }

    updateStatusCard(results) {
        try {
            if (!this.elements.statusCard) return;

            const statusIcon = this.elements.statusCard.querySelector('#status-icon');
            const statusTitle = this.elements.statusCard.querySelector('#status-title');
            const statusDescription = this.elements.statusCard.querySelector('#status-description');
            const statusValue = (results.status || '').toString().toLowerCase();

            this.elements.statusCard.className = 'status-card';

            if (statusValue === 'normal') {
                this.elements.statusCard.classList.add('normal');
                if (statusIcon) statusIcon.className = 'fas fa-check-circle';
                if (statusTitle) statusTitle.textContent = 'Normal PCB';
                if (statusDescription) statusDescription.textContent = 'No defects detected in this PCB';
            } else if (statusValue === 'defected') {
                this.elements.statusCard.classList.add('defected');
                if (statusIcon) statusIcon.className = 'fas fa-exclamation-triangle';
                if (statusTitle) statusTitle.textContent = 'Defect Detected';
                if (statusDescription) statusDescription.textContent = `Type: ${results.defectType || 'Unknown'}`;
            } else {
                this.elements.statusCard.classList.add('invalid');
                if (statusIcon) statusIcon.className = 'fas fa-question-circle';
                if (statusTitle) statusTitle.textContent = 'Invalid Input';
                if (statusDescription) statusDescription.textContent = 'Unable to detect PCB in image';
            }
        } catch (error) {
            console.error('Update status card error:', error);
        }
    }

    updateMetrics(results) {
        try {
            if (this.elements.confidence) {
                this.elements.confidence.textContent = `${Math.round(results.confidence || 0)}%`;
            }
            if (this.elements.normalPercentage) {
                this.elements.normalPercentage.textContent = `${Math.round(results.normalPercentage || 0)}%`;
            }
            if (this.elements.defectedPercentage) {
                this.elements.defectedPercentage.textContent = `${Math.round(results.defectedPercentage || 0)}%`;
            }
        } catch (error) {
            console.error('Update metrics error:', error);
        }
    }

    updateAnalysisOverview(results) {
        try {
            if (this.elements.pcbType) {
                this.elements.pcbType.textContent = results.pcbType || 'Unknown';
            }
            if (this.elements.severityLevel) {
                this.elements.severityLevel.textContent = results.severity || 'Unknown';
            }
            if (this.elements.reliabilityScore) {
                this.elements.reliabilityScore.textContent = `${Math.round(results.reliabilityScore || 0)}%`;
            }
            if (this.elements.reliabilityBreakdown) {
                const breakdown = results.reliabilityBreakdown || {};
                const defectConfidence = Math.round(breakdown.defectConfidence || results.confidence || 0);
                const pcbConfidence = Math.round(breakdown.pcbTypeConfidence || results.pcbTypeConfidence || 0);
                const formatted = `
                    <li>Model confidence: ${defectConfidence}%</li>
                    <li>PCB type confidence: ${pcbConfidence}%</li>
                    <li>Overall reliability: ${Math.round(results.reliabilityScore || 0)}%</li>
                `;
                this.elements.reliabilityBreakdown.innerHTML = formatted;
            }
        } catch (error) {
            console.error('Update analysis overview error:', error);
        }
    }

    updateDefectDetails(results) {
        try {
            const defectDetails = document.getElementById('defect-details');
            if (!defectDetails) return;

            const statusValue = (results.status || '').toString().toLowerCase();
            if (statusValue === 'defected' && results.defectType) {
                const whatEl = document.getElementById('defect-what');
                const whyEl = document.getElementById('defect-why');
                const impactEl = document.getElementById('defect-impact');
                const solutionEl = document.getElementById('defect-solution');

                if (whatEl) whatEl.textContent = results.explanation_what || results.what || 'Unable to determine';
                if (whyEl) whyEl.textContent = results.explanation_why || results.why || 'Unable to determine';
                if (impactEl) impactEl.textContent = results.explanation_impact || results.impact || 'Unable to determine';
                if (solutionEl) solutionEl.textContent = results.suggestedSolution || results.suggested_solution || 'Unable to determine';

                defectDetails.style.display = 'block';
            } else if (statusValue === 'normal') {
                const whatEl = document.getElementById('defect-what');
                const whyEl = document.getElementById('defect-why');
                const impactEl = document.getElementById('defect-impact');
                const solutionEl = document.getElementById('defect-solution');

                if (whatEl) whatEl.textContent = 'No defects detected in this PCB image.';
                if (whyEl) whyEl.textContent = 'The board appears to meet manufacturing quality standards.';
                if (impactEl) impactEl.textContent = 'PCB is ready for assembly and further testing.';
                if (solutionEl) solutionEl.textContent = 'No repair needed. Continue with production.';

                defectDetails.style.display = 'block';
            } else {
                defectDetails.style.display = 'none';
            }
        } catch (error) {
            console.error('Update defect details error:', error);
        }
    }

    drawBoundingBoxes(boxes) {
        try {
            if (!this.elements.boundingBoxes) return;

            this.elements.boundingBoxes.innerHTML = '';

            boxes.forEach((box, index) => {
                const boxElement = document.createElement('div');
                boxElement.className = 'bounding-box';
                boxElement.style.left = `${(box.xmin || 0)}%`;
                boxElement.style.top = `${(box.ymin || 0)}%`;
                boxElement.style.width = `${((box.xmax || 0) - (box.xmin || 0))}%`;
                boxElement.style.height = `${((box.ymax || 0) - (box.ymin || 0))}%`;

                // Add label
                const label = document.createElement('div');
                label.className = 'box-label';
                label.textContent = box.label || 'Defect';

                boxElement.appendChild(label);
                this.elements.boundingBoxes.appendChild(boxElement);
            });

            console.log(`Drawn ${boxes.length} bounding boxes`);
        } catch (error) {
            console.error('Draw bounding boxes error:', error);
        }
    }

    showSection(sectionName) {
        try {
            // Hide all sections
            const allSections = document.querySelectorAll('.section');
            allSections.forEach(section => {
                section.style.display = 'none';
                section.classList.remove('active');
            });

            // Show selected section
            const targetSection = document.getElementById(`${sectionName}-section`);
            if (targetSection) {
                targetSection.style.display = 'block';
                targetSection.classList.add('active');
            } else {
                console.warn(`Section not found: ${sectionName}-section`);
                return;
            }

            // Update navigation active state
            document.querySelectorAll('.nav-link').forEach(link => {
                const target = link.getAttribute('onclick') || '';
                if (target.includes(`'${sectionName}'`) || target.includes(`"${sectionName}"`)) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });

            this.currentSection = sectionName;

            if (sectionName === 'history') {
                this.loadHistory();
            }
            if (sectionName === 'analytics') {
                this.loadAnalytics();
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            console.error('Error showing section:', error);
        }
    }

    showToast(title, message, type = 'info') {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const iconClass = type === 'success' ? 'fa-check-circle' :
                         type === 'error' ? 'fa-exclamation-triangle' :
                         type === 'warning' ? 'fa-exclamation-circle' : 'fa-info-circle';

        toast.innerHTML = `
            <div class="toast-content">
                <i class="fas ${iconClass}"></i>
                <div class="toast-text">
                    <div class="toast-title">${title}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;

        // Add to page
        document.body.appendChild(toast);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 5000);
    }

    async loadHistory() {
        try {
            console.log('Loading history...');
            const params = new URLSearchParams();
            if (this.elements.historySearch && this.elements.historySearch.value.trim()) {
                params.append('search', this.elements.historySearch.value.trim());
            }
            if (this.elements.historyStatusFilter && this.elements.historyStatusFilter.value) {
                params.append('status', this.elements.historyStatusFilter.value);
            }
            if (this.elements.historyDateFilter && this.elements.historyDateFilter.value) {
                params.append('month', this.elements.historyDateFilter.value);
            }
            const response = await this.fetchWithTimeout(`/api/history?${params.toString()}`, { method: 'GET' }, 30000);
            const data = await this.parseJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.message || 'Failed to load history');
            }

            const historyList = document.getElementById('history-list');
            const recentActivity = document.getElementById('recent-activity');

            if (historyList) {
                historyList.innerHTML = '';
                if (Array.isArray(data) && data.length > 0) {
                    data.forEach((item, index) => {
                        const card = document.createElement('div');
                        card.className = 'history-card';
                        
                        // Format date
                        const createdDate = new Date(item.created_at);
                        const formattedDate = createdDate.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });

                        // Create status badge color
                        const statusClass = item.status === 'Defected' ? 'status-defected' : 'status-normal';
                        const statusIcon = item.status === 'Defected' ? 'fa-exclamation-circle' : 'fa-check-circle';

                        card.innerHTML = `
                            <div class="history-card-thumbnail">
                                <img src="${item.image_url || ''}" alt="PCB thumbnail" loading="lazy">
                                <div class="status-badge ${statusClass}">
                                    <i class="fas ${statusIcon}"></i>
                                </div>
                            </div>
                            <div class="history-card-content">
                                <div class="card-title">
                                    <h4>${item.defectType || item.status || 'Unknown'}</h4>
                                    <time class="card-date">${formattedDate}</time>
                                </div>
                                <div class="card-details">
                                    <div class="detail-item">
                                        <span class="detail-label">PCB:</span>
                                        <span class="detail-value">${item.pcbType || 'Unknown'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <span class="detail-label">Confidence:</span>
                                        <span class="detail-value">${item.confidence != null ? Math.round(item.confidence) + '%' : 'N/A'}</span>
                                    </div>
                                    ${item.severity ? `
                                    <div class="detail-item">
                                        <span class="detail-label">Severity:</span>
                                        <span class="detail-value severity-${item.severity.toLowerCase()}">${item.severity}</span>
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                        historyList.appendChild(card);
                    });
                } else {
                    historyList.innerHTML = `
                        <div class="history-empty">
                            <i class="fas fa-inbox"></i>
                            <p>No history data available yet.</p>
                            <small>Scan some PCB images to see results here</small>
                        </div>
                    `;
                }
            }

            if (recentActivity) {
                recentActivity.innerHTML = '';
                const historyItems = Array.isArray(data) ? data.slice(0, 5) : [];
                if (historyItems.length > 0) {
                    historyItems.forEach(item => {
                        const activity = document.createElement('div');
                        activity.className = 'activity-item';
                        const createdDate = new Date(item.created_at);
                        const timeAgo = this.getTimeAgo(createdDate);
                        activity.innerHTML = `
                            <div class="activity-icon">
                                <i class="fas ${item.status === 'Defected' ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>
                            </div>
                            <div class="activity-content">
                                <p>${item.defectType || item.status || 'Scan'}</p>
                                <small>${timeAgo}</small>
                            </div>
                        `;
                        recentActivity.appendChild(activity);
                    });
                } else {
                    recentActivity.innerHTML = `
                        <div class="activity-item">
                            <div class="activity-icon">
                                <i class="fas fa-inbox"></i>
                            </div>
                            <div class="activity-content">
                                <p>No recent activity.</p>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('History loading error:', error);
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);
        
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        const weeks = Math.floor(days / 7);
        if (weeks < 4) return `${weeks}w ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }


    initializeApp() {
        // App initialization
        this.showSection('home');
        this.initializeCharts();
        this.loadHistory();
        this.loadAnalytics();
        console.log('UploadManager initialized');
    }

    initializeCharts() {
        if (window.Chart && this.elements.defectTypesChartCanvas) {
            const ctx = this.elements.defectTypesChartCanvas.getContext('2d');
            this.defectChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: ['#4ade80', '#f97316', '#fb7185', '#60a5fa', '#a78bfa', '#facc15'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#cbd5e1' } }
                    }
                }
            });
        }

        if (window.Chart && this.elements.monthlyTrendChartCanvas) {
            const ctx = this.elements.monthlyTrendChartCanvas.getContext('2d');
            this.trendChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [
                        {
                            label: 'Total Inspections',
                            data: [],
                            borderColor: '#38bdf8',
                            backgroundColor: 'rgba(56,189,248,0.2)',
                            fill: true,
                            tension: 0.35
                        },
                        {
                            label: 'Defected Boards',
                            data: [],
                            borderColor: '#fb7185',
                            backgroundColor: 'rgba(251,113,133,0.2)',
                            fill: true,
                            tension: 0.35
                        }
                    ]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { labels: { color: '#cbd5e1' } }
                    },
                    scales: {
                        x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,0.15)' } },
                        y: { beginAtZero: true, ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(148,163,184,0.15)' } }
                    }
                }
            });
        }
    }

    updateCharts(data) {
        if (this.defectChart) {
            const defectLabels = (data.defect_types || []).map(item => item.name);
            const defectValues = (data.defect_types || []).map(item => item.value);
            this.defectChart.data.labels = defectLabels;
            this.defectChart.data.datasets[0].data = defectValues;
            this.defectChart.update();
            if (defectValues.length > 0 && this.elements.defectTypesPlaceholder) {
                this.elements.defectTypesPlaceholder.style.display = 'none';
            }
        }

        if (this.trendChart) {
            const trendLabels = (data.monthly_trend || []).map(item => item.month).reverse();
            const totalData = (data.monthly_trend || []).map(item => item.count).reverse();
            const defectData = (data.monthly_trend || []).map(item => item.defected_count).reverse();
            this.trendChart.data.labels = trendLabels;
            this.trendChart.data.datasets[0].data = totalData;
            this.trendChart.data.datasets[1].data = defectData;
            this.trendChart.update();
            if ((totalData.length > 0 || defectData.length > 0) && this.elements.monthlyTrendPlaceholder) {
                this.elements.monthlyTrendPlaceholder.style.display = 'none';
            }
        }
    }
}

// ===========================================
// LEGACY FUNCTIONS (for backward compatibility)
// ===========================================

let uploadManager;

document.addEventListener('DOMContentLoaded', function() {
    uploadManager = new UploadManager();
});

// Legacy function mappings
function showSection(sectionName) {
    if (uploadManager) uploadManager.showSection(sectionName);
}

function handleNavClick(event, sectionName) {
    event.preventDefault();
    if (uploadManager) uploadManager.showSection(sectionName);
}

function resetUpload() {
    if (uploadManager) {
        uploadManager.clearPreview();
        uploadManager.showSection('upload');
    }
}

function logout() {
    // Logout functionality
    fetch('/logout', { method: 'GET' })
        .then(() => {
            window.location.href = '/login';
        })
        .catch(error => {
            console.error('Logout error:', error);
            window.location.href = '/login';
        });
}

// Toast function for global access
function showToast(title, message, type) {
    if (uploadManager) uploadManager.showToast(title, message, type);
}

function loadHistory() {
    if (uploadManager) {
        uploadManager.loadHistory();
    }
}

function loadAnalytics() {
    if (uploadManager) {
        uploadManager.loadAnalytics();
    }
}

function closeCamera() {
    if (uploadManager) {
        uploadManager.closeCamera();
    }
}

function captureImage() {
    if (uploadManager) {
        uploadManager.captureImage();
    }
}
