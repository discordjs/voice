import type { Networking, NetworkingState } from '../networking/Networking';
import { VoiceUDPSocket } from '../networking/VoiceUDPSocket';
import { VoiceWebSocket } from '../networking/VoiceWebSocket';
import type { VoiceConnection } from '../VoiceConnection';

export class VoiceReceiver {
	public readonly voiceConnection;

	public constructor(voiceConnection: VoiceConnection) {
		this.voiceConnection = voiceConnection;

		const onWsPacket = (packet: any) => this.onWsPacket(packet);
		const onUdpMessage = (msg: Buffer) => this.onUdpMessage(msg);

		// Bind listeners for updates
		const onNetworkingChange = (oldState: NetworkingState, newState: NetworkingState) => {
			const oldWs = Reflect.get(oldState, 'ws') as VoiceWebSocket | undefined;
			const oldUdp = Reflect.get(oldState, 'udp') as VoiceUDPSocket | undefined;
			const newWs = Reflect.get(newState, 'ws') as VoiceWebSocket | undefined;
			const newUdp = Reflect.get(newState, 'udp') as VoiceUDPSocket | undefined;

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
			ws?.on('packet', onWsPacket);
			udp?.on('message', onUdpMessage);
		}
	}

	private onWsPacket(packet: any) {
		console.log(packet);
	}

	private onUdpMessage(msg: Buffer) {
		console.log(msg);
	}
}

export function createVoiceReceiver(voiceConnection: VoiceConnection) {
	return new VoiceReceiver(voiceConnection);
}
