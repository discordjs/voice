/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createSocket as _createSocket } from 'dgram';
import EventEmitter from 'events';
import { parseLocalPacket, VoiceUDPSocket } from '../VoiceUDPSocket';
jest.mock('dgram');

const createSocket = (_createSocket as unknown) as jest.Mock<typeof _createSocket>;

beforeEach(() => {
	createSocket.mockReset();
});

class FakeSocket extends EventEmitter {
	public send(buffer: Buffer, port: number, address: string) {}
	public close() {
		this.emit('close');
	}
}

// ip = 94.195.157.2, port = 42381
const VALID_RESPONSE = Buffer.concat([
	Buffer.from([0x02, 0x47, 0x1e, 0x00, 0x39, 0x34, 0x2e, 0x31, 0x39, 0x35, 0x2e, 0x31, 0x35, 0x37, 0x2e, 0x32]),
	Buffer.alloc(52),
	Buffer.from([0x8d, 0xa5]),
]);

describe('VoiceUDPSocket#performIPDiscovery', () => {
	/*
		Ensures that the UDP socket sends data and parses the response correctly
	*/
	test('Resolves and cleans up with a successful flow', async () => {
		const fake = new FakeSocket();
		fake.send = jest.fn().mockImplementation((buffer: Buffer, port: number, address: string) => {
			fake.emit('message', VALID_RESPONSE);
		});
		createSocket.mockImplementation((type) => fake as any);
		const socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });
		expect(fake.listenerCount('message')).toBe(1);

		expect(createSocket).toHaveBeenCalledWith('udp4');
		await expect(socket.performIPDiscovery(1234)).resolves.toEqual({
			ip: '94.195.157.2',
			port: 42381,
		});
		// Ensure clean up occurs
		expect(fake.listenerCount('message')).toBe(1);
	});

	/*
		In the case where an unrelated message is received before the IP discovery buffer,
		the UDP socket should wait indefinitely until the correct buffer arrives.
	*/
	test('Waits for a valid response in an unexpected flow', async () => {
		const fake = new FakeSocket();
		const fakeResponse = Buffer.from([1, 2, 3, 4, 5]);
		fake.send = jest.fn().mockImplementation((buffer: Buffer, port: number, address: string) => {
			fake.emit('message', fakeResponse);
			setImmediate(() => fake.emit('message', VALID_RESPONSE));
		});
		createSocket.mockImplementation((type) => fake as any);
		const socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });
		expect(fake.listenerCount('message')).toBe(1);

		expect(createSocket).toHaveBeenCalledWith('udp4');
		await expect(socket.performIPDiscovery(1234)).resolves.toEqual({
			ip: '94.195.157.2',
			port: 42381,
		});
		// Ensure clean up occurs
		expect(fake.listenerCount('message')).toBe(1);
	});

	test('Rejects if socket closes before IP discovery can be completed', async () => {
		const fake = new FakeSocket();
		fake.send = jest.fn().mockImplementation((buffer: Buffer, port: number, address: string) => {
			setImmediate(() => fake.close());
		});
		createSocket.mockImplementation((type) => fake as any);
		const socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });

		expect(createSocket).toHaveBeenCalledWith('udp4');
		await expect(socket.performIPDiscovery(1234)).rejects.toThrowError();
	});
});
