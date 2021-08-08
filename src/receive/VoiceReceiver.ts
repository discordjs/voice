import { VoiceOpcodes } from 'discord-api-types/voice/v4';
import { ConnectionData } from '../networking/Networking';
import { methods } from '../util/Secretbox';
import type { VoiceConnection } from '../VoiceConnection';
import {
	AudioReceiveStream,
	AudioReceiveStreamOptions,
	createDefaultAudioReceiveStreamOptions,
} from './AudioReceiveStream';
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
	public readonly subscriptions: Map<string, AudioReceiveStream>;

	/**
	 * The connection data of the receiver
	 * @internal
	 */
	public connectionData: Partial<ConnectionData>;

	public constructor(voiceConnection: VoiceConnection) {
		this.voiceConnection = voiceConnection;
		this.ssrcMap = new SSRCMap();
		this.subscriptions = new Map();
		this.connectionData = {};

		this.onWsPacket = this.onWsPacket.bind(this);
		this.onUdpMessage = this.onUdpMessage.bind(this);
	}

	/**
	 * Called when a packet is received on the attached connection's WebSocket.
	 *
	 * @param packet The received packet
	 * @internal
	 */
	public onWsPacket(packet: any) {
		if (packet.op === VoiceOpcodes.ClientDisconnect && typeof packet.d?.user_id === 'string') {
			this.ssrcMap.delete(packet.d.user_id);
		} else if (
			packet.op === VoiceOpcodes.Speaking &&
			typeof packet.d?.user_id === 'string' &&
			typeof packet.d?.ssrc === 'number'
		) {
			this.ssrcMap.update({ userId: packet.d.user_id, audioSSRC: packet.d.ssrc });
		} else if (
			packet.op === VoiceOpcodes.ClientConnect &&
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
	 * @internal
	 */
	public onUdpMessage(msg: Buffer) {
		if (msg.length <= 8) return;
		const ssrc = msg.readUInt32BE(8);
		const userId = this.ssrcMap.get(ssrc)?.userId;
		if (!userId) return;
		const stream = this.subscriptions.get(userId);
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
	 * Creates a subscription for the given user ID.
	 *
	 * @param target The ID of the user to subscribe to
	 * @returns A readable stream of Opus packets received from the target
	 */
	public subscribe(userId: string, options?: Partial<AudioReceiveStreamOptions>) {
		const existing = this.subscriptions.get(userId);
		if (existing) return existing;

		const stream = new AudioReceiveStream({
			...createDefaultAudioReceiveStreamOptions(),
			...options,
		});

		stream.once('close', () => this.subscriptions.delete(userId));
		this.subscriptions.set(userId, stream);
		return stream;
	}
}
