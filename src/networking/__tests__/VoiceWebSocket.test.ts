import EventEmitter, { once } from 'events';
import WS from 'jest-websocket-mock';
import { VoiceWebSocket } from '../VoiceWebSocket';

beforeEach(() => {
	WS.clean();
});

function onceIgnoreError<T extends EventEmitter>(target: T, event: string) {
	return new Promise((resolve) => {
		target.on(event, resolve);
	});
}

describe('VoiceWebSocket: packet parsing', () => {
	test('Parses and emits packets', async () => {
		const endpoint = 'ws://localhost:1234';
		const server = new WS(endpoint, { jsonProtocol: true });
		const ws = new VoiceWebSocket(endpoint, false);
		await server.connected;
		const dummy = { value: 3 };
		const rcv = once(ws, 'packet');
		server.send(dummy);
		await expect(rcv).resolves.toEqual([dummy]);
	});

	test('Recovers from invalid packets', async () => {
		const endpoint = 'ws://localhost:1234';
		const server = new WS(endpoint);
		const ws = new VoiceWebSocket(endpoint, false);
		await server.connected;

		let rcv = once(ws, 'packet');
		server.send('asdf');
		await expect(rcv).rejects.toThrowError();

		const dummy = { op: 1234 };
		rcv = once(ws, 'packet');
		server.send(JSON.stringify(dummy));
		await expect(rcv).resolves.toEqual([dummy]);
	});
});

describe('VoiceWebSocket: event propagation', () => {
	test('open', async () => {
		const endpoint = 'ws://localhost:1234';
		const server = new WS(endpoint);
		const ws = new VoiceWebSocket(endpoint, false);
		const rcv = once(ws, 'open');
		await server.connected;
		await expect(rcv).resolves.toBeTruthy();
	});

	test('close (clean)', async () => {
		const endpoint = 'ws://localhost:1234';
		const server = new WS(endpoint);
		const ws = new VoiceWebSocket(endpoint, false);
		await server.connected;
		const rcv = once(ws, 'close');
		server.close();
		await expect(rcv).resolves.toBeTruthy();
	});

	test('close (error)', async () => {
		const endpoint = 'ws://localhost:1234';
		const server = new WS(endpoint);
		const ws = new VoiceWebSocket(endpoint, false);
		await server.connected;
		const rcvError = once(ws, 'error');
		const rcvClose = onceIgnoreError(ws, 'error');
		server.error();
		await expect(rcvError).resolves.toBeTruthy();
		await expect(rcvClose).resolves.toBeTruthy();
	});
});
