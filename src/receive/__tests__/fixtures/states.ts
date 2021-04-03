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
const networkingState2: NetworkingState = {
	code: NetworkingStatusCode.Identifying,
	connectionOptions: {} as any,
	ws: new EventEmitter() as any,
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
const networkingState3 = {
	code: NetworkingStatusCode.Ready,
	connectionData: {} as any,
	connectionOptions: {} as any,
	udp: new EventEmitter() as any,
	ws: new EventEmitter() as any,
};

export const state3 = {
	vc: vcState2,
	networking: networkingState3,
};

// State 4
const networking2 = new EventEmitter() as any;
const networkingState4 = {
	code: NetworkingStatusCode.Ready,
	connectionData: {
		packetsPlayed: 0,
	} as any,
	connectionOptions: {} as any,
	udp: new EventEmitter() as any,
	ws: new EventEmitter() as any,
};
networking2.state = networkingState4;

const vcState4: VoiceConnectionState = {
	status: VoiceConnectionStatus.Ready,
	networking: networking2,
	adapter: {} as any,
};

export const state4 = {
	vc: vcState4,
	networking: networkingState4,
};
