# Optimal Image Layout - Multi-User Application

A smart image layout tool that automatically arranges images and PDF extracts into optimized A4 layouts. Supports multiple concurrent users with Supabase auth and session-based isolation.

## ✨ Features

- **Multi-user support** with Supabase auth and session isolation
- **PDF image extraction**
- **Figure detection** from photos
- **Smart A4 layout optimization**
- **Real-time canvas editing**
- **PDF export**
- **Automatic cleanup** of inactive user data

## 🖥️ UI Screenshots

### 🔐 Landing Page
The authentication and onboarding screen where users sign in securely using Google OAuth.

<img
  src="https://github.com/user-attachments/assets/11ee112a-474c-4fd4-90ab-a6e57bdbb716"
  alt="Landing Page"
  width="100%"
/>

---

### 🧩 Layout Editor
The main workspace showing smart A4 layout generation, page navigation, and real-time canvas editing.

<img
  src="https://github.com/user-attachments/assets/d4ce5a7a-81ff-4561-997d-2c114f517baa"
  alt="Layout Editor"
  width="100%"
/>


## 🚀 Quick Setup

### 1. Backend environment

Create `backend/.env` (copy from `backend/.env.example`):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
# or SUPABASE_ANON_KEY=your_anon_key
```

### 2. Database and storage

- Run `backend/setup_database.sql` in the Supabase SQL editor.
- For the cleanup system, run `backend/cleanup_schema.sql` (see `CLEANUP_SYSTEM.md`).
- In Supabase Dashboard → Storage: create a **public** bucket named `assets`, size limit 50MB.

### 3. Frontend environment

Create `frontend/.env` (or `.env.local`):

```bash
VITE_API_URL=http://localhost:5002
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

For production or a remote backend, set `VITE_API_URL` to your API base (e.g. `http://your-server` or `https://api.example.com`).

### 4. Run locally

```bash
# Backend (default port 5002)
cd backend
pip install -r requirements.txt
python app.py

# Frontend (Vite, default port 5173)
cd frontend
npm install
npm run dev
```

### 5. Access

- Frontend: http://localhost:5173
- Backend: http://localhost:5002
- Health: http://localhost:5002/

## 🏗️ Architecture

### Backend (Flask + Supabase)

- **Auth**: Supabase JWT in `Authorization: Bearer`
- **Storage**: Supabase Storage bucket `assets`
- **Database**: PostgreSQL with user-based isolation
- **Limits**: 50MB per file (`config.MAX_FILE_SIZE`), cleanup of inactive data
- **CORS**: flask-cors; use `origins=["*"]` with `supports_credentials=False`

### Frontend (React + TypeScript + Vite)

- **Auth**: Supabase client
- **Canvas**: HTML5 Canvas with real-time editing
- **Upload**: `extract_img` (images/PDFs), layout streaming, image proxy

## 🔧 Configuration

| Variable | Where | Description |
|----------|-------|-------------|
| `SUPABASE_URL` | backend `.env` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` or `SUPABASE_ANON_KEY` | backend `.env` | Supabase key |
| `VITE_API_URL` | frontend `.env` | Backend API base URL (no trailing slash) |
| `VITE_SUPABASE_URL` | frontend `.env` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | frontend `.env` | Supabase anon key |

Backend (`config.py`): `MAX_FILE_SIZE` (50MB), `CORS_ORIGINS`, `CORS_HEADERS`, `TEMP_UPLOAD_FOLDER`.

## 🌐 AWS / Self-hosted (Nginx in front of Flask)

When the backend is behind nginx (e.g. on EC2):

1. **Do not use** `try_files $uri $uri/ =404` in the `location /` that `proxy_pass`es to Flask — it returns 404 for `/extract_img`, `/ping`, etc. before the request reaches Flask.
2. **Do not add** CORS `add_header` in nginx — Flask (flask-cors) already sets CORS. Duplicate headers cause *"Access-Control-Allow-Origin cannot contain more than one origin"*.
3. **Set** `client_max_body_size 50m;` in the `server` or `location /` block so uploads up to 50MB are proxied. Nginx’s default 1MB leads to 413 and CORS-like errors in the browser.

Use `nginx-backend.conf` as a reference. The upstream should point at your app (e.g. `127.0.0.1:5002` or `127.0.0.1:8000` for Gunicorn). Reload nginx after changes:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

See **`DEPLOYMENT.md`** for full nginx examples, troubleshooting (CORS, 413, preflight 404), and Render/AWS notes.

## 📁 Project structure

```
optimal-image-layout/
├── backend/
│   ├── app.py              # Flask app, CORS, blueprints
│   ├── config.py           # MAX_FILE_SIZE, CORS, Supabase
│   ├── auth.py             # JWT / Supabase auth
│   ├── cleanup_service.py  # Inactive user cleanup
│   ├── setup_database.sql
│   ├── cleanup_schema.sql
│   ├── routes/             # upload, layout, user, cleanup, image_proxy
│   ├── services/           # image_processor, layout_service, storage_service
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── Components/     # Canvas, Header, Sidebar, Login, Notifications
│   │   ├── services/       # uploadService, pdfService, userService
│   │   ├── hooks/          # useImageLayout, useSessionPersistence
│   │   ├── cleanupService.ts
│   │   └── constants/      # API_URL from VITE_API_URL
│   └── package.json
├── nginx-backend.conf      # Nginx example for proxying to Flask
├── DEPLOYMENT.md           # Nginx, CORS, 413, Render, troubleshooting
├── CLEANUP_SYSTEM.md       # Cleanup schema and behavior
└── README.md
```

## 🛠️ Troubleshooting

| Issue | What to check |
|-------|----------------|
| Bucket not found | Create `assets` in Supabase Storage, make it public, 50MB limit |
| RLS / policy errors | Run `setup_database.sql` and `cleanup_schema.sql` as needed |
| Backend won’t start | `.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` or `SUPABASE_ANON_KEY` |
| CORS / preflight 404 | See `DEPLOYMENT.md`: remove `try_files`, avoid CORS in nginx |
| "Origin not allowed" + 413 | Add `client_max_body_size 50m;` in nginx |
| "cannot contain more than one origin" | Remove CORS `add_header` from nginx; only Flask sets CORS |

More: **`DEPLOYMENT.md`** (Render, nginx, CORS, 413, cold starts). Cleanup: **`CLEANUP_SYSTEM.md`**.

## 🚀 Production

- **Backend**: Gunicorn (e.g. `gunicorn --bind 0.0.0.0:8000 wsgi:app`) or Docker; see `backend/Dockerfile`.
- **Frontend**: `npm run build` in `frontend`, serve `frontend/dist`. Set `VITE_API_URL` to the live API.
- **Nginx**: Use `nginx-backend.conf`; ensure `client_max_body_size 50m`, no `try_files` in the API `location /`, no CORS headers in nginx.

## 📄 License

MIT License — see LICENSE file.
