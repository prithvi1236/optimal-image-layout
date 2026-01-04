# Deployment Guide for Smart Layout Studio

This guide covers deploying the Smart Layout Studio to Render.com.

## Prerequisites

- GitHub account
- Render account (free tier available)
- Project pushed to GitHub repository

## Deployment Steps

### Option 1: Using render.yaml (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add Render deployment configuration"
   git push origin main
   ```

2. **Connect to Render**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect the `render.yaml` file

3. **Configure Environment Variables**
   - Backend service will auto-configure
   - Frontend will build and deploy as static site

### Option 2: Manual Service Creation

#### Backend Deployment

1. **Create Web Service**
   - Service Type: Web Service
   - Build Command: `cd backend && pip install -r requirements.txt`
   - Start Command: `cd backend && gunicorn --bind 0.0.0.0:$PORT app:app`
   - Environment: Python 3.11

2. **Environment Variables**
   ```
   FLASK_ENV=production
   SERVER_URL=https://your-backend-service.onrender.com
   ```

#### Frontend Deployment

1. **Create Static Site**
   - Build Command: `cd frontend && npm install && npm run build`
   - Publish Directory: `frontend/dist`

2. **Update Environment Variables**
   - Update `frontend/.env.production` with your backend URL:
   ```
   VITE_API_URL=https://your-backend-service.onrender.com
   ```

## Configuration Files

### Backend Configuration
- `backend/requirements.txt` - Python dependencies
- `backend/Dockerfile` - Container configuration (optional)
- Environment-based CORS and URL configuration

### Frontend Configuration
- `frontend/.env.production` - Production API URL
- `frontend/.env.development` - Development API URL
- Vite environment variable support

## Important Notes

### Free Tier Limitations
- Services sleep after 15 minutes of inactivity
- 750 hours/month limit per service
- Cold start delays (10-30 seconds)

### File Storage
- Render's ephemeral filesystem resets on deployment
- Uploaded files are temporary (cleaned up automatically)
- Consider cloud storage (AWS S3, Cloudinary) for production

### CORS Configuration
- Production CORS is configured for `*.onrender.com` domains
- Update CORS origins in `backend/app.py` if using custom domains

## Monitoring

### Backend Health Check
```bash
curl https://your-backend-service.onrender.com/
```

### Frontend Access
```
https://your-frontend-service.onrender.com
```

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check build logs in Render dashboard
   - Verify all dependencies in requirements.txt/package.json

2. **CORS Errors**
   - Ensure backend URL is correctly set in frontend environment
   - Check CORS configuration in backend

3. **File Upload Issues**
   - Verify backend service is running
   - Check network requests in browser dev tools

4. **Cold Start Delays**
   - First request after sleep takes 10-30 seconds
   - Consider upgrading to paid plan for always-on services

### Logs Access
- Backend logs: Render Dashboard → Service → Logs
- Frontend build logs: Render Dashboard → Static Site → Deploys

## Production Optimizations

1. **Enable Gzip Compression**
   - Automatically handled by Render for static sites

2. **CDN Integration**
   - Render provides global CDN for static sites

3. **Database Integration**
   - Consider PostgreSQL add-on for persistent data
   - Redis for session management

4. **Monitoring**
   - Set up health checks
   - Configure alerts for service downtime

## Cost Optimization

- Use free tier for development/testing
- Upgrade to paid plans for production workloads
- Monitor usage in Render dashboard

## Security Considerations

- Environment variables for sensitive data
- HTTPS enforced by default
- Regular dependency updates
- Input validation and sanitization