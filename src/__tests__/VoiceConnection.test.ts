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
import * as _AudioPlayer from '../audio/AudioPlayer';
import { PlayerSubscription as _PlayerSubscription } from '../audio/PlayerSubscription';
import type { DiscordGatewayAdapterLibraryMethods } from '../util/adapter';
jest.mock('../audio/AudioPlayer');
jest.mock('../audio/PlayerSubscription');
jest.mock('../DataStore');
jest.mock('../networking/Networking');

const DataStore = (_DataStore as unknown) as jest.Mocked<typeof _DataStore>;
const Networking = (_Networking as unknown) as jest.Mocked<typeof _Networking>;
const AudioPlayer = (_AudioPlayer as unknown) as jest.Mocked<typeof _AudioPlayer>;
const PlayerSubscription = (_PlayerSubscription as unknown) as jest.Mock<_PlayerSubscription>;

function createFakeAdapter() {
	const sendPayload = jest.fn();
	const destroy = jest.fn();
	const libMethods: Partial<DiscordGatewayAdapterLibraryMethods> = {};
	return {
		sendPayload,
		destroy,
		libMethods,
		creator: jest.fn((methods) => {
			Object.assign(libMethods, methods);
			return {
				sendPayload,
				destroy,
			};
		}),
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
		const dummy = {
			endpoint: 'discord.com',
			guild_id: 123,
			token: 'abc',
		} as any;
		voiceConnection['addServerPacket'](dummy);
		expect(voiceConnection['packets'].server).toBe(dummy);
		expect(voiceConnection.configureNetworking).toHaveBeenCalled();
	});

	test('Overwrites existing packet', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		voiceConnection['packets'].server = Symbol('old') as any;
		voiceConnection.configureNetworking = jest.fn();
		const dummy = {
			endpoint: 'discord.com',
			guild_id: 123,
			token: 'abc',
		} as any;
		voiceConnection['addServerPacket'](dummy);
		expect(voiceConnection['packets'].server).toBe(dummy);
		expect(voiceConnection.configureNetworking).toHaveBeenCalled();
	});

	test('Disconnects when given a null endpoint', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		voiceConnection['packets'].server = Symbol('old') as any;
		voiceConnection.configureNetworking = jest.fn();
		const dummy = {
			endpoint: null,
			guild_id: 123,
			token: 'abc',
		} as any;
		voiceConnection['addServerPacket'](dummy);
		expect(voiceConnection['packets'].server).toBe(dummy);
		expect(voiceConnection.configureNetworking).not.toHaveBeenCalled();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Disconnected);
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
		const dummyPayload = Symbol('dummy') as any;
		const { voiceConnection, adapter, joinConfig } = createFakeVoiceConnection();
		DataStore.createJoinVoiceChannelPayload.mockImplementation((config) =>
			config === joinConfig ? dummyPayload : undefined,
		);
		voiceConnection['onNetworkingClose'](1234);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
		expect(adapter.sendPayload).toHaveBeenCalledWith(dummyPayload);
		expect(voiceConnection.reconnectAttempts).toBe(1);
	});
});

