import { VoiceOPCodes } from 'discord-api-types/v8/gateway';
import { EventEmitter } from 'events';
import { VoiceUDPSocket } from './VoiceUDPSocket';
import { VoiceWebSocket } from './VoiceWebSocket';
import * as secretbox from '../util/Secretbox';
import { noop } from '../util/util';

// The number of audio channels required by Discord
const CHANNELS = 2;
const TIMESTAMP_INC = (48000 / 100) * CHANNELS;
const MAX_NONCE_SIZE = (2 ** 32) - 1;

const SUPPORTED_ENCRYPTION_MODES = [
	'xsalsa20_poly1305_lite',
	'xsalsa20_poly1305_suffix',
	'xsalsa20_poly1305'
];

/**
 * The different statuses that a networking instance can hold. The order
 * of the states between OpeningWs and Ready is chronological (first the
 * instance enters OpeningWs, then it enters Identifying etc.)
 */
export enum NetworkingStatusCode {
	OpeningWs,
	Identifying,
	UdpHandshaking,
	SelectingProtocol,
	Ready,
	Resuming,
	Closed
}

/**
 * The various states that a networking instance can be in.
 */
export type NetworkingState = {
	code: NetworkingStatusCode.OpeningWs | NetworkingStatusCode.Identifying;
	ws: VoiceWebSocket;
	connectionOptions: ConnectionOptions;
} | {
	code: NetworkingStatusCode.UdpHandshaking | NetworkingStatusCode.SelectingProtocol;
	ws: VoiceWebSocket;
	udp: VoiceUDPSocket;
	connectionOptions: ConnectionOptions;
	connectionData: Pick<ConnectionData, 'ssrc'>;
} | {
	code: NetworkingStatusCode.Ready | NetworkingStatusCode.Resuming;
	ws: VoiceWebSocket;
	udp: VoiceUDPSocket;
	connectionOptions: ConnectionOptions;
	connectionData: ConnectionData;
	preparedPacket?: Buffer;
} | {
	code: NetworkingStatusCode.Closed;
};

/**
 * Details required to connect to the Discord voice gateway. These details
 * are first received on the main bot gateway, in the form of VOICE_SERVER_UPDATE
 * and VOICE_STATE_UPDATE packets.
 */
interface ConnectionOptions {
	serverID: string;
	userID: string;
	sessionID: string;
	token: string;
	endpoint: string;
}

/**
 * Information about the current connection, e.g. which encryption mode is to be used on
 * the connection, timing information for playback of streams.
 */
interface ConnectionData {
	ssrc: number;
	encryptionMode: string;
	secretKey: Uint8Array;
	sequence: number;
	timestamp: number;
	nonce: number;
	nonceBuffer: Buffer;
	speaking: boolean;
}

/**
 * An empty buffer that is reused in packet encryption by many different networking instances.
 */
const nonce = Buffer.alloc(24);

/**
 * Manages the networking required to maintain a voice connection and dispatch audio packets
 */
export class Networking extends EventEmitter {
	private _state: NetworkingState;

	/**
	 * The debug logger function, if debugging is enabled.
	 */
	private readonly debug: null | ((message: string) => void);

	/**
	 * Creates a new Networking instance.
	 *
	 * @param options - Connection options
	 * @param debug - Whether to emit debug messages
	 */
	public constructor(options: ConnectionOptions, debug: boolean) {
		super();

		this.onWsOpen = this.onWsOpen.bind(this);
		this.onChildError = this.onChildError.bind(this);
		this.onWsPacket = this.onWsPacket.bind(this);
		this.onWsClose = this.onWsClose.bind(this);
		this.onWsDebug = this.onWsDebug.bind(this);

		this.debug = debug ? this.emit.bind(this, 'debug') : null;

		this._state = {
			code: NetworkingStatusCode.OpeningWs,
			ws: this.createWebSocket(options.endpoint),
			connectionOptions: options
		};
	}

	/**
	 * Destroys the Networking instance, transitioning it into the Closed state.
	 */
	public destroy() {
		this.state = {
			code: NetworkingStatusCode.Closed
		};
	}

