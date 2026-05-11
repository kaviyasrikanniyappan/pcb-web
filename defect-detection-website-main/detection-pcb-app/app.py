from flask import Flask, request, jsonify, render_template, redirect, url_for, session, send_from_directory
from flask_cors import CORS
from functools import wraps
from uuid import uuid4
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
import os
import json
import sqlite3
import base64
import datetime
import secrets
import bcrypt
import numpy as np
import cv2
from PIL import Image
import io
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

app = Flask(__name__)
CORS(app)
app.secret_key = secrets.token_hex(32)
app.permanent_session_lifetime = datetime.timedelta(days=30)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
app.logger.info(f'Uploads folder ready at: {app.config["UPLOAD_FOLDER"]}')

# Database setup
def get_db():
    db = sqlite3.connect('database/pcb_vision.db')
    db.row_factory = sqlite3.Row
    return db

def init_db():
    os.makedirs('database', exist_ok=True)
    db = get_db()
    db.executescript('''
        CREATE TABLE IF NOT EXISTS admin_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT UNIQUE,
            password TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY,
            notifications BOOLEAN DEFAULT 1,
            security BOOLEAN DEFAULT 1,
            data_management BOOLEAN DEFAULT 1,
            sensitivity INTEGER DEFAULT 50,
            auto_save BOOLEAN DEFAULT 0,
            model_type TEXT DEFAULT 'gemini-3-flash'
        );

        CREATE TABLE IF NOT EXISTS prediction_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            image_filename TEXT NOT NULL,
            image_path TEXT NOT NULL,
            original_filename TEXT,
            status TEXT NOT NULL,
            defect_type TEXT,
            confidence REAL,
            normal_percentage REAL,
            defected_percentage REAL,
            severity TEXT,
            explanation TEXT,
            suggested_solution TEXT,
            bounding_boxes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            image_data TEXT,
            result_json TEXT,
            status TEXT,
            defect_type TEXT,
            confidence REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS support_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT,
            subject TEXT,
            message TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ''')

    # Initialize default data
    db.execute("INSERT OR IGNORE INTO settings (id) VALUES (1)")
    db.execute("INSERT OR IGNORE INTO admin_users (username, password) VALUES (?, ?)", ("admin", "admin123"))
    db.commit()
    db.close()

# Initialize database on startup
init_db()

# Utility helpers

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_uploaded_image(file_storage=None, base64_image=None, mime_type='image/jpeg'):
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

    if file_storage is not None and file_storage.filename:
        # Validate file extension
        if not allowed_file(file_storage.filename):
            raise ValueError('Unsupported file type')

        # Secure the filename
        original_filename = secure_filename(file_storage.filename)
        ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'jpg'
        filename = f"{uuid4().hex}_{original_filename}"

        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        # Save the file
        file_storage.save(file_path)

        # Validate it's a valid image
        try:
            with Image.open(file_path) as img:
                img.verify()  # Verify it's a valid image
        except Exception:
            os.remove(file_path)  # Remove invalid file
            raise ValueError('Invalid image file')

        return filename

    if base64_image:
        if mime_type and '/' in mime_type:
            ext = mime_type.split('/')[-1].lower()
            ext = 'jpg' if ext in ['jpeg', 'jpg'] else 'png'
        else:
            ext = 'jpg'

        filename = f"pcb_{uuid4().hex}.{ext}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        with open(file_path, 'wb') as f:
            f.write(base64.b64decode(base64_image))
        return filename

    raise ValueError('No image provided to save')


def get_saved_image_path(filename):
    if not filename:
        return None

    safe_filename = secure_filename(filename)
    image_path = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
    return image_path if os.path.exists(image_path) else None


def build_api_response(success, message='', result=None):
    payload = {
        'success': bool(success),
        'message': message or ('Success' if success else 'Failure'),
        'result': result or {}
    }
    return jsonify(payload)


# Proper PCB defect class mapping from YOLO model
PCB_DEFECT_CLASSES = {
    0: "Mouse Bite",
    1: "Spur",
    2: "Missing Hole",
    3: "Short",
    4: "Open Circuit",
    5: "Spurious Copper"
}

PCB_DEFECT_LABELS = {
    'mouse_bite': 'Mouse Bite',
    'spur': 'Spur',
    'missing_hole': 'Missing Hole',
    'short': 'Short',
    'open_circuit': 'Open Circuit',
    'spurious_copper': 'Spurious Copper'
}

# Reverse mapping for easy lookup
CLASS_NAME_TO_INDEX = {v: k for k, v in PCB_DEFECT_CLASSES.items()}

MIN_DETECTION_CONFIDENCE = 0.25

