# 🎀 PetalPop — Python Data Structures Photobooth

A mobile-friendly Flask photobooth that **actually uses five Python data structures** in its normal workflow. The browser must still use JavaScript for camera access, Safari-compatible filters, touch stickers, countdowns and drawing; Python powers the session, capture/retake records, edit history, and print processing. It is not a Python-only browser app.

## Data structures and how to demonstrate them

| Structure | File | Real operation |
|---|---|---|
| List (dynamic array) | `data_structures.py` | `Session.photos` stores capture IDs; `capture` appends and `retake` removes by index. |
| Singly linked list | `data_structures.py` | `LinkedPhotoOrder` tracks photo capture order, with append/remove/traversal. |
| Stack (LIFO) | `data_structures.py` | `EditStack` stores previous editor states; the **Undo last edit** button calls the Python undo endpoint. |
| Queue (FIFO) | `data_structures.py` | `PrintQueue` enqueues completed PNG jobs and processes them in FIFO order. |
| Dictionary (hash table) | `data_structures.py` | `LAYOUTS` and `SessionStore.sessions` look up layouts and session IDs. |

**Important:** Photo data stays in the phone's browser during capture and editing. Python stores photo IDs and edit metadata (not camera images). The final decorated strip is sent to Python only when the user chooses a 300-DPI download. Server-side sessions are held in memory and expire after an hour; free-host restarts reset sessions. The queue is in-memory and is intended for a school demonstration, not a commercial print shop.

## Run locally

1. Install Python 3.12 or newer.
2. Open this folder in VS Code or a terminal.
3. `pip install -r requirements.txt`
4. `python server.py` (or double-click `run_windows.bat` on Windows).
5. Visit `http://localhost:5000` on your computer.

## Publish on Render

1. Upload **the contents of this folder**, including `requirements.txt`, `server.py`, `data_structures.py`, `app.js`, `index.html`, and `style.css`, to the **root** of a GitHub repository. Do not upload only the ZIP.
2. Render → New → Web Service → connect that repository.
3. Root Directory: leave blank if files are at repository root; otherwise enter the folder containing `requirements.txt`.
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `gunicorn server:app`
6. Use your Render HTTPS URL for phone camera access. Free hosts can sleep or restart and may reset in-memory sessions.

## iPhone Safari limitations

- Front-camera flash uses a white-screen simulation.
- Rear LED flash is available only if Safari exposes the hardware torch capability; the website cannot override iOS restrictions.
- Filters are processed by canvas pixel operations for Safari compatibility.
- The 3-, 5-, and 10-second timers capture all remaining slots after one click; manual mode captures one per click.

## Test the Python data structures and Flask endpoints

`python -m unittest discover -s tests -v`

Try `/api/data-structures` in your browser to see the structures used and the processed print-job count. The `tests/test_project.py` file demonstrates linked-list removal, LIFO undo, FIFO printing, session operations, and Flask API endpoints.
