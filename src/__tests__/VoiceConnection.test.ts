/* eslint-disable @typescript-eslint/dot-notation */
import {
	createVoiceConnection,
	VoiceConnection,
	VoiceConnectionConnectingState,
	VoiceConnectionSignallingState,
	VoiceConnectionStatus,
} from '../VoiceConnection';
import * as _DataStore from '../DataStore';
import * as _Networking from '../networking/Networking';
jest.mock('../DataStore');
jest.mock('../networking/Networking');

const DataStore = (_DataStore as unknown) as jest.Mocked<typeof _DataStore>;
const Networking = (_Networking as unknown) as jest.Mocked<typeof _Networking>;

function createFakeAdapter() {
	const sendPayload = jest.fn();
	const destroy = jest.fn();
	return {
		sendPayload,
		destroy,
		creator: jest.fn(() => ({
			sendPayload,
			destroy,
		})),
	};
}

function createJoinConfig() {
	return {
		channelId: '1',
		guildId: '2',
		selfDeaf: true,
		selfMute: false,
	};
}

function createFakeVoiceConnection() {
	const adapter = createFakeAdapter();
	const joinConfig = createJoinConfig();
	const voiceConnection = new VoiceConnection(joinConfig, {
		debug: false,
		adapterCreator: adapter.creator,
	});
	return { adapter, joinConfig, voiceConnection };
}

beforeEach(() => {
	DataStore.createJoinVoiceChannelPayload.mockReset();
	DataStore.getVoiceConnection.mockReset();
	DataStore.trackVoiceConnection.mockReset();
	DataStore.untrackVoiceConnection.mockReset();
});

describe('createVoiceConnection', () => {
	test('New voice connection', () => {
		const mockPayload = Symbol('mock') as any;
		DataStore.createJoinVoiceChannelPayload.mockImplementation(() => mockPayload);
		const adapter = createFakeAdapter();
		const joinConfig = createJoinConfig();
		const voiceConnection = createVoiceConnection(joinConfig, {
			debug: false,
			adapterCreator: adapter.creator,
		});
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
		expect(DataStore.getVoiceConnection).toHaveBeenCalledTimes(1);
		expect(DataStore.trackVoiceConnection).toHaveBeenCalledWith(joinConfig.guildId, voiceConnection);
		expect(DataStore.untrackVoiceConnection).not.toHaveBeenCalled();
		expect(adapter.sendPayload).toHaveBeenCalledWith(mockPayload);
	});

	test('Reconfiguring existing connection', () => {
		const mockPayload = Symbol('mock') as any;

		DataStore.createJoinVoiceChannelPayload.mockImplementation(() => mockPayload);

		const existingAdapter = createFakeAdapter();
		const existingJoinConfig = createJoinConfig();
		const existingVoiceConnection = new VoiceConnection(existingJoinConfig, {
			debug: false,
			adapterCreator: existingAdapter.creator,
		});

		const stateSetter = jest.spyOn(existingVoiceConnection, 'state', 'set');

		DataStore.getVoiceConnection.mockImplementation((guildId) =>
			guildId === existingJoinConfig.guildId ? existingVoiceConnection : null,
		);

		const newAdapter = createFakeAdapter();
		const newJoinConfig = createJoinConfig();
		const newVoiceConnection = createVoiceConnection(newJoinConfig, {
			debug: false,
			adapterCreator: newAdapter.creator,
		});
		expect(DataStore.getVoiceConnection).toHaveBeenCalledWith(newJoinConfig.guildId);
		expect(DataStore.trackVoiceConnection).not.toHaveBeenCalled();
		expect(DataStore.untrackVoiceConnection).not.toHaveBeenCalled();
		expect(newAdapter.creator).not.toHaveBeenCalled();
		expect(existingAdapter.sendPayload).toHaveBeenCalledWith(mockPayload);
		expect(newVoiceConnection).toBe(existingVoiceConnection);
		expect(stateSetter).not.toHaveBeenCalled();
	});
});

