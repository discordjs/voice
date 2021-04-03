/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { createSocket as _createSocket } from 'dgram';
import EventEmitter, { once } from 'events';
import { VoiceUDPSocket } from '../VoiceUDPSocket';

jest.mock('dgram');
jest.useFakeTimers();

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

// ip = 91.90.123.93, port = 54148
// eslint-disable-next-line prettier/prettier
const VALID_RESPONSE = Buffer.from([0x0, 0x2, 0x0, 0x46, 0x0, 0x4, 0xeb, 0x23, 0x39, 0x31, 0x2e, 0x39, 0x30, 0x2e, 0x31, 0x32, 0x33, 0x2e, 0x39, 0x33, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0xd3, 0x84]);

function wait() {
	return new Promise((resolve) => process.nextTick(resolve));
}

describe('VoiceUDPSocket#performIPDiscovery', () => {
	let socket: VoiceUDPSocket;

	afterEach(() => {
		socket.destroy();
	});

	/*
		Ensures that the UDP socket sends data and parses the response correctly
	*/
	test('Resolves and cleans up with a successful flow', async () => {
		const fake = new FakeSocket();
		fake.send = jest.fn().mockImplementation((buffer: Buffer, port: number, address: string) => {
			fake.emit('message', VALID_RESPONSE);
		});
		createSocket.mockImplementation((type) => fake as any);
		socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });

		expect(createSocket).toHaveBeenCalledWith('udp4');
		expect(fake.listenerCount('message')).toBe(1);
		await expect(socket.performIPDiscovery(1234)).resolves.toEqual({
			ip: '91.90.123.93',
			port: 54148,
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
		createSocket.mockImplementation(() => fake as any);
		socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });

		expect(createSocket).toHaveBeenCalledWith('udp4');
		expect(fake.listenerCount('message')).toBe(1);
		await expect(socket.performIPDiscovery(1234)).resolves.toEqual({
			ip: '91.90.123.93',
			port: 54148,
		});
		// Ensure clean up occurs
		expect(fake.listenerCount('message')).toBe(1);
	});

	test('Rejects if socket closes before IP discovery can be completed', async () => {
		const fake = new FakeSocket();
		fake.send = jest.fn().mockImplementation((buffer: Buffer, port: number, address: string) => {
			setImmediate(() => fake.close());
		});
		createSocket.mockImplementation(() => fake as any);
		socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });

		expect(createSocket).toHaveBeenCalledWith('udp4');
		await expect(socket.performIPDiscovery(1234)).rejects.toThrowError();
	});

	test('Stays alive when messages are echoed back', async () => {
		const fake = new FakeSocket();
		fake.send = jest.fn().mockImplementation((buffer: Buffer) => process.nextTick(() => fake.emit('message', buffer)));
		createSocket.mockImplementation(() => fake as any);
		socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });

		let closed = false;
		socket.on('close', () => (closed = true));

		for (let i = 0; i < 30; i++) {
			jest.advanceTimersToNextTimer();
			await wait();
		}

		expect(closed).toBe(false);
	});

	test('Emits an error when no response received to keep alive messages', async () => {
		const fake = new FakeSocket();
		fake.send = jest.fn();
		createSocket.mockImplementation(() => fake as any);
		socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });

		let closed = false;
		socket.on('close', () => (closed = true));

		for (let i = 0; i < 15; i++) {
			jest.advanceTimersToNextTimer();
			await wait();
		}

		expect(closed).toBe(true);
	});

	test('Recovers from intermittent responses', async () => {
		const fake = new FakeSocket();
		const fakeSend = jest.fn();
		fake.send = fakeSend;
		createSocket.mockImplementation(() => fake as any);
		socket = new VoiceUDPSocket({ ip: '1.2.3.4', port: 25565 });

		let closed = false;
		socket.on('close', () => (closed = true));

		for (let i = 0; i < 10; i++) {
			jest.advanceTimersToNextTimer();
			await wait();
		}
		fakeSend.mockImplementation((buffer: Buffer) => process.nextTick(() => fake.emit('message', buffer)));
		expect(closed).toBe(false);
		for (let i = 0; i < 30; i++) {
			jest.advanceTimersToNextTimer();
			await wait();
		}
		expect(closed).toBe(false);
	});
});
