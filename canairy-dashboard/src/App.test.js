import { act, render, screen } from '@testing-library/react';
import App from './App';

// A fake bridge connection, so the test doesn't need the real bridge running.
class FakeSocket {
  static last;
  static OPEN = 1;
  readyState = 1;
  sent = [];
  constructor() {
    FakeSocket.last = this;
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {}
}

beforeEach(() => {
  global.WebSocket = FakeSocket;
});

test('shows a card per worker and sends SOS acknowledgements to the bridge', () => {
  render(<App />);
  expect(screen.getByText(/Not connected/)).toBeInTheDocument();

  const now = Date.now();
  act(() => {
    FakeSocket.last.onopen();
    FakeSocket.last.onmessage({
      data: JSON.stringify({
        type: 'snapshot',
        serverTime: now,
        serial: { state: 'searching', path: null },
        workers: [
          { id: 101, name: 'Ava Chen', source: 'sim', gas: 180, sos: false, acknowledged: false, seq: 1, lost: 0, lastSeen: now },
          { id: 102, name: 'Marcus Reid', source: 'sim', gas: 200, sos: true, acknowledged: false, seq: 1, lost: 0, lastSeen: now },
        ],
      }),
    });
  });

  expect(screen.getByText('Ava Chen')).toBeInTheDocument();
  expect(screen.getByText('NOT OK: SOS')).toBeInTheDocument();

  act(() => screen.getByRole('button', { name: 'Acknowledge SOS' }).click());
  expect(FakeSocket.last.sent).toContainEqual({ type: 'ack', id: 102 });
});