	/**
	 * The current state of the networking instance.
	 */
	public get state(): NetworkingState {
		return this._state;
	}

	/**
	 * Sets a new state for the networking instance, performing clean-up operations where necessary.
	 */
	public set state(newState: NetworkingState) {
		const oldWs = Reflect.get(this._state, 'ws') as VoiceWebSocket|undefined;
		const newWs = Reflect.get(newState, 'ws') as VoiceWebSocket|undefined;
		if (oldWs && oldWs !== newWs) {
			// The old WebSocket is being freed - remove all handlers from it
			oldWs.off('debug', this.onWsDebug);
			oldWs.on('error', noop);
			oldWs.off('error', this.onChildError);
			oldWs.off('open', this.onWsOpen);
			oldWs.off('packet', this.onWsPacket);
			oldWs.off('close', this.onWsClose);
			oldWs.destroy();
		}

		const oldUdp = Reflect.get(this._state, 'udp') as VoiceUDPSocket|undefined;
		const newUdp = Reflect.get(newState, 'udp') as VoiceUDPSocket|undefined;

		if (oldUdp && oldUdp !== newUdp) {
			oldUdp.on('error', noop);
			oldUdp.off('error', this.onChildError);
			oldUdp.destroy();
		}

		const oldState = this._state;
		this._state = newState;
		this.emit('stateChange', oldState, newState);

		/**
		 * Debug event for Networking.
		 *
		 * @event Networking#debug
		 * @type {string}
		 */
		this.debug?.(`state change:\nfrom ${stringifyState(oldState)}\nto ${stringifyState(newState)}`);
	}

	/**
	 * Creates a new WebSocket to a Discord Voice gateway.
	 *
	 * @param endpoint - The endpoint to connect to
	 */
	private createWebSocket(endpoint: string) {
		const ws = new VoiceWebSocket(`wss://${endpoint}?v=4`, Boolean(this.debug));

		ws.on('error', this.onChildError);
		ws.once('open', this.onWsOpen);
		ws.on('packet', this.onWsPacket);
		ws.once('close', this.onWsClose);
		ws.on('debug', this.onWsDebug);

		return ws;
	}

	/**
	 * Propagates errors from the children VoiceWebSocket and VoiceUDPSocket.
	 *
	 * @param error - The error that was emitted by a child
	 */
	private onChildError(error: Error) {
		this.emit('error', error);
	}

	/**
	 * Called when the WebSocket opens. Depending on the state that the instance is in,
	 * it will either identify with a new session, or it will attempt to resume an existing session.
	 */
	private onWsOpen() {
		if (this.state.code === NetworkingStatusCode.OpeningWs) {
			const packet = {
				op: VoiceOPCodes.Identify,
				d: {
					server_id: this.state.connectionOptions.serverID,
					user_id: this.state.connectionOptions.userID,
					session_id: this.state.connectionOptions.sessionID,
					token: this.state.connectionOptions.token
				}
			};
			this.state.ws.sendPacket(packet);
			this.state = {
				...this.state,
				code: NetworkingStatusCode.Identifying
			};
		} else if (this.state.code === NetworkingStatusCode.Resuming) {
			const packet = {
				op: VoiceOPCodes.Resume,
				d: {
					server_id: this.state.connectionOptions.serverID,
					session_id: this.state.connectionOptions.sessionID,
					token: this.state.connectionOptions.token
				}
			};
			this.state.ws.sendPacket(packet);
		}
	}

	/**
	 * Called when the WebSocket closes. Based on the reason for closing (given by the code parameter),
	 * the instance will either attempt to resume, or enter the closed state and emit a 'close' event
	 * with the close code, allowing the user to decide whether or not they would like to reconnect.
	 *
	 * @param code - The close code
	 */
	private onWsClose(code: number) {
		const canResume = code === 4015 || code < 4000;
		if (canResume && this.state.code === NetworkingStatusCode.Ready) {
			this.state = {
				...this.state,
				code: NetworkingStatusCode.Resuming,
				ws: this.createWebSocket(this.state.connectionOptions.endpoint)
			};
		} else if (this.state.code !== NetworkingStatusCode.Closed) {
			this.destroy();
			this.emit('close', code);
		}
	}