# Defect details mapping
DEFECT_DETAILS = {
    "Mouse Bite": {
        "what": "Edge of board has an incomplete or missing board profile cut-out (mouse bite).",
        "why": "Improper routing or tool path error during depanelization.",
        "impact": "Causes assembly fit issues and may cause fixture misalignment.",
        "solution": "Rework panelization process to ensure edge tabs are properly separated; reject defective board if machining error introduced mechanical stress."
    },
    "Spur": {
        "what": "Excess copper protrusion that creates a potential leak path.",
        "why": "Leftover from over-etching or poor photoresist removal.",
        "impact": "Can lead to signal interference or inadvertent shorts.",
        "solution": "Trim spur with micro tooling, then perform continuity and isolation check."
    },
    "Missing Hole": {
        "what": "A required plated through-hole or via is absent or partially drilled.",
        "why": "Drilling process failure, bad tooling, or layout inaccuracies.",
        "impact": "Reduces layer-to-layer signal integrity and may break required traces in multilayer boards.",
        "solution": "Confirm board fabrication data and reject the board if hole is absent; use an alternative from a verified lot and update PCB manufacturer."
    },
    "Short": {
        "what": "Unintended electrical connection between two nets or nodes.",
        "why": "Solder bridging, conductive debris, or layout spacing violation.",
        "impact": "Can cause high current draw, component damage, or system failure.",
        "solution": "Remove bridge using solder wick; clean the board and retest under low voltage."
    },
    "Open Circuit": {
        "what": "A trace or connection is interrupted, preventing current flow.",
        "why": "Due to broken copper, poor etch, or accidental scratching during handling.",
        "impact": "Component or circuit section becomes non-functional.",
        "solution": "Repair with wire jumper or re-route trace; inspect rest of board for similar open points."
    },
    "Spurious Copper": {
        "what": "Unintended copper features from deposition or etching defects.",
        "why": "Manufacturing residue from process chemicals or mask misalignment.",
        "impact": "Risk of leakage current or short circuits under stress.",
        "solution": "Clean and inspect board thoroughly; if excess copper is widespread, reject the batch."
    }
}

def normalize_defect_label(raw_label):
    if raw_label is None:
        return None
    clean_label = str(raw_label).strip().lower().replace(' ', '_')
    return PCB_DEFECT_LABELS.get(clean_label, raw_label.title().replace('_', ' '))


def get_defect_detail(defect_type):
    return DEFECT_DETAILS.get(defect_type, {
        "what": "An unspecified defect has been detected.",
        "why": "Potential material or process deviation in manufacturing.",
        "impact": "Could affect electrical function depending on location and severity.",
        "solution": "Perform manual inspection and repair with standard PCB rework procedures."
    })

