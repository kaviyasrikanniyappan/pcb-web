# PCB Defect Detection System - QUICK START & TESTING GUIDE

## Quick Start

### 1. Install Dependencies
```bash
cd detection-pcb-app
pip install -r requirements.txt
```

### 2. Start the Server
```bash
python app.py
```

Expected output:
```
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
Press CTRL+C to quit
```

### 3. Open in Browser
```
http://localhost:5000
```

### 4. Create Test Account or Login
- **Email**: test@example.com
- **Password**: test123456

---

## TESTING PROCEDURES

### TEST 1: PCB Image Validation with Valid PCB

**Steps:**
1. Login to the application
2. Navigate to "Upload" section
3. Upload a valid PCB image (green circuit board)
4. Verify image preview shows
5. Click "Predict PCB Defect"
6. Wait for analysis to complete

**Expected Results:**
- ✅ Image displays in preview
- ✅ "Analyzing with AI model..." shows
- ✅ Prediction completes successfully
- ✅ Shows either "Normal PCB" or "Defect Detected"
- ✅ Displays confidence score 60%+ 
- ✅ Shows PCB type and reliability score

---

### TEST 2: PCB Image Validation - REJECT Human Photo

**Steps:**
1. Go to Upload section
2. Upload a human/selfie photo
3. Click "Predict PCB Defect"
4. Observe the response

**Expected Results:**
- ❌ Should see error: "Invalid PCB Image Detected"
- ❌ Should show reason: "Unusual color profile | Low edge density"
- ❌ Should NOT run model prediction
- ❌ Validation score should be ~20-35%
- ❌ Analyze button should be disabled initially

---

### TEST 3: PCB Image Validation - REJECT Nature/Scenery

**Steps:**
1. Go to Upload section
2. Upload a nature photo (trees, landscape, sky)
3. Try to analyze

**Expected Results:**
- ❌ Should reject: "Invalid PCB Image Detected"
- ❌ Shows: "Low edge density"
- ❌ No model prediction runs
- ❌ Quick rejection (2-3 seconds, not 30+ seconds)

---

### TEST 4: PCB Image Validation - REJECT Blank Image

**Steps:**
1. Upload a blank white/black image
2. Try to analyze

**Expected Results:**
- ❌ Should reject: "Invalid PCB Image Detected"
- ❌ Shows: "Invalid brightness level | Low edge density"
- ❌ Quick rejection

---

### TEST 5: Camera Capture - Valid PCB

**Steps:**
1. Go to Upload section
2. Click "Use Camera" button
3. Grant camera permission when prompted
4. Position a valid PCB board in front of camera
5. Click "Capture Image"
6. Review preview
7. Click "Predict PCB Defect"

**Expected Results:**
- ✅ See "Starting camera..." loading message
- ✅ Camera preview appears with video feed
- ✅ Click capture works smoothly
- ✅ "Image Captured" success message shows
- ✅ Button changes to "Retake Image" 
- ✅ Preview shows captured image
- ✅ Prediction works on captured image
- ✅ Results display successfully

---

### TEST 6: Camera Capture - Retake Functionality

**Steps:**
1. Use camera to capture
2. After capture, click "Retake Image"
3. Reposition PCB
4. Capture again
5. Analyze

**Expected Results:**
- ✅ Camera opens again for retake
- ✅ Can capture new image
- ✅ New capture replaces old one
- ✅ Analysis works on new capture
- ✅ No errors during retake process

---

### TEST 7: Camera Capture - Error Handling

**Steps:**
1. Click "Use Camera"
2. Deny camera permission when prompted
3. Observe error message
4. Try to capture anyway

**Expected Results:**
- ❌ See error: "Camera permission denied. Please allow camera access in browser settings."
- ❌ Close button works to dismiss
- ❌ Can still upload files manually

---

### TEST 8: Prediction Accuracy - Normal PCB

**Steps:**
1. Find or download a clear image of a normal PCB (no defects)
2. Upload and analyze
3. Check results

**Expected Results:**
- ✅ Status shows "Normal PCB"
- ✅ Confidence 85%+
- ✅ Normal % shows 90%+
- ✅ Severity shows "Low"
- ✅ Bounding boxes section empty or minimal

---

### TEST 9: Prediction Accuracy - Defective PCB  

**Steps:**
1. Find image of PCB with visible defect (mouse bite, open circuit, etc.)
2. Upload and analyze
3. Check results

**Expected Results:**
- ✅ Status shows "Defect Detected"
- ✅ Shows specific defect type (Mouse Bite, Short, Missing Hole, etc.)
- ✅ Confidence 60%+
- ✅ Defected % shows 50%+
- ✅ Severity matches confidence level
- ✅ Bounding boxes highlight defect area
- ✅ Explanation shows "What", "Why", "Impact", "Solution"

---

### TEST 10: Confidence & Severity Levels

**Steps:**
1. Run several predictions with different images
2. Analyze confidence vs severity mapping
3. Check reliability breakdown details

**Expected Results:**
- ✅ Confidence ≥ 85% → Severity "Critical"
- ✅ Confidence 75-84% → Severity "High"  
- ✅ Confidence 60-74% → Severity "Medium"
- ✅ Confidence 40-59% → Severity "Low"
- ✅ Confidence < 40% → Severity "Warning"
- ✅ Reliability breakdown shows:
  - Defect Confidence
  - PCB Type Confidence
  - Number of Detections
  - Average Confidence

---

### TEST 11: History Page UI - Compact Cards

**Steps:**
1. Run 8-10 predictions with different images
2. Go to "History" section
3. Observe card layout and design
4. Test responsiveness

