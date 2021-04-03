import EventEmitter from 'events';
import { NetworkingState, NetworkingStatusCode } from '../../../networking';
import { VoiceConnectionState, VoiceConnectionStatus } from '../../../VoiceConnection';

// State 1
const vcState1: VoiceConnectionState = {
	status: VoiceConnectionStatus.Signalling,
	adapter: {} as any,
};

export const state1 = {
	vc: vcState1,
};

// State 2
const ws1 = new EventEmitter() as any;
const networkingState2: NetworkingState = {
	code: NetworkingStatusCode.Identifying,
	connectionOptions: {} as any,
	ws: ws1,
};
const networking1 = new EventEmitter() as any;
networking1.state = networkingState2;
const vcState2: VoiceConnectionState = {
	status: VoiceConnectionStatus.Ready,
	networking: networking1,
	adapter: {} as any,
};

export const state2 = {
	vc: vcState2,
	networking: networkingState2,
};

// State 3
const ws2 = new EventEmitter() as any;
const udp1 = new EventEmitter() as any;
const networkingState3 = {
	code: NetworkingStatusCode.Ready,
	connectionData: {} as any,
	connectionOptions: {} as any,
	udp: udp1,
	ws: ws2,
};

export const state3 = {
	vc: vcState2,
	networking: networkingState3,
};
