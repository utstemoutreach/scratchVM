from flask import Flask, request, send_from_directory, Response, jsonify
import os
import json
import re
import base64
from datetime import datetime

app = Flask(__name__)
UPLOAD_DIR = "upload"
BUG_REPORTS_DIR = "bug_reports"
TUTORING_REQUESTS_DIR = "tutoring_requests"
GAME_REPORTS_DIR = "game_reports"

# Ensure the upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(BUG_REPORTS_DIR, exist_ok=True)
os.makedirs(TUTORING_REQUESTS_DIR, exist_ok=True)
os.makedirs(GAME_REPORTS_DIR, exist_ok=True)

# Serve any file requested
@app.route('/<path:filename>', methods=['GET', 'OPTIONS'])
def serve_file(filename):
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    response = send_from_directory('.', filename)
    # Add CORS headers explicitly
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    # Ensure JSON files have correct content type
    if filename.endswith('.json'):
        response.headers['Content-Type'] = 'application/json'
    return response

# Handle file uploads
@app.route('/upload/<path:filename>', methods=['POST'])
def upload_file(filename):
    filepath = os.path.join(UPLOAD_DIR, filename)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'wb') as f:
        f.write(request.data)
    return f"Saved {filename}", 200

# Handle bug reports
@app.route('/api/bug-report', methods=['POST', 'OPTIONS'])
def submit_bug_report():
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or 'projectLink' not in data or 'description' not in data:
            return jsonify({'error': 'Missing required fields: projectLink and description'}), 400
        
        project_link = data.get('projectLink', '').strip()
        description = data.get('description', '').strip()
        email = data.get('email', '').strip()
        
        if not project_link or not description:
            return jsonify({'error': 'projectLink and description are required'}), 400
        
        # Create bug report object
        bug_report = {
            'id': datetime.now().strftime('%Y%m%d_%H%M%S_%f'),
            'timestamp': datetime.now().isoformat(),
            'projectLink': project_link,
            'description': description,
            'email': email if email else None,
            'status': 'open'
        }
        
        # Save to JSON file
        filename = f"bug_{bug_report['id']}.json"
        filepath = os.path.join(BUG_REPORTS_DIR, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(bug_report, f, indent=2, ensure_ascii=False)
        
        response = jsonify({
            'success': True,
            'message': 'Bug report submitted successfully',
            'id': bug_report['id']
        })
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response, 200
        
    except Exception as e:
        error_response = jsonify({'error': f'Server error: {str(e)}'})
        error_response.headers['Access-Control-Allow-Origin'] = '*'
        return error_response, 500

# Handle tutoring session requests
@app.route('/api/tutoring-request', methods=['POST', 'OPTIONS'])
def submit_tutoring_request():
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data:
            return jsonify({'error': 'Missing request data'}), 400
        
        required_fields = ['name', 'email', 'feature', 'preferredDateTime']
        for field in required_fields:
            if field not in data or not data[field]:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        name = data.get('name', '').strip()
        email = data.get('email', '').strip()
        feature = data.get('feature', '').strip()
        preferred_date_time = data.get('preferredDateTime', '').strip()
        notes = data.get('notes', '').strip() if data.get('notes') else None
        
        # Validate email format
        if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
            return jsonify({'error': 'Invalid email format'}), 400
        
        # Validate feature is one of the allowed options
        allowed_features = ['sound', 'touch_screen', 'battery']
        if feature not in allowed_features:
            return jsonify({'error': 'Invalid feature selection'}), 400
        
        # Create tutoring request object
        tutoring_request = {
            'id': datetime.now().strftime('%Y%m%d_%H%M%S_%f'),
            'timestamp': datetime.now().isoformat(),
            'name': name,
            'email': email,
            'feature': feature,
            'preferredDateTime': preferred_date_time,
            'notes': notes,
            'status': 'pending'
        }
        
        # Save to JSON file
        filename = f"tutoring_{tutoring_request['id']}.json"
        filepath = os.path.join(TUTORING_REQUESTS_DIR, filename)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(tutoring_request, f, indent=2, ensure_ascii=False)
        
        response = jsonify({
            'success': True,
            'message': 'Tutoring request submitted successfully',
            'id': tutoring_request['id']
        })
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response, 200
        
    except Exception as e:
        error_response = jsonify({'error': f'Server error: {str(e)}'})
        error_response.headers['Access-Control-Allow-Origin'] = '*'
        return error_response, 500

@app.route('/api/game-status', methods=['POST', 'OPTIONS'])
def submit_game_status():
    if request.method == 'OPTIONS':
        response = Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return response
    
    try:
        data = request.get_json()
        if not data or 'status' not in data or 'programData' not in data:
            error_response = jsonify({'error': 'Missing required fields: status and programData'})
            error_response.headers['Access-Control-Allow-Origin'] = '*'
            return error_response, 400
        
        status = data.get('status', '').strip().lower()
        allowed_status = {'worked', 'failed'}
        if status not in allowed_status:
            error_response = jsonify({'error': 'Status must be "worked" or "failed"'})
            error_response.headers['Access-Control-Allow-Origin'] = '*'
            return error_response, 400
        
        program_data_b64 = data.get('programData', '')
        try:
            program_bytes = base64.b64decode(program_data_b64)
        except Exception:
            error_response = jsonify({'error': 'Invalid programData payload'})
            error_response.headers['Access-Control-Allow-Origin'] = '*'
            return error_response, 400
        
        report_id = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        project_id = data.get('projectId') or None
        project_name = data.get('projectName') or None
        byte_length = data.get('byteLength') or len(program_bytes)
        
        metadata = {
            'id': report_id,
            'timestamp': datetime.now().isoformat(),
            'status': status,
            'projectId': project_id,
            'projectName': project_name,
            'byteLength': byte_length,
            'storage': {
                'binaryFile': f"game_{report_id}.bin",
                'metadataFile': f"game_{report_id}.json"
            }
        }
        
        binary_path = os.path.join(GAME_REPORTS_DIR, metadata['storage']['binaryFile'])
        with open(binary_path, 'wb') as bin_file:
            bin_file.write(program_bytes)
        
        metadata_path = os.path.join(GAME_REPORTS_DIR, metadata['storage']['metadataFile'])
        with open(metadata_path, 'w', encoding='utf-8') as meta_file:
            json.dump(metadata, meta_file, indent=2, ensure_ascii=False)
        
        response = jsonify({
            'success': True,
            'message': 'Game status received',
            'id': report_id
        })
        response.headers['Access-Control-Allow-Origin'] = '*'
        return response, 200
    except Exception as e:
        error_response = jsonify({'error': f'Server error: {str(e)}'})
        error_response.headers['Access-Control-Allow-Origin'] = '*'
        return error_response, 500

if __name__ == "__main__":
    app.run(debug=True)
