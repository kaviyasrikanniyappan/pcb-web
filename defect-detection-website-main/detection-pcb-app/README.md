# PCB Defect Detection Web Application

A complete Python Flask web application for AI-powered PCB defect detection using YOLO models.

## Features

- **AI-Powered Detection**: Uses YOLO (You Only Look Once) models for accurate PCB defect detection
- **User Authentication**: Secure login and registration system
- **Real-time Analysis**: Instant defect detection with confidence scores
- **Detection History**: Track and review all previous analyses
- **Analytics Dashboard**: Visual insights into detection patterns
- **Responsive Design**: Modern, mobile-friendly interface
- **Camera Support**: Direct camera capture for live analysis

## Technology Stack

- **Backend**: Python Flask
- **AI/ML**: Ultralytics YOLO
- **Database**: SQLite
- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Authentication**: JWT tokens with bcrypt hashing

## Installation

1. **Clone or download the project**

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```bash
   python app.py
   ```

4. **Open your browser** and navigate to:
   ```
   http://localhost:5000
   ```

## Project Structure

```
detection-pcb-app/
├── app.py                 # Main Flask application
├── yolo_predict.py        # YOLO prediction script
├── requirements.txt       # Python dependencies
├── templates/            # HTML templates
│   ├── base.html
│   ├── login.html
│   └── index.html
├── static/               # Static assets
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── auth.js
│       └── main.js
├── database/             # SQLite database
├── uploads/              # Uploaded images
├── dataset/              # ML models and data
└── run.bat               # Windows batch file to run app
```

## Usage

1. **Register/Login**: Create an account or login with existing credentials
2. **Upload Image**: Choose a PCB image file or use camera capture
3. **View Results**: See detection results with bounding boxes and defect details
4. **Review History**: Check previous analyses in the history section
5. **Analytics**: View detection statistics and trends

## API Endpoints

- `GET /` - Main dashboard
- `GET /login` - Login page
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/predict` - PCB defect prediction
- `GET /api/history` - Detection history
- `POST /api/history` - Save detection result
- `GET /api/stats` - Analytics data

## Supported Defect Types

- Soldering defects
- Component mismatches
- Missing holes
- Missing bites
- Open circuits
- Short circuits
- Spurs
- Spurious copper

## Development

The application uses:
- **Flask** for web framework
- **SQLite** for data storage
- **JWT** for authentication
- **YOLOv8** for object detection
- **Chart.js** for analytics visualization

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- CORS protection
- Input validation
- Secure file uploads

## License

This project is for educational and demonstration purposes.

## Troubleshooting

1. **Module not found**: Ensure all dependencies are installed with `pip install -r requirements.txt`
2. **Port already in use**: Change the port in `app.py` (default: 5000)
3. **Model not found**: Ensure YOLO model files are in `dataset/models/` directory
4. **Database errors**: Delete `database/pcb_vision.db` to reset the database

## Dataset
You mentioned your datasets are already trained and kept in your file manager. You can integrate them into the `backend/` or `frontend/` logic as needed for your specific detection workflow.
