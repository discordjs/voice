import { once } from 'events';
import WS from 'jest-websocket-mock';
import { VoiceWebSocket } from '../VoiceWebSocket';

beforeEach(() => {
	WS.clean();
});

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
