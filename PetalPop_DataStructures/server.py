
import base64
import binascii
from io import BytesIO
from flask import Flask, jsonify, request, send_file
from PIL import Image, UnidentifiedImageError
from data_structures import LAYOUTS, PrintQueue, SessionStore

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024
sessions = SessionStore()
print_queue = PrintQueue()


@app.get('/')
def home():
    return app.send_static_file('index.html')


@app.get('/api/health')
def health():
    return jsonify(status='ok', app='PetalPop', engine='Python Flask + Data Structures')


@app.get('/api/data-structures')
def structures():
    return jsonify(structures={'list': 'Captured photo IDs', 'linked_list': 'Capture order',
                               'stack': 'Undo editor changes', 'queue': 'FIFO print processing',
                               'dictionary': 'Sessions and frame layouts'},
                   layouts=LAYOUTS, processed_print_jobs=print_queue.completed)


def payload():
    return request.get_json(silent=True) or {}


@app.post('/api/sessions')
def create_session():
    data = payload()
    try:
        session = sessions.create(data.get('layout', '1x4'), data.get('color', '#ffc7de'), data.get('timer', 0))
        return jsonify(session.summary()), 201
    except ValueError as exc:
        return jsonify(error=str(exc)), 400


@app.get('/api/sessions/<session_id>')
def get_session(session_id):
    try:
        return jsonify(sessions.get(session_id).summary())
    except KeyError as exc:
        return jsonify(error=str(exc)), 404


@app.post('/api/sessions/<session_id>/capture')
def capture(session_id):
    try:
        with sessions.lock:
            session = sessions.get(session_id)
            photo_id = session.capture()
            return jsonify(photo_id=photo_id, session=session.summary())
    except (KeyError, ValueError) as exc:
        return jsonify(error=str(exc)), 404 if isinstance(exc, KeyError) else 400


@app.post('/api/sessions/<session_id>/retake')
def retake(session_id):
    try:
        with sessions.lock:
            session = sessions.get(session_id)
            removed = session.retake(payload().get('index'))
            return jsonify(removed=removed, session=session.summary())
    except (KeyError, ValueError) as exc:
        return jsonify(error=str(exc)), 404 if isinstance(exc, KeyError) else 400


@app.post('/api/sessions/<session_id>/edit')
def edit(session_id):
    try:
        with sessions.lock:
            session = sessions.get(session_id)
            editor = session.edit(payload())
            return jsonify(editor=editor, undo_depth=len(session.undo.items))
    except (KeyError, ValueError) as exc:
        return jsonify(error=str(exc)), 404 if isinstance(exc, KeyError) else 400


@app.post('/api/sessions/<session_id>/undo')
def undo(session_id):
    try:
        with sessions.lock:
            session = sessions.get(session_id)
            return jsonify(editor=session.undo_edit(), undo_depth=len(session.undo.items))
    except (KeyError, ValueError) as exc:
        return jsonify(error=str(exc)), 404 if isinstance(exc, KeyError) else 400


def make_print_png(encoded):
    if not isinstance(encoded, str) or not encoded.startswith('data:image/png;base64,'):
        raise ValueError('A PNG image is required.')
    try:
        raw = base64.b64decode(encoded.split(',', 1)[1], validate=True)
        if len(raw) > 20 * 1024 * 1024:
            raise ValueError('Image is too large.')
        with Image.open(BytesIO(raw)) as source:
            if source.format != 'PNG' or source.width * source.height > 30_000_000:
                raise ValueError('Unsupported image dimensions or format.')
            result = source.convert('RGB')
            output = BytesIO()
            result.save(output, format='PNG', dpi=(300, 300), optimize=True)
            output.seek(0)
            return output
    except (binascii.Error, UnidentifiedImageError, OSError) as exc:
        raise ValueError('Invalid image data.') from exc


@app.post('/api/print-ready')
def print_ready():
    data = payload()
    session_id = data.get('session_id')
    if session_id:
        try:
            sessions.get(session_id)
        except KeyError:
            return jsonify(error='Session expired. Restart the photobooth.'), 404
   
    print_queue.enqueue(data.get('image', ''))
    try:
        output = print_queue.process_next(make_print_png)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    return send_file(output, mimetype='image/png', as_attachment=True,
                     download_name='PetalPop_Print_300DPI.png')


@app.errorhandler(413)
def too_large(_):
    return jsonify(error='Image exceeds the upload limit.'), 413


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
