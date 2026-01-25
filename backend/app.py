"""
Main Flask application with modular structure
"""
import atexit
from flask import Flask
from flask_cors import CORS

from config import MAX_FILE_SIZE, CORS_ORIGINS, CORS_HEADERS
from database import get_supabase_client
from cleanup_service import CleanupService
from routes.upload_routes import upload_bp
from routes.layout_routes import layout_bp
from routes.user_routes import user_bp
from routes.cleanup_routes import cleanup_bp
from routes.image_proxy_routes import image_proxy_bp

def create_app():
    """Application factory"""
    app = Flask(__name__)
    
    # Configuration
    app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE
    
    # CORS setup
    CORS(app, 
         resources={r"/*": {"origins": CORS_ORIGINS}}, 
         allow_headers=CORS_HEADERS, 
         supports_credentials=True)
    
    # Initialize cleanup service
    supabase = get_supabase_client()
    cleanup_service = CleanupService.create_instance(supabase, "assets")
    cleanup_service.start_cleanup_scheduler()
    
    # Ensure cleanup stops when app shuts down
    atexit.register(cleanup_service.stop_cleanup_scheduler)
    
    # Register blueprints
    app.register_blueprint(upload_bp)
    app.register_blueprint(layout_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(cleanup_bp)
    app.register_blueprint(image_proxy_bp)
    
    @app.route("/", methods=["GET"])
    def health_check():
        """Health check endpoint"""
        return {"status": "healthy", "service": "Smart Layout Studio API"}
    
    return app

# Create the app instance
app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=True, threaded=True)