describe('VoiceConnection#onNetworkingStateChange', () => {
	test('Does nothing when status code identical', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const stateSetter = jest.spyOn(voiceConnection, 'state', 'set');
		voiceConnection['onNetworkingStateChange'](
			{ code: _Networking.NetworkingStatusCode.Ready } as any,
			{ code: _Networking.NetworkingStatusCode.Ready } as any,
		);
		voiceConnection['onNetworkingStateChange'](
			{ code: _Networking.NetworkingStatusCode.Closed } as any,
			{ code: _Networking.NetworkingStatusCode.Closed } as any,
		);
		expect(stateSetter).not.toHaveBeenCalled();
	});

	test('Does nothing when not in Ready or Connecting states', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const stateSetter = jest.spyOn(voiceConnection, 'state', 'set');
		const call = [
			{ code: _Networking.NetworkingStatusCode.Ready } as any,
			{ code: _Networking.NetworkingStatusCode.Closed } as any,
		];
		voiceConnection['_state'] = { status: VoiceConnectionStatus.Signalling } as any;
		voiceConnection['onNetworkingStateChange'](call[0], call[1]);
		voiceConnection['_state'] = { status: VoiceConnectionStatus.Disconnected } as any;
		voiceConnection['onNetworkingStateChange'](call[0], call[1]);
		voiceConnection['_state'] = { status: VoiceConnectionStatus.Destroyed } as any;
		voiceConnection['onNetworkingStateChange'](call[0], call[1]);
		expect(stateSetter).not.toHaveBeenCalled();
	});

	test('Transitions to Ready', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const stateSetter = jest.spyOn(voiceConnection, 'state', 'set');
		voiceConnection['_state'] = {
			...(voiceConnection.state as VoiceConnectionSignallingState),
			status: VoiceConnectionStatus.Connecting,
			networking: new Networking.Networking({} as any, false),
		};

		voiceConnection['onNetworkingStateChange'](
			{ code: _Networking.NetworkingStatusCode.Closed } as any,
			{ code: _Networking.NetworkingStatusCode.Ready } as any,
		);

		expect(stateSetter).toHaveBeenCalledTimes(1);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Ready);
	});

	test('Transitions to Connecting', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const stateSetter = jest.spyOn(voiceConnection, 'state', 'set');
		voiceConnection['_state'] = {
			...(voiceConnection.state as VoiceConnectionSignallingState),
			status: VoiceConnectionStatus.Connecting,
			networking: new Networking.Networking({} as any, false),
		};

		voiceConnection['onNetworkingStateChange'](
			{ code: _Networking.NetworkingStatusCode.Ready } as any,
			{ code: _Networking.NetworkingStatusCode.Identifying } as any,
		);

		expect(stateSetter).toHaveBeenCalledTimes(1);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Connecting);
	});
});

describe('VoiceConnection#destroy', () => {
	test('Throws when in Destroyed state', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		voiceConnection.state = { status: VoiceConnectionStatus.Destroyed };
		expect(() => voiceConnection.destroy()).toThrow();
	});

	test('Cleans up in a valid, destroyable state', () => {
		const { voiceConnection, joinConfig, adapter } = createFakeVoiceConnection();
		DataStore.getVoiceConnection.mockImplementation((guildId) =>
			joinConfig.guildId === guildId ? voiceConnection : undefined,
		);
		const dummy = Symbol('dummy');
		DataStore.createJoinVoiceChannelPayload.mockImplementation(() => dummy as any);
		voiceConnection.destroy();
		expect(DataStore.getVoiceConnection).toHaveReturnedWith(voiceConnection);
		expect(DataStore.untrackVoiceConnection).toHaveBeenCalledWith(joinConfig.guildId);
		expect(DataStore.createJoinVoiceChannelPayload.mock.calls[0][0]).toMatchObject({
			channelId: null,
			guildId: joinConfig.guildId,
		});
		expect(adapter.sendPayload).toHaveBeenCalledWith(dummy);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Destroyed);
	});
});

describe('VoiceConnection#reconnect', () => {
	test('Does nothing in a non-disconnected state', () => {
		const { voiceConnection, adapter } = createFakeVoiceConnection();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
		expect(voiceConnection.reconnect()).toBe(false);
		expect(voiceConnection.reconnectAttempts).toBe(0);
		expect(adapter.sendPayload).not.toHaveBeenCalled();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
	});

	test('Reconnects in a disconnected state', () => {
		const dummy = Symbol('dummy') as any;
		DataStore.createJoinVoiceChannelPayload.mockImplementation(() => dummy);

		const { voiceConnection, adapter } = createFakeVoiceConnection();
		voiceConnection.state = {
			...(voiceConnection.state as VoiceConnectionSignallingState),
			status: VoiceConnectionStatus.Disconnected,
			closeCode: 1000,
		};
		expect(voiceConnection.reconnect()).toBe(true);
		expect(voiceConnection.reconnectAttempts).toBe(1);
		expect(adapter.sendPayload).toHaveBeenCalledWith(dummy);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Signalling);
	});
});

