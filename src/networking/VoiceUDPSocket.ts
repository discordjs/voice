import { createSocket, Socket } from 'dgram';
import { EventEmitter } from 'events';
import { isIPv4 } from 'net';

/**
 * Stores an IP address and port. Used to store socket details for the local client as well as
 * for Discord.
 */
export interface SocketConfig {
	ip: string;
	port: number;
}

/**
 * Manages the UDP networking for a voice connection.
 */
export class VoiceUDPSocket extends EventEmitter {
	/**
	 * The underlying network Socket for the VoiceUDPSocket.
	 */
	private readonly socket: Socket;

	/**
	 * The socket details for Discord (remote).
	 */
	private readonly remote: SocketConfig;

	/**
	 * Creates a new VoiceUDPSocket.
	 *
	 * @param remote - Details of the remote socket
	 */
	public constructor(remote: SocketConfig) {
		super();
		this.socket = createSocket('udp4');
		this.socket.on('error', (error: Error) => this.emit('error', error));
		this.remote = remote;
	}

	/**
	 * Sends a buffer to Discord.
	 *
	 * @param buffer - The buffer to send
	 */
	public send(buffer: Buffer) {
		return this.socket.send(buffer, this.remote.port, this.remote.ip);
	}

	/**
	 * Closes the socket, the instance will not be able to be reused.
	 */
	public destroy() {
		this.socket.close();
	}

	/**
	 * Performs IP discovery to discover the local address and port to be used for the voice connection.
	 *
	 * @param ssrc - The SSRC received from Discord
	 */
	public performIPDiscovery(ssrc: number): Promise<SocketConfig> {
		return new Promise((resolve, reject) => {
			const listener = (message: Buffer) => {
				try {
					const packet = parseLocalPacket(message);
					this.socket.off('message', listener);
					resolve(packet);
				} catch {}
			};

			this.socket.on('message', listener);
			this.socket.once('close', () => reject(new Error('Cannot perform IP discovery - socket closed')));

			const discoveryBuffer = Buffer.alloc(70);
			discoveryBuffer.writeUInt32BE(ssrc, 0);
			this.send(discoveryBuffer);
		});
	}
}

/**
 * Parses the response from Discord to aid with local IP discovery.
 *
 * @param message - The received message
 */
export function parseLocalPacket(message: Buffer): SocketConfig {
	const packet = Buffer.from(message);

	const ip = packet.slice(4, packet.indexOf(0, 4)).toString('utf-8');

	if (!isIPv4(ip)) {
		throw new Error('Malformed IP address');
	}

	const port = packet.readUInt16LE(packet.length - 2);

	return { ip, port };
}