	/**
	 * Called when a packet is received on the connection's WebSocket
	 *
	 * @param packet - The received packet
	 */
	private onWsPacket(packet: any) {
		if (packet.op === VoiceOPCodes.Hello && this.state.code !== NetworkingStatusCode.Closed) {
			this.state.ws.setHeartbeatInterval(packet.d.heartbeat_interval);
		} else if (packet.op === VoiceOPCodes.Ready && this.state.code === NetworkingStatusCode.Identifying) {
			const { ip, port, ssrc, modes } = packet.d;

			const udp = new VoiceUDPSocket({ ip, port });
			udp.on('error', this.onChildError);
			udp.performIPDiscovery(ssrc)
				.then(localConfig => {
					if (this.state.code !== NetworkingStatusCode.UdpHandshaking) return;
					this.state.ws.sendPacket({
						op: VoiceOPCodes.SelectProtocol,
						d: {
							protocol: 'udp',
							data: {
								address: localConfig.ip,
								port: localConfig.port,
								mode: chooseEncryptionMode(modes)
							}
						}
					});
					this.state = {
						...this.state,
						code: NetworkingStatusCode.SelectingProtocol
					};
				})
				.catch(error => this.emit('error', error));

			this.state = {
				...this.state,
				code: NetworkingStatusCode.UdpHandshaking,
				udp,
				connectionData: {
					ssrc
				}
			};
		} else if (packet.op === VoiceOPCodes.SessionDescription && this.state.code === NetworkingStatusCode.SelectingProtocol) {
			const { mode: encryptionMode, secret_key: secretKey } = packet.d;
			this.state = {
				...this.state,
				code: NetworkingStatusCode.Ready,
				connectionData: {
					...this.state.connectionData,
					encryptionMode,
					secretKey: new Uint8Array(secretKey),
					sequence: randomNBit(16),
					timestamp: randomNBit(32),
					nonce: 0,
					nonceBuffer: Buffer.alloc(24),
					speaking: false
				}
			};
		} else if (packet.op === VoiceOPCodes.Resumed && this.state.code === NetworkingStatusCode.Resuming) {
			this.state = {
				...this.state,
				code: NetworkingStatusCode.Ready
			};
			this.state.connectionData.speaking = false;
		}
	}

	/**
	 * Propagates debug messages from the child WebSocket.
	 *
	 * @param message - The emitted debug message
	 */
	private onWsDebug(message: string) {
		this.debug?.(`[WS] ${message}`);
	}

	/**
	 * Prepares an Opus packet for playback. This includes attaching metadata to it and encrypting it.
	 * It will be stored within the instance, and can be played by dispatchAudio().
	 *
	 * Calling this method while there is already a prepared audio packet that has not yet been dispatched
	 * will overwrite the existing audio packet. This should be avoided.
	 *
	 * @param opusPacket - The Opus packet to encrypt
	 *
	 * @returns The audio packet that was prepared.
	 */
	public prepareAudioPacket(opusPacket: Buffer) {
		const state = this.state;
		if (state.code !== NetworkingStatusCode.Ready) return;
		state.preparedPacket = Networking.createAudioPacket(opusPacket, state.connectionData);
		return state.preparedPacket;
	}

	/**
	 * Dispatches the audio packet previously prepared by prepareAudioPacket(opusPacket). The audio packet
	 * is consumed and cannot be dispatched again.
	 */
	public dispatchAudio() {
		const state = this.state;
		if (state.code !== NetworkingStatusCode.Ready) return false;
		if (typeof state.preparedPacket !== 'undefined') {
			this.playAudioPacket(state.preparedPacket);
			state.preparedPacket = undefined;
			return true;
		}
		return false;
	}

