import { VoiceOPCodes } from 'discord-api-types/v8';
import { SILENCE_FRAME } from '../audio/AudioPlayer';
import { ConnectionData, Networking, NetworkingState } from '../networking/Networking';
import { VoiceUDPSocket } from '../networking/VoiceUDPSocket';
import { VoiceWebSocket } from '../networking/VoiceWebSocket';
import { methods } from '../util/Secretbox';
import type { VoiceConnection } from '../VoiceConnection';
import { AudioReceiveStream } from './AudioReceiveStream';
import { SSRCMap } from './SSRCMap';

/**
 * Attaches to a VoiceConnection, allowing you to receive audio packets from other
 * users that are speaking.
 *
 * @beta
 */
export class VoiceReceiver {
	/**
	 * The attached connection of this receiver.
	 */
	public readonly voiceConnection;

	/**
	 * Maps SSRCs to Discord user IDs.
	 */
	public readonly ssrcMap: SSRCMap;

	/**
	 * The current audio subscriptions of this receiver.
	 */
	public readonly subscriptions: Map<number, AudioReceiveStream>;

	/**
	 * The connection information for this receiver. Used to decrypt incoming packets.
	 */
	private connectionData: Partial<ConnectionData>;

	public constructor(voiceConnection: VoiceConnection) {
		this.voiceConnection = voiceConnection;
		this.ssrcMap = new SSRCMap();
		this.subscriptions = new Map();
		this.connectionData = {};

		const onWsPacket = (packet: any) => this.onWsPacket(packet);
		const onUdpMessage = (msg: Buffer) => this.onUdpMessage(msg);

		// Bind listeners for updates
		const onNetworkingChange = (oldState: NetworkingState, newState: NetworkingState) => {
			const oldWs = Reflect.get(oldState, 'ws') as VoiceWebSocket | undefined;
			const oldUdp = Reflect.get(oldState, 'udp') as VoiceUDPSocket | undefined;
			const newWs = Reflect.get(newState, 'ws') as VoiceWebSocket | undefined;
			const newUdp = Reflect.get(newState, 'udp') as VoiceUDPSocket | undefined;

			const connectionData = Reflect.get(newState, 'connectionData') as Partial<ConnectionData> | undefined;
			if (connectionData) {
				this.connectionData = {
					...this.connectionData,
					...connectionData,
				};
				if (connectionData.packetsPlayed === 0) {
					this.voiceConnection.playOpusPacket(SILENCE_FRAME);
				}
			}

			if (newWs !== oldWs) {
				oldWs?.off('packet', onWsPacket);
				newWs?.on('packet', onWsPacket);
			}

			if (newUdp !== oldUdp) {
				oldUdp?.off('message', onUdpMessage);
				newUdp?.on('message', onUdpMessage);
			}
		};

		this.voiceConnection.on('stateChange', (oldState, newState) => {
			const oldNetworking: Networking | undefined = Reflect.get(oldState, 'networking');
			const newNetworking: Networking | undefined = Reflect.get(newState, 'networking');

			if (newNetworking !== oldNetworking) {
				oldNetworking?.off('stateChange', onNetworkingChange);
				newNetworking?.on('stateChange', onNetworkingChange);
				if (newNetworking) {
					const ws = Reflect.get(newNetworking.state, 'ws') as VoiceWebSocket | undefined;
					const udp = Reflect.get(newNetworking.state, 'udp') as VoiceUDPSocket | undefined;
					const connectionData = Reflect.get(newNetworking.state, 'connectionData') as
						| Partial<ConnectionData>
						| undefined;
					ws?.on('packet', onWsPacket);
					udp?.on('message', onUdpMessage);
					this.connectionData = {
						...this.connectionData,
						...connectionData,
					};
					if (this.connectionData.packetsPlayed === 0) {
						this.voiceConnection.playOpusPacket(SILENCE_FRAME);
					}
				}
			}
		});

		// Bind listeners for the existing state
		const networking: Networking | undefined = Reflect.get(voiceConnection.state, 'networking');
		if (networking) {
			const ws = Reflect.get(networking.state, 'ws') as VoiceWebSocket | undefined;
			const udp = Reflect.get(networking.state, 'udp') as VoiceUDPSocket | undefined;
			const connectionData = Reflect.get(networking.state, 'connectionData') as Partial<ConnectionData> | undefined;
			ws?.on('packet', onWsPacket);
			udp?.on('message', onUdpMessage);
			this.connectionData = connectionData ?? {};
			if (this.connectionData.packetsPlayed === 0) {
				this.voiceConnection.playOpusPacket(SILENCE_FRAME);
			}
		}
	}

