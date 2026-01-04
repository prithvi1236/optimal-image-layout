# Smart Layout Studio

An intelligent image and PDF layout tool that automatically organizes your assets into perfectly formatted A4 sheets. Upload multiple images or PDFs, and let it handle the optimal arrangement with drag-and-drop editing capabilities.

## Landing Page
<img width="1689" height="891" alt="Image" src="https://github.com/user-attachments/assets/775d05a0-4afa-4c2b-b5ea-49a609711807" />

## ✨ Features

- **Smart Auto-Layout**: Utilizes the RectPack algorithm to intelligently pack items and maximize space efficiency.
- **Multi-Format Support**: Upload JPG, PNG, PDF files simultaneously
- **Interactive Editing**: Drag, resize, and reposition images with visual handles
- **Real-time Preview**: See changes instantly with live canvas rendering
- **PDF Export**: Generate professional A4 PDFs with one click
- **Multi-Page Support**: Automatically creates additional pages when needed
- **Responsive Design**: Modern, clean interface with zoom controls

## Layout Interface <img width="1689" height="891" alt="Image" src="https://github.com/user-attachments/assets/c354bdc4-c32a-473b-a816-d33aa2d19c0a" />

## 🚀 Quick Start

### Prerequisites

- **Python 3.8+** (for backend)
- **Node.js 18+** (for frontend)
- **pip** and **npm/yarn**

### Local Development

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd optimal-image-layout
   ```

2. **Set up the backend**
   ```bash
   cd backend
   pip install -r requirements.txt
   python app.py
   ```
   Backend will run on `http://localhost:5001`

3. **Set up the frontend**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend will run on `http://localhost:5173`

### Production Deployment

Deploy to Render.com with one click using the included configuration:

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Deploy to Render"
   git push origin main
   ```

2. **Deploy on Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will auto-deploy both frontend and backend

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

## 🛠️ Tech Stack

### Backend (Python/Flask)
- **Flask**: Web framework with CORS support
- **PyMuPDF (fitz)**: PDF processing and image extraction
- **PIL (Pillow)**: Image manipulation and processing
- **rectpack**: Advanced rectangle packing algorithms
- **UUID**: Unique identifier generation

### Frontend (React/TypeScript)
- **React 19**: Modern UI framework with hooks
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Vite**: Fast build tool and dev server
- **Axios**: HTTP client for API communication
- **jsPDF**: Client-side PDF generation
- **Lucide React**: Beautiful icon library

## 📋 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/extract_img` | Upload and process images/PDFs |
| `POST` | `/layout` | Generate optimal layout |
| `POST` | `/delete_image` | Remove image from layout |
| `GET` | `/output/<filename>` | Serve processed images |

## 🎯 How It Works

1. **Upload**: Drag and drop images or PDFs into the interface
2. **Extract**: Backend extracts images from PDFs and processes uploads
3. **Layout**: Advanced packing algorithm arranges items optimally
4. **Edit**: Interactive canvas allows manual adjustments
5. **Export**: Generate final PDF with all pages

## 🔧 Configuration

### Backend Settings
```python
A4_WIDTH = 794    # Canvas width in pixels
A4_HEIGHT = 1123  # Canvas height in pixels
MARGIN = 40       # Default page margin
GAP = 20          # Space between images
```

### Frontend Settings
```typescript
API_URL = "http://localhost:5001"  # Backend endpoint
HANDLE_SIZE = 10                   # Resize handle size
DEFAULT_ZOOM = 0.6                 # Initial zoom level
```

## 🎨 Features in Detail

### Smart Packing Algorithm
- Uses MaxRects Bottom-Left-Fill heuristic
- Respects user upload order (SORT_NONE)
- Automatically creates new pages when needed
- Maintains aspect ratios during scaling

### Interactive Canvas
- Click to select images
- Drag to reposition
- Resize handles on corners
- Real-time visual feedback
- Delete button on selected items

### Export Options
- High-quality PDF generation
- A4 format optimization
- Multi-page support
- Maintains image quality

## 🚧 Development

### Running in Development Mode

**Backend:**
```bash
cd backend
python app.py  # Runs with debug=True
```

**Frontend:**
```bash
cd frontend
npm run dev    # Hot reload enabled
```

### Building for Production

**Frontend:**
```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
optimal-image-layout/
├── backend/
│   ├── app.py              # Flask application
│   ├── uploads/            # Temporary file storage
│   └── output/             # Processed images
├── frontend/
│   ├── src/
│   │   ├── ImageCanvas.tsx # Main component
│   │   ├── App.tsx         # Root component
│   │   └── index.css       # Global styles
│   ├── package.json
│   └── vite.config.ts
├── screenshots/            # Demo images
└── README.md
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🐛 Known Issues

- Large PDF files may take time to process
- Canvas performance may vary with many images
- Mobile responsiveness needs improvement

## 🔮 Future Enhancements

- [ ] Cloud storage integration
- [ ] Batch processing capabilities
- [ ] Custom page sizes beyond A4
- [ ] Advanced image filters
- [ ] Collaborative editing
- [ ] Template system

---

**Made with ❤️ using React, Flask, and modern web technologies**