	/**
	 * Plays an audio packet, updating timing metadata used for playback.
	 *
	 * @param audioPacket - The audio packet to play
	 */
	private playAudioPacket(audioPacket: Buffer) {
		const state = this.state;
		if (state.code !== NetworkingStatusCode.Ready) return;
		const { connectionData } = state;
		connectionData.sequence++;
		connectionData.timestamp += TIMESTAMP_INC;
		if (connectionData.sequence >= 2 ** 16) connectionData.sequence = 0;
		if (connectionData.timestamp >= 2 ** 32) connectionData.timestamp = 0;
		this.setSpeaking(true);
		state.udp.send(audioPacket);
	}

	/**
	 * Sends a packet to the voice gateway indicating that the client has start/stopped sending
	 * audio.
	 *
	 * @param speaking - Whether or not the client should be shown as speaking
	 */
	public setSpeaking(speaking: boolean) {
		const state = this.state;
		if (state.code !== NetworkingStatusCode.Ready) return;
		if (state.connectionData.speaking === speaking) return;
		state.connectionData.speaking = speaking;
		state.ws
			.sendPacket({
				op: VoiceOPCodes.Speaking,
				d: {
					speaking: speaking ? 1 : 0,
					delay: 0,
					ssrc: state.connectionData.ssrc
				}
			});
	}

	/**
	 * Creates a new audio packet from an Opus packet. This involves encrypting the packet,
	 * then prepending a header that includes metadata.
	 *
	 * @param opusPacket - The Opus packet to prepare
	 * @param connectionData - The current connection data of the instance
	 */
	private static createAudioPacket(opusPacket: Buffer, connectionData: ConnectionData) {
		const packetBuffer = Buffer.alloc(12);
		packetBuffer[0] = 0x80;
		packetBuffer[1] = 0x78;

		const { sequence, timestamp, ssrc } = connectionData;

		packetBuffer.writeUIntBE(sequence, 2, 2);
		packetBuffer.writeUIntBE(timestamp, 4, 4);
		packetBuffer.writeUIntBE(ssrc, 8, 4);

		packetBuffer.copy(nonce, 0, 0, 12);
		return Buffer.concat([packetBuffer, ...Networking.encryptOpusPacket(opusPacket, connectionData)]);
	}

	/**
	 * Encrypts an Opus packet using the format agreed upon by the instance and Discord.
	 *
	 * @param opusPacket - The Opus packet to encrypt
	 * @param connectionData - The current connection data of the instance
	 */
	private static encryptOpusPacket(opusPacket: Buffer, connectionData: ConnectionData) {
		const { secretKey, encryptionMode } = connectionData;

		if (encryptionMode === 'xsalsa20_poly1305_lite') {
			connectionData.nonce++;
			if (connectionData.nonce > MAX_NONCE_SIZE) connectionData.nonce = 0;
			connectionData.nonceBuffer.writeUInt32BE(connectionData.nonce, 0);
			return [secretbox.methods.close(opusPacket, connectionData.nonceBuffer, secretKey), connectionData.nonceBuffer.slice(0, 4)];
		} else if (encryptionMode === 'xsalsa20_poly1305_suffix') {
			const random = secretbox.methods.random(24, connectionData.nonceBuffer);
			return [secretbox.methods.close(opusPacket, random, secretKey), random];
		}
		return [secretbox.methods.close(opusPacket, nonce, secretKey)];
	}
}

/**
 * Returns a random number that is in the range of n bits.
 *
 * @param n - The number of bits
 */
function randomNBit(n: number) {
	return Math.floor(Math.random() * (2 ** n));
}

/**
 * Stringifies a NetworkingState
 *
 * @param state - The state to stringify
 */
function stringifyState(state: NetworkingState) {
	return JSON.stringify({
		...state,
		ws: Reflect.has(state, 'ws'),
		udp: Reflect.has(state, 'udp')
	});
}

/**
 * Chooses an encryption mode from a list of given options. Chooses the most preferred option.
 *
 * @param options - The available encryption options
 */
function chooseEncryptionMode(options: string[]): string {
	const option = options.find(option => SUPPORTED_ENCRYPTION_MODES.includes(option));
	if (!option) {
		throw new Error(`No compatible encryption modes. Available include: ${options.join(', ')}`);
	}
	return option;
}
