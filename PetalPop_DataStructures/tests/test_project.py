import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data_structures import LinkedPhotoOrder, EditStack, PrintQueue, SessionStore

class DataStructureTests(unittest.TestCase):
    def test_linked_list(self):
        order = LinkedPhotoOrder()
        for value in ('a','b','c'): order.append(value)
        self.assertTrue(order.remove('b'))
        self.assertEqual(order.values(), ['a','c'])
        self.assertEqual(order.length, 2)
    def test_stack(self):
        stack = EditStack()
        stack.push({'filter':'none'})
        stack.push({'filter':'bw'})
        self.assertEqual(stack.pop()['filter'], 'bw')
    def test_queue_fifo(self):
        q = PrintQueue()
        q.enqueue('first'); q.enqueue('second')
        self.assertEqual(q.process_next(lambda x:x), 'first')
        self.assertEqual(q.process_next(lambda x:x), 'second')
    def test_photo_capture_retake_and_undo(self):
        s = SessionStore().create('1x4','#ffc7de',3)
        s.capture(); s.capture(); s.capture()
        self.assertEqual(s.order.values(),s.photos)
        s.retake(1)
        self.assertEqual(s.order.values(),s.photos)
        s.edit({'filter':'bw','slots':[0,1]})
        self.assertEqual(s.undo_edit()['filter'],'none')
    def test_flask_api(self):
        try:
            from server import app
        except ModuleNotFoundError as exc:
            if exc.name in ('flask', 'PIL'):
                self.skipTest('Install requirements.txt to run Flask integration tests')
            raise
        c=app.test_client()
        r=c.post('/api/sessions',json={'layout':'2x3','color':'#ffc7de','timer':5})
        self.assertEqual(r.status_code,201)
        sid=r.json['id']
        for _ in range(6):self.assertEqual(c.post(f'/api/sessions/{sid}/capture',json={}).status_code,200)
        self.assertEqual(c.post(f'/api/sessions/{sid}/capture',json={}).status_code,400)
        self.assertEqual(c.post(f'/api/sessions/{sid}/edit',json={'slots':[0,1],'filter':'bw'}).status_code,200)
        self.assertEqual(c.post(f'/api/sessions/{sid}/undo',json={}).json['editor']['filter'],'none')
        self.assertEqual(c.get('/api/data-structures').status_code,200)

if __name__=='__main__':unittest.main()