	/**
	 * Called when a packet is received on the attached connection's WebSocket.
	 *
	 * @param packet The received packet
	 */
	private onWsPacket(packet: any) {
		if (packet.op === VoiceOPCodes.ClientDisconnect && typeof packet.d?.user_id === 'string') {
			this.ssrcMap.delete(packet.d.user_id);
		} else if (
			packet.op === VoiceOPCodes.Speaking &&
			typeof packet.d?.user_id === 'string' &&
			typeof packet.d?.ssrc === 'number'
		) {
			this.ssrcMap.update({ userId: packet.d.user_id, audioSSRC: packet.d.ssrc });
		} else if (
			packet.op === VoiceOPCodes.ClientConnect &&
			typeof packet.d?.user_id === 'string' &&
			typeof packet.d?.audio_ssrc === 'number'
		) {
			this.ssrcMap.update({
				userId: packet.d.user_id,
				audioSSRC: packet.d.audio_ssrc,
				videoSSRC: packet.d.video_ssrc === 0 ? undefined : packet.d.video_ssrc,
			});
		}
	}

	private decrypt(buffer: Buffer, mode: string, nonce: Buffer, secretKey: Uint8Array) {
		// Choose correct nonce depending on encryption
		let end;
		if (mode === 'xsalsa20_poly1305_lite') {
			buffer.copy(nonce, 0, buffer.length - 4);
			end = buffer.length - 4;
		} else if (mode === 'xsalsa20_poly1305_suffix') {
			buffer.copy(nonce, 0, buffer.length - 24);
			end = buffer.length - 24;
		} else {
			buffer.copy(nonce, 0, 0, 12);
		}

		// Open packet
		const decrypted = methods.open(buffer.slice(12, end), nonce, secretKey);
		if (!decrypted) return;
		return Buffer.from(decrypted);
	}

	/**
	 * Parses an audio packet, decrypting it to yield an Opus packet.
	 *
	 * @param buffer The buffer to parse
	 * @param mode The encryption mode
	 * @param nonce The nonce buffer used by the connection for encryption
	 * @param secretKey The secret key used by the connection for encryption
	 * @returns The parsed Opus packet
	 */
	private parsePacket(buffer: Buffer, mode: string, nonce: Buffer, secretKey: Uint8Array) {
		let packet = this.decrypt(buffer, mode, nonce, secretKey);
		if (!packet) return;

		// Strip RTP Header Extensions (one-byte only)
		if (packet[0] === 0xbe && packet[1] === 0xde && packet.length > 4) {
			const headerExtensionLength = packet.readUInt16BE(2);
			let offset = 4;
			for (let i = 0; i < headerExtensionLength; i++) {
				const byte = packet[offset];
				offset++;
				if (byte === 0) continue;
				offset += 1 + (byte >> 4);
			}
			// Skip over undocumented Discord byte (if present)
			const byte = packet.readUInt8(offset);
			if (byte === 0x00 || byte === 0x02) offset++;

			packet = packet.slice(offset);
		}

		return packet;
	}

	/**
	 * Called when the UDP socket of the attached connection receives a message.
	 *
	 * @param msg The received message
	 */
	private onUdpMessage(msg: Buffer) {
		if (msg.length <= 8) return;
		const ssrc = msg.readUInt32BE(8);
		const stream = this.subscriptions.get(ssrc);
		if (!stream) return;

		const userData = this.ssrcMap.get(ssrc);
		if (!userData) return;

		if (this.connectionData.encryptionMode && this.connectionData.nonceBuffer && this.connectionData.secretKey) {
			const packet = this.parsePacket(
				msg,
				this.connectionData.encryptionMode,
				this.connectionData.nonceBuffer,
				this.connectionData.secretKey,
			);
			if (packet) {
				stream.push(packet);
			} else {
				stream.destroy(new Error('Failed to parse packet'));
			}
		}
	}

	/**
	 * Creates a subscription for the given target, specified either by their SSRC or user ID.
	 *
	 * @param target The audio SSRC or user ID to subscribe to
	 * @returns A readable stream of Opus packets received from the target
	 */
	public subscribe(target: string | number) {
		const ssrc = this.ssrcMap.get(target)?.audioSSRC;
		if (!ssrc) {
			throw new Error(`No known SSRC for ${target}`);
		}

		const existing = this.subscriptions.get(ssrc);
		if (existing) return existing;

		const stream = new AudioReceiveStream();
		stream.once('close', () => this.subscriptions.delete(ssrc));
		this.subscriptions.set(ssrc, stream);
		return stream;
	}
}

/**
 * Creates a new voice receiver for the given voice connection.
 *
 * @param voiceConnection The voice connection to attach to
 * @beta
 * @remarks
 * Voice receive is an undocumented part of the Discord API - voice receive is not guaranteed
 * to be stable and may break without notice.
 */
export function createVoiceReceiver(voiceConnection: VoiceConnection) {
	return new VoiceReceiver(voiceConnection);
}