def save_history_record(user_id, image_filename, original_filename, image_path, prediction_result):
    """Save prediction result to database with proper schema"""
    db = get_db()
    try:
        cursor = db.execute('''
            INSERT INTO prediction_history 
            (user_id, image_filename, image_path, original_filename, status, defect_type, 
             confidence, normal_percentage, defected_percentage, severity, explanation, 
             suggested_solution, bounding_boxes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            user_id,
            image_filename,
            image_path,
            original_filename,
            prediction_result.get('status'),
            prediction_result.get('defectType'),
            prediction_result.get('confidence'),
            prediction_result.get('normalPercentage'),
            prediction_result.get('defectedPercentage'),
            prediction_result.get('severity'),
            prediction_result.get('explanation'),
            prediction_result.get('suggestedSolution'),
            json.dumps(prediction_result.get('boundingBoxes', []))
        ))
        db.commit()
        return cursor.lastrowid
    finally:
        db.close()

def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return build_api_response(False, 'Not authenticated', {}), 401
        return f(*args, **kwargs)
    return wrapper

DETECTION_MODEL = None
DETECTION_MODEL_PATH = None


def find_local_model_path():
    """Find the PCB defect model in dataset/models directory"""
    model_dir = os.path.join(os.path.dirname(__file__), 'dataset', 'models')
    
    # Prioritize .pt files
    if os.path.exists(os.path.join(model_dir, 'pcb_defect_model.pt')):
        return os.path.join(model_dir, 'pcb_defect_model.pt')
    
    candidates = ['pcb_defect_model.onnx', 'pcb_defect_model.bin', 'pcb_defect_model.h5']

    for candidate in candidates:
        full_path = os.path.join(model_dir, candidate)
        if os.path.exists(full_path):
            return full_path

    if os.path.exists(model_dir):
        files = [f for f in os.listdir(model_dir) if f.endswith(('.pt', '.onnx', '.bin', '.h5'))]
        if files:
            return os.path.join(model_dir, files[0])

    return None


def load_detection_model():
    """Load YOLO model for PCB defect detection"""
    global DETECTION_MODEL, DETECTION_MODEL_PATH, YOLO
    if DETECTION_MODEL is not None:
        return DETECTION_MODEL

    model_path = find_local_model_path()
    if not model_path:
        app.logger.error('No model found in dataset/models directory')
        return None

    if YOLO is None:
        try:
            from ultralytics import YOLO as YOLOClass
            YOLO = YOLOClass
            app.logger.info('Dynamically imported ultralytics.YOLO')
        except ImportError as e:
            app.logger.error('Ultralytics YOLO is not installed or unavailable', exc_info=True)
            return None

    try:
        app.logger.info(f'Loading model from: {model_path}')
        DETECTION_MODEL = YOLO(model_path)
        DETECTION_MODEL_PATH = model_path
        app.logger.info(f'Model loaded successfully. Classes: {DETECTION_MODEL.names}')
        return DETECTION_MODEL
    except Exception as e:
        app.logger.error(f'Error loading detection model: {e}', exc_info=True)
        DETECTION_MODEL = None
        return None


def validate_pcb_image(image_path):
    """
    Validate if image is actually a PCB before running prediction.
    Uses multiple feature detection methods to classify PCB images.
    Returns: (is_pcb: bool, confidence: float, reason: str)
    """
    try:
        image = cv2.imread(image_path)
        if image is None:
            return False, 0.0, "Invalid image file"
        
        # Check image dimensions - PCB images should have reasonable dimensions
        height, width = image.shape[:2]
        if height < 100 or width < 100 or height > 10000 or width > 10000:
            return False, 0.0, "Invalid image dimensions"
        
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blurred, 50, 150)

        # Color analysis
        h, s, v = cv2.split(hsv)
        mean_saturation = np.mean(s) / 255.0
        mean_value = np.mean(v) / 255.0
        green_mask = cv2.inRange(hsv, (35, 40, 40), (85, 255, 255))
        green_mask = cv2.morphologyEx(green_mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
        green_ratio = np.count_nonzero(green_mask) / float(height * width)

        # Edge and structure analysis
        edge_density = np.count_nonzero(edges) / float(height * width)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        meaningful_contours = sum(1 for c in contours if cv2.contourArea(c) > 150)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        texture_variance = np.var(laplacian)

        # Board shape detection
        board_contours = [c for c in contours if cv2.contourArea(c) > (0.02 * height * width)]
        max_contour_area = max((cv2.contourArea(c) for c in board_contours), default=0)
        board_area_ratio = max_contour_area / float(height * width) if height * width else 0
        board_shape_score = 0
        if board_area_ratio > 0.15:
            board_shape_score = 25
            reasons = ["Large board-like region detected"]
        elif board_area_ratio > 0.06:
            board_shape_score = 12
            reasons = ["Partial board region detected"]
        else:
            reasons = ["No large board region detected"]

        # Multi-factor validation scoring
        pcb_score = 0.0

        # Factor 1: PCB color pattern
        if green_ratio >= 0.04:
            green_score = min(40, green_ratio * 100)
            pcb_score += green_score
            reasons.append("PCB color profile detected")
        elif 0.08 < mean_saturation < 0.6:
            pcb_score += 15
            reasons.append("Moderate PCB-like saturation")
        else:
            reasons.append("Non-standard PCB color")

        # Factor 2: Edge/circuit trace density
        if 0.007 < edge_density < 0.16:
            edge_score = min(35, edge_density * 150)
            pcb_score += edge_score
            reasons.append("Circuitry texture detected")
        elif edge_density >= 0.16:
            reasons.append("High edge density suggests noise or text")
        else:
            reasons.append("Low pattern density")

        # Factor 3: Board shape and contour
        pcb_score += board_shape_score
        if board_shape_score > 0:
            reasons.append("Board shape features detected")

        # Factor 4: Contours/components
        if meaningful_contours >= 8:
            contour_score = min(15, meaningful_contours * 0.8)
            pcb_score += contour_score
            reasons.append(f"Component and trace features found ({meaningful_contours})")
        else:
            reasons.append("Limited component structure detected")

        # Factor 5: Texture complexity
        if texture_variance > 80:
            pcb_score += 7
            reasons.append("High texture complexity present")

        # Brightness and aspect ratio limitations
        brightness = np.mean(gray) / 255.0
        if brightness < 0.08 or brightness > 0.95:
            pcb_score = max(0, pcb_score - 15)
            reasons.append("Invalid brightness range")

        aspect_ratio = width / float(height)
        if aspect_ratio < 0.25 or aspect_ratio > 4.0:
            pcb_score = max(0, pcb_score - 10)
            reasons.append("Unusual image aspect ratio")

        confidence = min(100.0, pcb_score)
        is_pcb = confidence >= 50 or (confidence >= 43 and green_ratio >= 0.03 and edge_density >= 0.008)
        
        app.logger.info(f"PCB validation: score={confidence:.1f}, is_pcb={is_pcb}, reasons={reasons}")
        
        return is_pcb, confidence, " | ".join(reasons)
        
    except Exception as e:
        app.logger.error(f'PCB validation error: {e}', exc_info=True)
        return False, 0.0, f"Validation error: {str(e)}"


def preprocess_image(image_path):
    """Preprocess PCB image for model prediction with enhanced techniques"""
    image = cv2.imread(image_path)
    if image is None:
        raise ValueError("Could not read image file")

    height, width = image.shape[:2]

    # Noise reduction while preserving edge features
    denoised = cv2.bilateralFilter(image, 9, 75, 75)

    # Contrast enhancement in LAB color space
    lab = cv2.cvtColor(denoised.astype(np.uint8), cv2.COLOR_BGR2LAB)
    l_channel, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_channel = clahe.apply(l_channel)
    enhanced_lab = cv2.merge((l_channel, a, b))
    enhanced_bgr = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)

    # Maintain original aspect ratio while resizing to the model input size
    max_dim = max(height, width)
    scale = 640.0 / max_dim
    new_width = int(width * scale)
    new_height = int(height * scale)
    resized = cv2.resize(enhanced_bgr, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)

    top = (640 - new_height) // 2
    bottom = 640 - new_height - top
    left = (640 - new_width) // 2
    right = 640 - new_width - left
    padded = cv2.copyMakeBorder(resized, top, bottom, left, right,
                                cv2.BORDER_CONSTANT, value=(114, 114, 114))

    return image, padded, scale, (top, bottom, left, right)


def infer_pcb_type(image):
    """Infer PCB type from image features when a dedicated PCB type model is unavailable."""
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    _, s, v = cv2.split(hsv)
    mean_saturation = float(np.mean(s) / 255.0)
    mean_value = float(np.mean(v) / 255.0)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 80, 160)
    edge_density = float(np.count_nonzero(edges)) / gray.size

    height, width = gray.shape[:2]
    aspect_ratio = width / height if height else 1.0

    if aspect_ratio > 2.0 or aspect_ratio < 0.6:
        pcb_type = 'Flexible PCB'
        confidence = 70 + min(20, int((abs(aspect_ratio - 1.0) - 0.4) * 40))
    elif mean_saturation < 0.18 and mean_value > 0.75:
        pcb_type = 'Single-layer PCB'
        confidence = 70 + min(20, int((0.25 - mean_saturation) * 100))
    elif edge_density > 0.022 or mean_saturation > 0.35:
        pcb_type = 'Multilayer PCB'
        confidence = 72 + min(22, int(edge_density * 100))
    elif edge_density > 0.01:
        pcb_type = 'Double-layer PCB'
        confidence = 65 + min(20, int(edge_density * 80))
    else:
        pcb_type = 'Rigid PCB'
        confidence = 60 + min(30, int((1.0 - abs(0.45 - mean_value)) * 20))

    confidence = max(40, min(98, round(confidence, 2)))
    return pcb_type, confidence


def run_model_prediction(file_path):
    """Run YOLO model prediction on PCB image and return structured result"""
    try:
        # Preprocess image
        original_image, processed_image, scale, padding = preprocess_image(file_path)
        
        # Load model
        model = load_detection_model()
        if model is None:
            raise Exception('YOLO model not available - cannot run detection')
        
        # Run prediction
        results = model.predict(processed_image, conf=0.25, imgsz=640, verbose=False)
        
        boxes = []
        if results and len(results) > 0:
            result = results[0]
            if hasattr(result, 'boxes') and result.boxes is not None:
                xyxy = result.boxes.xyxy.cpu().numpy()
                confs = result.boxes.conf.cpu().numpy()
                classes = result.boxes.cls.cpu().numpy()
                model_names = getattr(model, 'names', {}) or {}

                orig_height, orig_width = original_image.shape[:2]
                top_pad, bottom_pad, left_pad, right_pad = padding

                for idx in range(len(xyxy)):
                    x1, y1, x2, y2 = xyxy[idx]
                    x1 = max(0, x1 - left_pad)
                    y1 = max(0, y1 - top_pad)
                    x2 = min(640 - left_pad - right_pad, x2 - left_pad)
                    y2 = min(640 - top_pad - bottom_pad, y2 - top_pad)

                    x1_orig = x1 / scale
                    y1_orig = y1 / scale
                    x2_orig = x2 / scale
                    y2_orig = y2 / scale

                    x1_orig = max(0, min(orig_width, x1_orig))
                    y1_orig = max(0, min(orig_height, y1_orig))
                    x2_orig = max(0, min(orig_width, x2_orig))
                    y2_orig = max(0, min(orig_height, y2_orig))

                    confidence = float(confs[idx])
                    class_idx = int(classes[idx])
                    raw_label = model_names.get(class_idx, f"Unknown_{class_idx}")
                    class_name = normalize_defect_label(raw_label)

                    if confidence < MIN_DETECTION_CONFIDENCE:
                        continue

                    boxes.append({
                        'xmin': round((x1_orig / orig_width) * 100, 2),
                        'ymin': round((y1_orig / orig_height) * 100, 2),
                        'xmax': round((x2_orig / orig_width) * 100, 2),
                        'ymax': round((y2_orig / orig_height) * 100, 2),
                        'label': class_name,
                        'confidence': round(confidence * 100, 2)
                    })
        
        # Determine overall status
        if len(boxes) == 0:
            pcb_type, pcb_confidence = infer_pcb_type(original_image)
            reliability_score = round((95.0 + pcb_confidence) / 2.0, 2)
            return {
                'status': 'Normal',
                'defectType': None,
                'confidence': 95.0,
                'normalPercentage': 95.0,
                'defectedPercentage': 5.0,
                'severity': 'Low',
                'pcbType': pcb_type,
                'pcbTypeConfidence': pcb_confidence,
                'reliabilityScore': reliability_score,
                'reliabilityBreakdown': {
                    'defectConfidence': 95.0,
                    'pcbTypeConfidence': pcb_confidence
                },
                'explanation': 'No defects detected. PCB appears within normal manufacturing tolerance.',
                'suggestedSolution': 'PCB is ready for assembly.',
                'boundingBoxes': []
            }

        boxes.sort(key=lambda x: x['confidence'], reverse=True)
        primary_box = boxes[0]
        defect_type = primary_box['label']
        confidence = primary_box['confidence']

        # Use the top 3 detections to stabilize confidence scoring
        top_confidences = [b['confidence'] for b in boxes[:3]]
        average_confidence = float(np.mean(top_confidences)) if top_confidences else confidence
        num_detections = len(boxes)
        detection_boost = min(8, num_detections)
        final_confidence = min(100.0, average_confidence + detection_boost * 1.2)

        defect_pct = round(final_confidence, 2)
        normal_pct = round(max(0.0, 100.0 - final_confidence), 2)

        if final_confidence >= 90:
            severity = 'Critical'
        elif final_confidence >= 75:
            severity = 'High'
        elif final_confidence >= 55:
            severity = 'Medium'
        else:
            severity = 'Low'

        detail = get_defect_detail(defect_type)
        explanation = f'Defect detected: {defect_type}. {detail["what"]} Why: {detail["why"]} Impact: {detail["impact"]}'
        suggested_solution = f'{detail["solution"]} Severity assessment: {severity}.'

        pcb_type, pcb_confidence = infer_pcb_type(original_image)
        reliability_score = round((final_confidence + pcb_confidence) / 2.0, 2)

        return {
            'status': 'Defected',
            'defectType': defect_type,
            'confidence': round(final_confidence, 2),
            'normalPercentage': normal_pct,
            'defectedPercentage': defect_pct,
            'severity': severity,
            'pcbType': pcb_type,
            'pcbTypeConfidence': pcb_confidence,
            'reliabilityScore': reliability_score,
            'reliabilityBreakdown': {
                'defectConfidence': round(final_confidence, 2),
                'pcbTypeConfidence': pcb_confidence,
                'numDetections': num_detections,
                'averageConfidence': round(average_confidence, 2)
            },
            'explanation': explanation,
            'explanation_what': detail["what"],
            'explanation_why': detail["why"],
            'explanation_impact': detail["impact"],
            'suggestedSolution': suggested_solution,
            'boundingBoxes': boxes
        }
        
    except Exception as e:
        app.logger.error(f'Model prediction error: {e}', exc_info=True)
        raise

# Routes
@app.route('/')
def index():
    if 'user_id' in session:
        return render_template('index.html')
    return redirect(url_for('login'))

@app.route('/dashboard')
def dashboard():
    if 'user_id' in session:
        return render_template('index.html')
    return redirect(url_for('login'))

@app.route('/login')
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('login.html')

@app.route('/register')
def register():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template('register.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/api/health')
def health():
    return build_api_response(True, 'PCB Vision Backend is running', {'status': 'ok'})

@app.route('/api/validate-pcb', methods=['POST'])
@login_required
def api_validate_pcb():
    """Validate if an uploaded image is a PCB before running prediction"""
    try:
        filename = None
        
        # Get filename from request
        if 'filename' in request.form:
            filename = request.form.get('filename')
        elif 'filename' in request.get_json(silent=True) or {}:
            filename = request.get_json(silent=True).get('filename')
        
        if not filename:
            return build_api_response(False, 'Filename is required.', {}), 400
        
        image_path = get_saved_image_path(filename)
        if not image_path:
            return build_api_response(False, 'Image not found.', {}), 404
        
        # Validate PCB image
        is_pcb, confidence, reason = validate_pcb_image(image_path)
        
        return build_api_response(True, 'PCB validation completed.', {
            'is_valid_pcb': is_pcb,
            'confidence': confidence,
            'reason': reason
        }), 200
        
    except Exception as e:
        app.logger.error(f'PCB validation error: {e}', exc_info=True)
        return build_api_response(False, f'Validation failed: {str(e)}', {}), 500

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not all([name, email, password]):
        return jsonify({'success': False, 'message': 'Name, email and password are required'}), 400

    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters long'}), 400

    db = get_db()
    try:
        existing = db.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
        if existing:
            return jsonify({'success': False, 'message': 'Email already registered'}), 400

        hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        db.execute('INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                  (name, email, hashed_password.decode('utf-8')))
        db.commit()

        user = db.execute('SELECT id, name, email FROM users WHERE email = ?', (email,)).fetchone()

        # Set session
        session['user_id'] = user['id']
        session['user_name'] = user['name']
        session['user_email'] = user['email']

        return build_api_response(True, 'Registration successful.', {'user': dict(user)}), 200
    except Exception as e:
        app.logger.error(f'Register error: {e}', exc_info=True)
        return build_api_response(False, 'Registration failed', {}), 500
    finally:
        db.close()

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')

    if not all([email, password]):
        return jsonify({'success': False, 'message': 'Email and password are required'}), 400

    db = get_db()
    try:
        # First try regular users table
        user_record = db.execute('SELECT id, name, email, password FROM users WHERE email = ?',
                                (email,)).fetchone()

        # If not found in users, try admin_users (for backward compatibility)
        if not user_record:
            admin_record = db.execute('SELECT id, username, password FROM admin_users WHERE username = ?',
                                     (email,)).fetchone()
            if admin_record:
                # Convert admin record to user format (plain text password for admin)
                if admin_record['password'] == password:  # Plain text check for admin
                    user_record = {
                        'id': admin_record['id'],
                        'name': admin_record['username'],
                        'email': admin_record['username'],
                        'password': admin_record['password'],
                        'is_admin': True
                    }
                else:
                    return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

        if not user_record:
            return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

        # For regular users, check bcrypt password
        if 'password' in user_record and not user_record.get('is_admin', False):
            if not bcrypt.checkpw(password.encode('utf-8'), user_record['password'].encode('utf-8')):
                return jsonify({'success': False, 'message': 'Invalid email or password'}), 401

        # Set session
        session['user_id'] = user_record['id']
        session['user_name'] = user_record['name']
        session['user_email'] = user_record['email']
        session.permanent = bool(data.get('remember'))

        user = {'id': user_record['id'], 'name': user_record['name'], 'email': user_record['email']}

        return build_api_response(True, 'Login successful.', {'user': user, 'redirect': '/'}), 200
    except Exception as e:
        app.logger.error(f'Login error: {e}', exc_info=True)
        return build_api_response(False, 'Login failed', {}), 500
    finally:
        db.close()

@app.route('/api/auth/me', methods=['GET'])
def api_me():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    user = {
        'id': session['user_id'],
        'name': session['user_name'],
        'email': session['user_email']
    }
    return build_api_response(True, 'Authenticated user fetched.', {'user': user}), 200

@app.route('/api/upload', methods=['POST'])
@login_required
def api_upload():
    try:
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file part in the request.'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected for upload.'}), 400

        # Check file extension
        if not allowed_file(file.filename):
            return jsonify({'success': False, 'message': 'Unsupported file type. Only JPG, JPEG, and PNG are allowed.'}), 400

        # Save the uploaded image
        filename = save_uploaded_image(file_storage=file)

        # Generate image URL
        image_url = url_for('uploaded_file', filename=filename, _external=True)
        app.logger.info(f'Upload success: {filename} saved at {image_url}')

        return build_api_response(True, 'Upload completed successfully.', {
            'filename': filename,
            'image_url': image_url
        }), 200

    except RequestEntityTooLarge:
        return build_api_response(False, 'File too large. Maximum file size is 16MB.', {}), 413
    except ValueError as e:
        app.logger.warning(f'Upload validation error: {e}')
        return build_api_response(False, str(e), {}), 400
    except Exception as e:
        app.logger.error(f'Unexpected upload error: {e}', exc_info=True)
        return build_api_response(False, 'An unexpected error occurred during upload.', {}), 500

@app.route('/api/predict', methods=['POST'])
@login_required
def api_predict():
    try:
        uploaded_file = request.files.get('file')
        filename = None
        original_filename = None
        image_path = None

        if uploaded_file and uploaded_file.filename:
            if not allowed_file(uploaded_file.filename):
                return build_api_response(False, 'Unsupported file type.', {}), 400

            filename = save_uploaded_image(file_storage=uploaded_file)
            original_filename = uploaded_file.filename
            image_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        else:
            filename = None
            original_filename = None
            form_data = request.form or {}
            filename = form_data.get('filename') or form_data.get('uploaded_filename')
            original_filename = form_data.get('original_filename') or filename

            if not filename:
                json_data = request.get_json(silent=True) or {}
                filename = json_data.get('filename') or json_data.get('uploaded_filename')
                original_filename = json_data.get('original_filename') or filename

            image_path = get_saved_image_path(filename)
            if not image_path:
                return build_api_response(False, 'Uploaded image not found or missing filename.', {}), 400

        app.logger.info(f'Prediction start for {filename} at {image_path}')

        # STEP 1: Validate if image is a PCB
        is_pcb, validation_score, validation_reason = validate_pcb_image(image_path)
        
        if not is_pcb:
            app.logger.warning(f'Invalid PCB image detected: {validation_reason}')
            return build_api_response(False, f'Invalid PCB Image Detected: {validation_reason}', {
                'is_valid_pcb': False,
                'validation_score': validation_score,
                'validation_reason': validation_reason
            }), 400

        # STEP 2: Run model prediction
        prediction = run_model_prediction(image_path)

        history_id = save_history_record(
            user_id=session['user_id'],
            image_filename=filename,
            original_filename=original_filename,
            image_path=image_path,
            prediction_result=prediction
        )

        image_url = url_for('uploaded_file', filename=filename)

        result = {
            'history_id': history_id,
            'image_url': image_url,
            'filename': filename,
            'status': prediction.get('status'),
            'defectType': prediction.get('defectType'),
            'confidence': prediction.get('confidence'),
            'normalPercentage': prediction.get('normalPercentage'),
            'defectedPercentage': prediction.get('defectedPercentage'),
            'severity': prediction.get('severity'),
            'pcbType': prediction.get('pcbType'),
            'pcbTypeConfidence': prediction.get('pcbTypeConfidence'),
            'reliabilityScore': prediction.get('reliabilityScore'),
            'reliabilityBreakdown': prediction.get('reliabilityBreakdown'),
            'explanation': prediction.get('explanation'),
            'suggestedSolution': prediction.get('suggestedSolution'),
            'boundingBoxes': prediction.get('boundingBoxes', []),
            'is_valid_pcb': True,
            'validation_score': validation_score
        }

        app.logger.info(f'Prediction complete for {filename}: {result.get("status")}')
        return build_api_response(True, 'Prediction completed successfully.', result), 200
    except Exception as e:
        app.logger.error(f'Prediction error: {e}', exc_info=True)
        return build_api_response(False, f'Prediction failed: {str(e)}', {}), 500


@app.errorhandler(Exception)
def handle_unhandled_exception(error):
    status_code = 500
    message = 'An internal server error occurred.'

    if isinstance(error, HTTPException):
        status_code = error.code
        message = str(error)

    app.logger.error(f'Unhandled exception: {error}', exc_info=True)
    return build_api_response(False, message, {}), status_code


@app.route('/api/history', methods=['GET'])
@login_required
def api_history():
    user_id = session['user_id']
    db = get_db()
    try:
        # Get query parameters
        search = request.args.get('search', '').strip()
        status_filter = request.args.get('status', '').strip()
        month_filter = request.args.get('month', '').strip()
        
        # Build query
        query = '''
            SELECT id, image_filename, image_path, original_filename, status, defect_type, 
                   confidence, normal_percentage, defected_percentage, severity, 
                   explanation, suggested_solution, bounding_boxes, created_at
            FROM prediction_history 
            WHERE user_id = ?
        '''
        params = [user_id]
        
        # Add filters
        if search:
            query += ' AND (original_filename LIKE ? OR defect_type LIKE ? OR status LIKE ?)'
            search_param = f'%{search}%'
            params.extend([search_param, search_param, search_param])
        
        if status_filter:
            query += ' AND status = ?'
            params.append(status_filter)
        
        if month_filter:
            query += ' AND strftime(\'%Y-%m\', created_at) = ?'
            params.append(month_filter)
        
        query += ' ORDER BY created_at DESC LIMIT 100'
        
        history = db.execute(query, params).fetchall()

        result = []
        for h in history:
            try:
                bounding_boxes = json.loads(h['bounding_boxes']) if h['bounding_boxes'] else []
            except:
                bounding_boxes = []
                
            result.append({
                'id': h['id'],
                'image_filename': h['image_filename'],
                'image_path': h['image_path'],
                'original_filename': h['original_filename'],
                'status': h['status'],
                'defectType': h['defect_type'],
                'confidence': h['confidence'],
                'normalPercentage': h['normal_percentage'],
                'defectedPercentage': h['defected_percentage'],
                'severity': h['severity'],
                'explanation': h['explanation'],
                'suggestedSolution': h['suggested_solution'],
                'boundingBoxes': bounding_boxes,
                'created_at': h['created_at'],
                'image_url': url_for('uploaded_file', filename=h['image_filename'], _external=True)
            })

        return jsonify(result)
    except Exception as e:
        print(f'History fetch error: {e}')
        return jsonify({'success': False, 'message': 'Failed to fetch history'}), 500
    finally:
        db.close()

@app.route('/api/history/<int:history_id>', methods=['DELETE'])
@login_required
def api_history_delete(history_id):
    user_id = session['user_id']
    db = get_db()
    try:
        # Check ownership
        record = db.execute(
            'SELECT user_id, image_filename FROM prediction_history WHERE id = ?', 
            (history_id,)
        ).fetchone()
        
        if not record or record['user_id'] != user_id:
            return jsonify({'success': False, 'message': 'Not authorized'}), 403

        # Delete image file
        try:
            image_path = os.path.join(app.config['UPLOAD_FOLDER'], record['image_filename'])
            if os.path.exists(image_path):
                os.remove(image_path)
        except:
            pass

        # Delete database record
        db.execute('DELETE FROM prediction_history WHERE id = ?', (history_id,))
        db.commit()
        
        return jsonify({'success': True, 'message': 'Record deleted'})
    except Exception as e:
        print(f'History delete error: {e}')
        return jsonify({'success': False, 'message': 'Failed to delete record'}), 500
    finally:
        db.close()

@app.route('/api/stats', methods=['GET'])
@login_required
def api_stats():
    user_id = session['user_id']
    db = get_db()
    try:
        # Total predictions
        total = db.execute(
            'SELECT COUNT(*) as count FROM prediction_history WHERE user_id = ?',
            (user_id,)
        ).fetchone()['count']
        
        # Normal vs Defected
        normal = db.execute(
            'SELECT COUNT(*) as count FROM prediction_history WHERE user_id = ? AND status = "Normal"',
            (user_id,)
        ).fetchone()['count']
        
        defected = db.execute(
            'SELECT COUNT(*) as count FROM prediction_history WHERE user_id = ? AND status = "Defected"',
            (user_id,)
        ).fetchone()['count']
        
        # Defect type distribution
        defect_types = db.execute('''
            SELECT defect_type as name, COUNT(*) as value
            FROM prediction_history
            WHERE user_id = ? AND status = "Defected" AND defect_type IS NOT NULL
            GROUP BY defect_type
            ORDER BY value DESC
        ''', (user_id,)).fetchall()
        
        # Monthly trend (last 12 months)
        monthly_trend = db.execute('''
            SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count, 
                   SUM(CASE WHEN status = "Defected" THEN 1 ELSE 0 END) as defected_count
            FROM prediction_history
            WHERE user_id = ?
            GROUP BY month
            ORDER BY month DESC
            LIMIT 12
        ''', (user_id,)).fetchall()
        
        # Accuracy (if we have predictions)
        accuracy = 0
        if total > 0:
            high_confidence_correct = db.execute('''
                SELECT COUNT(*) as count 
                FROM prediction_history 
                WHERE user_id = ? AND confidence >= 80
            ''', (user_id,)).fetchone()['count']
            accuracy = round((high_confidence_correct / max(1, total)) * 100, 2)
        
        # Recent predictions
        recent = db.execute('''
            SELECT id, status, defect_type, confidence, created_at
            FROM prediction_history
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 5
        ''', (user_id,)).fetchall()
        
        return jsonify({
            'total': total,
            'normal': normal,
            'defected': defected,
            'accuracy': accuracy,
            'defect_types': [{'name': dt['name'], 'value': dt['value']} for dt in defect_types],
            'monthly_trend': [
                {
                    'month': mt['month'],
                    'count': mt['count'],
                    'defected_count': mt['defected_count']
                } for mt in monthly_trend
            ],
            'recentPredictions': [
                {
                    'id': r['id'],
                    'status': r['status'],
                    'defect_type': r['defect_type'],
                    'confidence': r['confidence'],
                    'created_at': r['created_at']
                } for r in recent
            ]
        })
    except Exception as e:
        print(f'Stats error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': 'Failed to fetch stats'}), 500
    finally:
        db.close()

@app.route('/api/settings', methods=['GET'])
@login_required
def api_settings():
    db = get_db()
    try:
        settings = db.execute('SELECT * FROM settings WHERE id = 1').fetchone()
        return jsonify(dict(settings))
    except Exception as e:
        print(f'Settings fetch error: {e}')
        return jsonify({'success': False, 'message': 'Failed to fetch settings'}), 500
    finally:
        db.close()

@app.route('/api/settings', methods=['POST'])
@login_required
def api_settings_post():
    data = request.get_json()
    db = get_db()
    try:
        db.execute('''
            UPDATE settings
            SET notifications = ?, security = ?, data_management = ?, sensitivity = ?, auto_save = ?, model_type = ?
            WHERE id = 1
        ''', (
            1 if data.get('notifications') else 0,
            1 if data.get('security') else 0,
            1 if data.get('data_management') else 0,
            data.get('sensitivity', 50),
            1 if data.get('auto_save') else 0,
            data.get('model_type', 'gemini-3-flash')
        ))
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        print(f'Settings update error: {e}')
        return jsonify({'success': False, 'message': 'Failed to update settings'}), 500
    finally:
        db.close()

@app.route('/api/support', methods=['POST'])
def api_support():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    subject = data.get('subject')
    message = data.get('message')

    db = get_db()
    try:
        db.execute('INSERT INTO support_queries (name, email, subject, message) VALUES (?, ?, ?, ?)',
                  (name, email, subject, message))
        db.commit()
        return jsonify({'success': True})
    except Exception as e:
        print(f'Support error: {e}')
        return jsonify({'success': False, 'message': 'Failed to process support request'}), 500
    finally:
        db.close()

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory('static', filename)

if __name__ == '__main__':
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    app.run(debug=True, host='0.0.0.0', port=5000)