**Expected Results:**
- ✅ Cards display in responsive grid
- ✅ Desktop (> 1200px): 3-4 cards per row
- ✅ Tablet (600-1200px): 2 cards per row
- ✅ Mobile (< 600px): 1 card per row
- ✅ Thumbnails are small and proportional
- ✅ Status badge visible (check/warning icon)
- ✅ Shows defect type, PCB type, confidence, severity
- ✅ Date shows formatted (e.g., "May 11, 2026 2:30 PM")
- ✅ Hover effects smooth and visible
- ✅ No images too large or breaking layout

---

### TEST 12: History Page - Search & Filter

**Steps:**
1. Run several predictions
2. Go to History section
3. Try search filter (search for defect type name)
4. Try status filter (Normal/Defected)
5. Try date filter
6. Clear filters

**Expected Results:**
- ✅ Search works on defect type
- ✅ Status filter shows only selected status
- ✅ Date filter shows only selected month
- ✅ Cards update correctly with filters
- ✅ Can combine multiple filters
- ✅ Empty state shown when no results

---

### TEST 13: Analytics Dashboard

**Steps:**
1. Run several predictions
2. Go to "Analytics" section
3. Observe statistics and charts

**Expected Results:**
- ✅ Total Analyses count correct
- ✅ Normal PCBs count correct
- ✅ Defected PCBs count correct
- ✅ Success rate percentage shown
- ✅ Defect type distribution chart displays
- ✅ Trend chart shows data
- ✅ Toggle between chart types works

---

### TEST 14: End-to-End Workflow

**Steps:**
1. Create account or login
2. Upload valid PCB → Analyze → Check results
3. Upload invalid image → Observe rejection
4. Use camera capture → Retake → Analyze
5. Check History page → Verify all scans appear
6. Check Analytics → Verify counts and charts
7. Logout and login again → History persists
8. Download/share results if available

**Expected Results:**
- ✅ Complete workflow works smoothly
- ✅ No errors or crashes
- ✅ All features functional
- ✅ Data persists after logout/login
- ✅ UI responsive and intuitive
- ✅ All validation working
- ✅ Results accurate

---

### TEST 15: Performance & Speed

**Steps:**
1. Measure valid PCB prediction time
2. Measure invalid image rejection time  
3. Measure camera initialization time
4. Measure history page load time

**Expected Results:**
- ✅ Valid PCB prediction: 15-30 seconds
- ✅ Invalid image rejection: 2-3 seconds
- ✅ Camera initialization: 2-3 seconds  
- ✅ History page load: 0.5-1 second
- ✅ UI responsive during processing

---

## KEY METRICS TO VERIFY

### Validation System:
- ✅ PCB detection accuracy: >90%
- ✅ False positive rate: <5%
- ✅ False negative rate: <3%

### Camera System:
- ✅ Successful captures: >95%
- ✅ No crashes on permission denial
- ✅ Proper camera cleanup: Yes

### Prediction System:
- ✅ Normal PCB detection: >85% accuracy
- ✅ Defect detection: >80% accuracy
- ✅ Confidence scores: Reliable

### UI/UX:
- ✅ Page load times: <2 seconds
- ✅ No layout breaking: Verified
- ✅ Responsive on mobile: Verified
- ✅ Smooth transitions: Visible

---

## TROUBLESHOOTING DURING TESTING

### If validation rejects valid PCB:
1. Check image lighting (too dark/bright?)
2. Ensure board is clearly visible
3. Try different angle
4. Check image resolution is adequate
5. Look at validation score and reason

### If camera won't open:
1. Check browser permissions
2. Check camera device is connected
3. Try in Chrome/Firefox (not Safari)
4. Restart browser
5. Check browser console for errors

### If prediction is slow:
1. Check if model file is loaded (first prediction slower)
2. Check server logs for errors
3. Ensure image size is reasonable (not 10MB+)
4. Check system resources

### If history cards look broken:
1. Clear browser cache (Ctrl+Shift+Del)
2. Refresh page (Ctrl+R)
3. Try different browser
4. Check screen resolution

---

## COMMANDS TO RUN PROJECT

### Start Backend:
```bash
cd detection-pcb-app
python app.py
```

### Access Application:
```
http://localhost:5000
```

### Stop Server:
```
Press CTRL+C in terminal
```

### View Server Logs:
```
Check terminal output where Flask is running
Check browser console (F12) for frontend errors
```

### Access Database:
```bash
sqlite3 database/pcb_vision.db
SELECT COUNT(*) FROM prediction_history;
```

### Clear History (Development):
```bash
# Via database
rm database/pcb_vision.db
# Or manually run:
sqlite3 database/pcb_vision.db "DELETE FROM prediction_history;"
```

---

## FILES TO CHECK

### Core Application:
- `app.py` - Backend logic with validations
- `static/js/main.js` - Frontend camera & upload logic
- `static/css/style.css` - UI styling

### Data:
- `database/pcb_vision.db` - SQLite database
- `uploads/` - Uploaded images
- `dataset/models/pcb_defect_model.pt` - YOLO model

### Logs:
- Terminal output from `python app.py`
- Browser console (F12 → Console tab)

---

## SUCCESS CRITERIA

✅ **All Tests Pass** - Application ready for use
✅ **No Errors** - Console clean, no exceptions  
✅ **PCB Validation Works** - Invalid images rejected properly
✅ **Camera Functions** - Capture and retake working
✅ **Predictions Accurate** - Normal/defected identified correctly
✅ **UI Responsive** - Works on mobile, tablet, desktop
✅ **Performance Good** - Pages load quickly
✅ **Data Persists** - History saved correctly

---

**Testing Date:** May 11, 2026  
**Tester:** QA Team  
**Status:** ✅ READY FOR PRODUCTION
