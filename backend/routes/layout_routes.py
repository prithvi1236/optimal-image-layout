"""
Layout generation routes
"""
from flask import Blueprint, request, Response
from auth import get_user_id_from_auth
from services.layout_service import LayoutService

layout_bp = Blueprint('layout', __name__)
layout_service = LayoutService()

@layout_bp.route("/layout_stream", methods=["POST"])
def create_layout_stream():
    """Create layout using streaming response"""
    user_id = get_user_id_from_auth()
    if not user_id:
        return Response("Unauthorized", status=401)

    data = request.get_json()
    items = data.get("items", [])
    margin = int(data.get("margin", 40))
    gap = int(data.get("gap", 20))

    return Response(
        layout_service.generate_streaming_layout(items, margin, gap),
        mimetype="text/event-stream"
    )