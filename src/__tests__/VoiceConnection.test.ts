/* eslint-disable @typescript-eslint/dot-notation */
import { createVoiceConnection, VoiceConnection, VoiceConnectionStatus } from '../VoiceConnection';
import * as _DataStore from '../DataStore';
jest.mock('../DataStore');

const DataStore = (_DataStore as unknown) as jest.Mocked<typeof _DataStore>;

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
		const adapter = createFakeAdapter();
		const joinConfig = createJoinConfig();
		const voiceConnection = new VoiceConnection(joinConfig, {
			debug: false,
			adapterCreator: adapter.creator,
		});
		voiceConnection.configureNetworking = jest.fn();
		const fake = Symbol('fake') as any;
		voiceConnection['addServerPacket'](fake);
		expect(voiceConnection['packets'].server).toBe(fake);
		expect(voiceConnection.configureNetworking).toHaveBeenCalled();
	});

	test('Overwrites existing packet', () => {
		const adapter = createFakeAdapter();
		const joinConfig = createJoinConfig();
		const voiceConnection = new VoiceConnection(joinConfig, {
			debug: false,
			adapterCreator: adapter.creator,
		});
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
		const adapter = createFakeAdapter();
		const joinConfig = createJoinConfig();
		const voiceConnection = new VoiceConnection(joinConfig, {
			debug: false,
			adapterCreator: adapter.creator,
		});

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
