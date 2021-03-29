import { VoiceOPCodes } from 'discord-api-types/v8';
import { ConnectionData, Networking, NetworkingState } from '../networking/Networking';
import { VoiceUDPSocket } from '../networking/VoiceUDPSocket';
import { VoiceWebSocket } from '../networking/VoiceWebSocket';
import { methods } from '../util/Secretbox';
import type { VoiceConnection } from '../VoiceConnection';

export class VoiceReceiver {
	public readonly voiceConnection;

	/**
	 * Maps SSRCs to user IDs
	 */
	public readonly ssrcMap: Map<number, string>;

	private connectionData: Partial<ConnectionData>;

	public constructor(voiceConnection: VoiceConnection) {
		this.voiceConnection = voiceConnection;
		this.ssrcMap = new Map();
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
			}

			if (newWs !== oldWs) {
				oldWs?.off('packet', onWsPacket);
				newWs?.on('packet', onWsPacket);
			}

			if (newUdp !== oldUdp) {
				oldUdp?.off('message', onUdpMessage);
				oldUdp?.on('message', onUdpMessage);
			}
		};

		this.voiceConnection.on('stateChange', (oldState, newState) => {
			const oldNetworking: Networking | undefined = Reflect.get(oldState, 'networking');
			const newNetworking: Networking | undefined = Reflect.get(newState, 'networking');

			if (newNetworking !== oldNetworking) {
				oldNetworking?.off('stateChange', onNetworkingChange);
				oldNetworking?.on('stateChange', onNetworkingChange);
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
			this.connectionData = {
				...this.connectionData,
				...connectionData,
			};
		}
	}

	private onWsPacket(packet: any) {
		if (packet?.op === VoiceOPCodes.ClientDisconnect && typeof packet.d?.user_id === 'string') {
			this.ssrcMap.forEach((userID, ssrc) => {
				if (userID === packet.d.user_id) {
					this.ssrcMap.delete(ssrc);
				}
			});
		} else if (packet.d) {
			const ssrc = packet.d.ssrc ?? packet.d.audio_ssrc;
			const userID = packet.d.user_id;
			if (typeof ssrc === 'number' && typeof userID === 'string') {
				this.ssrcMap.set(ssrc, userID);
			}
		}
	}

	private parseBuffer(buffer: Buffer, mode: string, nonce: Buffer, secretKey: Uint8Array) {
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
		let packet = Buffer.from(decrypted);

		// Strip RTP Header Extensions (one-byte only)
		if (packet[0] === 0xbe && packet[1] === 0xde && packet.length > 4) {
			const headerExtensionLength = packet.readUInt16BE(2);
			let offset = 4;
			for (let i = 0; i < headerExtensionLength; i++) {
				const byte = packet[offset];
				offset++;
				if (byte === 0) continue;
				offset += 1 + (0b1111 & (byte >> 4));
			}
			// Skip over undocumented Discord byte
			offset++;

			packet = packet.slice(offset);
		}

		return packet;
	}

	private onUdpMessage(msg: Buffer) {
		if (this.connectionData.encryptionMode && this.connectionData.nonceBuffer && this.connectionData.secretKey) {
			this.parseBuffer(
				msg,
				this.connectionData.encryptionMode,
				this.connectionData.nonceBuffer,
				this.connectionData.secretKey,
			);
		}
	}
}

export function createVoiceReceiver(voiceConnection: VoiceConnection) {
	return new VoiceReceiver(voiceConnection);
}
