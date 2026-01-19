# Optimal Image Layout - Multi-User Application

A smart image layout tool that automatically arranges images and PDF extracts into optimized A4 layouts. Supports multiple concurrent users with session-based isolation.

## ✨ Features

- **Multi-user support** with session isolation
- **PDF image extraction** 
- **Figure detection** from photos
- **Smart A4 layout optimization**
- **Real-time canvas editing**
- **PDF export**
- **Rate limiting** and resource management
- **Automatic cleanup** of expired sessions

## 🚀 Quick Setup

### 1. Environment Variables
Create `.env` file in the `backend` directory:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

### 2. Database Setup
Copy and paste `backend/setup_database.sql` into your Supabase SQL editor and run it.

### 3. Storage Setup
1. Go to Supabase Dashboard > Storage
2. Create new bucket named `assets`
3. Make it **public**
4. Set file size limit to 50MB

### 4. Start Application
```bash
# Backend
cd backend
pip install -r requirements.txt
python app.py

# Frontend  
cd frontend
npm install
npm run dev
```

### 5. Access
- Frontend: http://localhost:5173
- Backend: http://localhost:5001
- Health check: http://localhost:5001/health

## 🏗️ Architecture

### Backend (Flask + Supabase)
- **Session Management**: UUID-based anonymous sessions
- **Storage**: Supabase Storage with path isolation (`anonymous/{session_id}/`)
- **Database**: PostgreSQL with session-based data isolation
- **Rate Limiting**: 100 requests/hour per session
- **Resource Limits**: 100 images, 50MB files per session

### Frontend (React + TypeScript)
- **Session Persistence**: localStorage-based session management
- **Canvas Rendering**: HTML5 Canvas with real-time editing
- **File Upload**: Drag & drop with progress indication
- **Layout Engine**: Automatic A4 optimization

## 🔧 Configuration

### Environment Variables
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key (bypasses RLS)
- `SUPABASE_ANON_KEY` - Alternative to service key

### Application Settings
```python
SESSION_TIMEOUT_HOURS = 24      # Session expiration
MAX_IMAGES_PER_SESSION = 100    # Image limit per session  
MAX_FILE_SIZE_MB = 50           # File size limit
RATE_LIMIT_REQUESTS = 100       # Requests per hour per session
```

## 📊 Multi-User Features

### Session Isolation
- Each user gets a unique session ID
- Data completely isolated between sessions
- Storage paths include session ID
- Database queries filtered by session

### Resource Management
- Rate limiting per session
- File size validation
- Image count limits
- Automatic session cleanup

### Security
- Session ID validation (UUID format)
- Storage path isolation
- Database RLS disabled for anonymous access
- CORS configuration for frontend

## 🛠️ Troubleshooting

### Common Issues

**"Bucket not found" error**
- Create `assets` bucket in Supabase Storage
- Make sure it's set to public

**"Row-level security policy violation"**
- Run the SQL setup script
- Or manually: `ALTER TABLE images DISABLE ROW LEVEL SECURITY;`

**Backend won't start**
- Check environment variables
- Verify Supabase credentials
- Test with `/health` endpoint

## 📁 Project Structure

```
optimal-image-layout/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── setup_database.sql     # Database setup script
│   ├── final_fix.py          # Diagnostic tool
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── ImageCanvas.tsx    # Main React component
│   │   ├── sessionManager.ts  # Session management
│   │   └── ...
│   └── package.json
└── README.md
```

## 🔄 Session Lifecycle

1. **Session Creation**: Frontend requests session ID from backend
2. **Storage**: Session ID stored in localStorage
3. **API Calls**: All requests include `X-Session-Id` header
4. **Data Isolation**: Backend filters all operations by session
5. **Cleanup**: Sessions expire after 24 hours

## 🚀 Production Deployment

### Backend
- Use production WSGI server (gunicorn/uvicorn)
- Set up proper environment variables
- Configure session cleanup cron job
- Monitor rate limits and resource usage

### Frontend
- Build for production: `npm run build`
- Serve static files
- Configure proper CORS origins

### Database
- Regular cleanup of expired sessions
- Monitor storage usage
- Set up backup strategy

## 📈 Monitoring

Key metrics to track:
- Active sessions count
- Storage usage per session
- Rate limit violations
- Session creation rate
- Image processing time

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.