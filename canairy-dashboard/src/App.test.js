import { act, render, screen, within } from '@testing-library/react';
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
  window.location.hash = '';
});

function sendSnapshot(workers) {
  const now = Date.now();
  act(() => {
    FakeSocket.last.onopen();
    FakeSocket.last.onmessage({
      data: JSON.stringify({
        type: 'snapshot',
        serverTime: now,
        serial: { state: 'searching', path: null },
        workers: workers.map((w) => ({ source: 'sim', sos: false, acknowledged: false, seq: 1, lost: 0, lastSeen: now, ...w })),
      }),
    });
  });
}

test('shows a hint when the bridge is not running', () => {
  render(<App />);
  expect(screen.getByText(/bridge isn't running/i)).toBeInTheDocument();
});

test('shows worker cards and sends SOS acknowledgements to the bridge', () => {
  render(<App />);
  sendSnapshot([
    { id: 101, name: 'Ava Chen', gas: 180 },
    { id: 102, name: 'Marcus Reid', gas: 200, sos: true },
  ]);

  expect(screen.getByRole('region', { name: 'Workers' })).toHaveTextContent('Ava Chen');
  expect(screen.getByRole('alert')).toHaveTextContent('SOS from Marcus Reid');

  act(() => screen.getByRole('button', { name: 'Acknowledge SOS' }).click());
  expect(FakeSocket.last.sent).toContainEqual({ type: 'ack', id: 102 });
});

test('dangerous gas shows a banner and opens the worker page', () => {
  render(<App />);
  sendSnapshot([{ id: 103, name: 'Priya Patel', gas: 2500 }]);

  expect(screen.getByRole('alert')).toHaveTextContent('Dangerous gas near Priya Patel');
  act(() => screen.getAllByRole('button', { name: 'Open details for Priya Patel' })[0].click());
  act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(screen.getByRole('heading', { name: 'Priya Patel' })).toBeInTheDocument();
  expect(screen.getByText('Gas readings')).toBeInTheDocument();
});

test('main page logs summarize events for each worker', () => {
  render(<App />);
  sendSnapshot([
    { id: 101, name: 'Ava Chen', gas: 180 },
    { id: 102, name: 'Marcus Reid', gas: 200, sos: true },
  ]);

  const logs = screen.getByRole('region', { name: 'Worker logs' });
  expect(within(logs).getByRole('button', { name: 'Open details for Ava Chen' })).toBeInTheDocument();
  expect(within(logs).getByRole('button', { name: 'Open details for Marcus Reid' })).toBeInTheDocument();
  expect(logs).toHaveTextContent('SOS active');
  expect(within(logs).getAllByText('Wearable connected')).toHaveLength(2);
});