describe('VoiceConnection#subscribe', () => {
	test('Does nothing in Destroyed state', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const player = new AudioPlayer.AudioPlayer();
		player['subscribe'] = jest.fn();
		voiceConnection.state = { status: VoiceConnectionStatus.Destroyed };
		expect(voiceConnection.subscribe(player)).toBeUndefined();
		expect(player['subscribe']).not.toHaveBeenCalled();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Destroyed);
	});

	test('Subscribes in a live state', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const adapter = (voiceConnection.state as VoiceConnectionSignallingState).adapter;
		const player = new AudioPlayer.AudioPlayer();
		const dummy = Symbol('dummy');
		player['subscribe'] = jest.fn().mockImplementation(() => dummy);
		expect(voiceConnection.subscribe(player)).toBe(dummy);
		expect(player['subscribe']).toHaveBeenCalledWith(voiceConnection);
		expect(voiceConnection.state).toMatchObject({
			status: VoiceConnectionStatus.Signalling,
			adapter,
		});
	});
});

describe('VoiceConnection#onSubscriptionRemoved', () => {
	test('Does nothing in Destroyed state', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const subscription = new PlayerSubscription(voiceConnection, new AudioPlayer.AudioPlayer());
		subscription.unsubscribe = jest.fn();

		voiceConnection.state = { status: VoiceConnectionStatus.Destroyed };
		voiceConnection['onSubscriptionRemoved'](subscription);
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Destroyed);
		expect(subscription.unsubscribe).not.toHaveBeenCalled();
	});

	test('Does nothing when subscription is not the same as the stored one', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const subscription = new PlayerSubscription(voiceConnection, new AudioPlayer.AudioPlayer());
		subscription.unsubscribe = jest.fn();

		voiceConnection.state = { ...(voiceConnection.state as VoiceConnectionSignallingState), subscription };
		voiceConnection['onSubscriptionRemoved'](Symbol('new subscription') as any);
		expect(voiceConnection.state).toMatchObject({
			status: VoiceConnectionStatus.Signalling,
			subscription,
		});
		expect(subscription.unsubscribe).not.toHaveBeenCalled();
	});

	test('Unsubscribes in a live state with matching subscription', () => {
		const { voiceConnection } = createFakeVoiceConnection();
		const subscription = new PlayerSubscription(voiceConnection, new AudioPlayer.AudioPlayer());
		subscription.unsubscribe = jest.fn();

		voiceConnection.state = { ...(voiceConnection.state as VoiceConnectionSignallingState), subscription };
		voiceConnection['onSubscriptionRemoved'](subscription);
		expect(voiceConnection.state).toEqual({
			...voiceConnection.state,
			subscription: undefined,
		});
		expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
	});
});

describe('Adapter', () => {
	test('onVoiceServerUpdate', () => {
		const { adapter, voiceConnection } = createFakeVoiceConnection();
		voiceConnection['addServerPacket'] = jest.fn();
		const dummy = Symbol('dummy') as any;
		adapter.libMethods.onVoiceServerUpdate(dummy);
		expect(voiceConnection['addServerPacket']).toHaveBeenCalledWith(dummy);
	});

	test('onVoiceStateUpdate', () => {
		const { adapter, voiceConnection } = createFakeVoiceConnection();
		voiceConnection['addStatePacket'] = jest.fn();
		const dummy = Symbol('dummy') as any;
		adapter.libMethods.onVoiceStateUpdate(dummy);
		expect(voiceConnection['addStatePacket']).toHaveBeenCalledWith(dummy);
	});

	test('destroy', () => {
		const { adapter, voiceConnection } = createFakeVoiceConnection();
		adapter.libMethods.destroy();
		expect(voiceConnection.state.status).toBe(VoiceConnectionStatus.Destroyed);
		expect(adapter.sendPayload).not.toHaveBeenCalled();
	});
});
