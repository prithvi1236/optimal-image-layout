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

## AWS / Self-Hosted (Nginx in Front of Flask)

When the backend runs on an EC2 (or similar) and nginx proxies to Flask:

### Critical: Remove `try_files` from the API `location /`

**Do not use** `try_files $uri $uri/ =404` in the block that `proxy_pass`es to Flask. For paths like `/extract_img`, `/ping`, `/layout_stream`, nginx would look for a file, not find it, and return **404 before the request reaches Flask**. That causes:

- `Preflight response is not successful. Status code: 404`
- `XMLHttpRequest cannot load .../extract_img due to access control checks`

**Set `client_max_body_size`** so uploads reach Flask. Nginx default is 1MB; larger uploads get 413 before Flask. That 413 has no CORS headers, so the browser shows *"Origin ... is not allowed"* (it's masking 413). Use at least `50m` if Flask allows 50MB:

```nginx
client_max_body_size 50m;   # in server { } or location / { }
```

**Correct** `location /` when it only proxies to the backend:

```nginx
location / {
    proxy_pass http://flasklayout;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

**Do not add CORS `add_header` in nginx.** Flask (flask-cors) already sets CORS headers. If both set `Access-Control-Allow-Origin`, the header is duplicated and the browser reports: *"Access-Control-Allow-Origin cannot contain more than one origin"*.

A full example is in `nginx-backend.conf`. Copy it to your server (e.g. `/etc/nginx/sites-available/`), adjust `upstream` if your Flask port is not 5002, then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Frontend `VITE_API_URL` should point at nginx (e.g. `http://13.204.143.78` or `http://your-domain` on port 80), not directly at `:5002`, if you route API through nginx.

## Troubleshooting

### Common Issues

1. **Build Failures**
   - Check build logs in Render dashboard
   - Verify all dependencies in requirements.txt/package.json

2. **CORS / Preflight 404 (e.g. `Preflight response is not successful. Status code: 404`)**
   - If using nginx in front of Flask: **remove `try_files $uri $uri/ =404`** from the `location /` block that proxies to Flask. It causes nginx to return 404 for `/extract_img`, `/ping`, etc. before proxying. See `nginx-backend.conf` and the "AWS / Self-Hosted" section above.
   - Ensure backend URL is correctly set in frontend (`VITE_API_URL`).
   - Check CORS in backend (e.g. `supports_credentials=False` when using `origins=["*"]`).

3. **"Access-Control-Allow-Origin cannot contain more than one origin"**
   - **Remove all CORS `add_header` directives from nginx** (Access-Control-Allow-Origin, Access-Control-Allow-Methods, Access-Control-Allow-Headers, and any `if ($request_method = 'OPTIONS')` block that adds them). Flask (flask-cors) already sets CORS; if nginx adds them too, the header is sent twice and the browser rejects it.

4. **"Origin ... is not allowed" with Status 413, or uploads failing (extract_img)**
   - **413 = Payload Too Large.** Nginx’s default `client_max_body_size` is 1MB. Add `client_max_body_size 50m;` in the `server` or `location /` block so uploads up to 50MB are proxied to Flask. Without it, nginx returns 413 before Flask; that response has no CORS headers, so the browser reports an "Origin is not allowed" CORS error instead of 413.

5. **File Upload Issues (other)**
   - Verify backend service is running
   - Check network requests in browser dev tools

6. **Cold Start Delays**
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

## User Data Cleanup System

The application includes an automatic cleanup system for user data management:

### Database Setup Required
Before deployment, ensure the cleanup schema is applied to your Supabase database:

1. **Run Cleanup Schema**
   ```sql
   -- Execute the contents of backend/cleanup_schema.sql in your Supabase SQL editor
   ```

2. **Verify Functions**
   - `cleanup_inactive_users()` - Removes inactive user data
   - `update_user_activity()` - Tracks user activity
   - `cleanup_user_data()` - Manual user data cleanup

### Cleanup Features
- **Automatic**: Cleans up user data after 1 hour of inactivity
- **Warning**: Shows warning at 50 minutes of inactivity
- **Manual**: Logout and delete buttons for immediate cleanup
- **Background**: Runs cleanup every 5 minutes automatically

### Environment Variables
Add these to your backend service if you want to customize cleanup timing:
```
CLEANUP_INTERVAL=300          # 5 minutes (in seconds)
INACTIVITY_THRESHOLD=3600     # 1 hour (in seconds)
```

### Monitoring Cleanup
- Access `/cleanup_stats` endpoint for cleanup statistics
- Check backend logs for cleanup operations
- Monitor Supabase storage usage

For detailed cleanup system documentation, see `CLEANUP_SYSTEM.md`.