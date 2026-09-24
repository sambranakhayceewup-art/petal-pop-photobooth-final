"""Real Python data structures used by the PetalPop Flask API.

No photographs are saved on disk. Sessions contain photo metadata only; the
browser holds full-resolution images until a final strip is sent for printing.
"""
from collections import deque
from dataclasses import dataclass, field
from copy import deepcopy
from threading import RLock
from time import time
from uuid import uuid4

LAYOUTS = {'1x4': (1, 4), '2x4': (2, 4), '2x3': (2, 3),
           '1x3': (1, 3), '2x2': (2, 2), '3x3': (3, 3),
           '1x2': (1, 2), '3x2': (3, 2)}  # dictionary/hash table


class LinkedPhotoOrder:
    """Singly linked list: append, remove, traverse photo IDs in capture order."""
    class Node:
        def __init__(self, value):
            self.value, self.next = value, None

    def __init__(self):
        self.head = self.tail = None
        self.length = 0

    def append(self, value):
        node = self.Node(value)
        if self.tail:
            self.tail.next = node
        else:
            self.head = node
        self.tail = node
        self.length += 1

    def remove(self, value):
        previous, current = None, self.head
        while current:
            if current.value == value:
                if previous:
                    previous.next = current.next
                else:
                    self.head = current.next
                if self.tail is current:
                    self.tail = previous
                self.length -= 1
                return True
            previous, current = current, current.next
        return False

    def values(self):
        result, current = [], self.head
        while current:
            result.append(current.value)
            current = current.next
        return result


class EditStack:
    """LIFO stack for undoing changes to photo order, filters and stickers."""
    def __init__(self, limit=30):
        self.items, self.limit = [], limit

    def push(self, state):
        self.items.append(deepcopy(state))
        if len(self.items) > self.limit:
            self.items.pop(0)

    def pop(self):
        return self.items.pop() if self.items else None


@dataclass
class Session:
    id: str
    layout: str
    color: str
    timer: int
    created: float = field(default_factory=time)
    updated: float = field(default_factory=time)
    photos: list = field(default_factory=list)  # Python list/array
    order: LinkedPhotoOrder = field(default_factory=LinkedPhotoOrder)
    undo: EditStack = field(default_factory=EditStack)
    editor: dict = field(default_factory=lambda: {'slots': [], 'filter': 'none', 'stickers': [], 'caption': ''})
    retakes: int = 0

    def __post_init__(self):
        self.retakes = max(2, (self.capacity + 1) // 2)

    @property
    def capacity(self):
        cols, rows = LAYOUTS[self.layout]
        return cols * rows

    def capture(self):
        if len(self.photos) >= self.capacity:
            raise ValueError('All photo slots are filled.')
        photo_id = uuid4().hex
        self.photos.append(photo_id)
        self.order.append(photo_id)
        self.updated = time()
        return photo_id

    def retake(self, index):
        if self.retakes <= 0:
            raise ValueError('No retakes remaining.')
        if not isinstance(index, int) or not 0 <= index < len(self.photos):
            raise ValueError('Invalid photo index.')
        removed = self.photos.pop(index)
        self.order.remove(removed)
        self.retakes -= 1
        self.updated = time()
        return removed

    def edit(self, changes):
        if not isinstance(changes, dict):
            raise ValueError('Invalid edit.')
        allowed_filters = {'none', 'bw', 'vintage', 'dreamy', 'cool', 'warm', 'fade', 'dramatic'}
        next_state = deepcopy(self.editor)
        for key in ('slots', 'filter', 'stickers', 'caption'):
            if key in changes:
                next_state[key] = changes[key]
        if next_state['filter'] not in allowed_filters:
            raise ValueError('Unknown filter.')
        if not isinstance(next_state['slots'], list) or len(next_state['slots']) > self.capacity:
            raise ValueError('Invalid photo slots.')
        if any(not isinstance(i, int) or i < 0 or i >= len(self.photos) for i in next_state['slots']):
            raise ValueError('Photo slot is out of range.')
        if not isinstance(next_state['stickers'], list) or len(next_state['stickers']) > 40:
            raise ValueError('Too many stickers.')
        if not isinstance(next_state['caption'], str) or len(next_state['caption']) > 32:
            raise ValueError('Caption is too long.')
        if next_state != self.editor:
            self.undo.push(self.editor)
            self.editor = next_state
            self.updated = time()
        return deepcopy(self.editor)

    def undo_edit(self):
        previous = self.undo.pop()
        if previous is None:
            raise ValueError('Nothing to undo yet.')
        self.editor = previous
        self.updated = time()
        return deepcopy(self.editor)

    def summary(self):
        return {'id': self.id, 'layout': self.layout, 'color': self.color,
                'timer': self.timer, 'capacity': self.capacity,
                'photos': self.photos[:], 'linked_order': self.order.values(),
                'retakes': self.retakes, 'undo_depth': len(self.undo.items),
                'editor': deepcopy(self.editor)}


class SessionStore:
    """Dictionary lookup for independent sessions with expiration and locking."""
    def __init__(self, max_sessions=100, ttl=3600):
        self.sessions, self.max_sessions, self.ttl = {}, max_sessions, ttl
        self.lock = RLock()

    def create(self, layout, color, timer):
        if layout not in LAYOUTS:
            raise ValueError('Unknown layout.')
        if not isinstance(color, str) or len(color) != 7 or color[0] != '#' or any(c not in '0123456789abcdefABCDEF' for c in color[1:]):
            raise ValueError('Invalid frame color.')
        if timer not in (0, 3, 5, 10):
            raise ValueError('Invalid timer.')
        with self.lock:
            now = time()
            self.sessions = {k: v for k, v in self.sessions.items() if now - v.updated < self.ttl}
            if len(self.sessions) >= self.max_sessions:
                self.sessions.pop(min(self.sessions, key=lambda k: self.sessions[k].updated))
            session = Session(uuid4().hex, layout, color, timer)
            self.sessions[session.id] = session
            return session

    def get(self, session_id):
        with self.lock:
            session = self.sessions.get(session_id)
            if session is None or time() - session.updated > self.ttl:
                self.sessions.pop(session_id, None)
                raise KeyError('Session expired or not found.')
            return session


class PrintQueue:
    """FIFO queue: queued jobs are processed in the order received."""
    def __init__(self):
        self.jobs = deque()
        self.lock = RLock()
        self.completed = 0

    def enqueue(self, job):
        with self.lock:
            self.jobs.append(job)
            return len(self.jobs)

    def process_next(self, processor):
        with self.lock:
            if not self.jobs:
                raise ValueError('Print queue is empty.')
            job = self.jobs.popleft()
            result = processor(job)
            self.completed += 1
            return result