describe('VoiceConnection#addServerPacket', () => {
	test('Stores the packet and attempts to configure networking', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		voiceConnection.configureNetworking = jest.fn();
		const fake = Symbol('fake') as any;
		voiceConnection['addServerPacket'](fake);
		expect(voiceConnection['packets'].server).toBe(fake);
		expect(voiceConnection.configureNetworking).toHaveBeenCalled();
	});

	test('Overwrites existing packet', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		voiceConnection['packets'].server = Symbol('old') as any;
		voiceConnection.configureNetworking = jest.fn();
		const fake = Symbol('fake') as any;
		voiceConnection['addServerPacket'](fake);
		expect(voiceConnection['packets'].server).toBe(fake);
		expect(voiceConnection.configureNetworking).toHaveBeenCalled();
	});
});

describe('VoiceConnection#addStatePacket', () => {
	test('State is assigned to joinConfig', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		voiceConnection['addStatePacket']({
			self_deaf: true,
			self_mute: true,
			channel_id: '123',
		} as any);

		expect(voiceConnection.joinConfig).toMatchObject({
			selfDeaf: true,
			selfMute: true,
			channelId: '123',
		});

		voiceConnection['addStatePacket']({
			self_mute: false,
		} as any);

		expect(voiceConnection.joinConfig).toMatchObject({
			selfDeaf: true,
			selfMute: false,
			channelId: '123',
		});
	});
});

describe('VoiceConnection#configureNetworking', () => {
	test('Only creates Networking instance when both packets are present and not destroyed', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);

		voiceConnection.configureNetworking();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
		const adapter = (voiceConnection.state as VoiceConnectionSignallingState).adapter;

		const state = {
			session_id: 'abc',
			user_id: '123',
		} as any;

		const server = {
			endpoint: 'def',
			guild_id: '123',
			token: 'xyz',
		} as any;

		Object.assign(voiceConnection['packets'], { state, server: undefined });
		voiceConnection.configureNetworking();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
		expect(Networking.Networking).toHaveBeenCalledTimes(0);

		Object.assign(voiceConnection['packets'], { state: undefined, server });
		voiceConnection.configureNetworking();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
		expect(Networking.Networking).toHaveBeenCalledTimes(0);

		Object.assign(voiceConnection['packets'], { state, server });
		voiceConnection.state = { status: VoiceConnectionStatus.Destroyed };
		voiceConnection.configureNetworking();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Destroyed);
		expect(Networking.Networking).toHaveBeenCalledTimes(0);

		voiceConnection.state = { status: VoiceConnectionStatus.Signalling, adapter };
		voiceConnection.configureNetworking();
		expect(Networking.Networking).toHaveBeenCalledTimes(1);
		expect(Networking.Networking).toHaveBeenCalledWith(
			{
				endpoint: server.endpoint,
				serverID: server.guild_id,
				token: server.token,
				sessionID: state.session_id,
				userID: state.user_id,
			},
			false,
		);
		expect(voiceConnection.state).toMatchObject({
			status: VoiceConnectionStatus.Connecting,
			adapter,
		});
		expect(((voiceConnection.state as unknown) as VoiceConnectionConnectingState).networking).toBeInstanceOf(
			Networking.Networking,
		);
	});
});

describe('VoiceConnection#onNetworkingClose', () => {
	test('Does nothing in destroyed state', () => {
		const { voiceConnection, adapter } = createFakeVoiceConnection();
		voiceConnection.state = {
			status: VoiceConnectionStatus.Destroyed,
		};
		voiceConnection['onNetworkingClose'](1000);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Destroyed);
		expect(adapter.sendPayload).not.toHaveBeenCalled();
	});

	test('Disconnects for code 4014', () => {
		const { voiceConnection, adapter } = createFakeVoiceConnection();
		voiceConnection['onNetworkingClose'](4014);
		expect(voiceConnection.state).toMatchObject({
			status: VoiceConnectionStatus.Disconnected,
			closeCode: 4014,
		});
		expect(adapter.sendPayload).not.toHaveBeenCalled();
	});

	test('Attempts reconnect for codes != 4014', () => {
		const fakePayload = Symbol('fake') as any;
		const { voiceConnection, adapter, joinConfig } = createFakeVoiceConnection();
		DataStore.createJoinVoiceChannelPayload.mockImplementation((config) =>
			config === joinConfig ? fakePayload : undefined,
		);
		voiceConnection['onNetworkingClose'](1234);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
		expect(adapter.sendPayload).toHaveBeenCalledWith(fakePayload);
	});
});
