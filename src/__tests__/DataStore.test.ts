/* eslint-disable @typescript-eslint/dot-notation */
import { GatewayOpcodes } from 'discord-api-types';
import * as DataStore from '../DataStore';
import * as _AudioPlayer from '../audio/AudioPlayer';
import { VoiceConnection } from '../VoiceConnection';
jest.mock('../VoiceConnection');
jest.mock('../audio/AudioPlayer');

const AudioPlayer = _AudioPlayer as unknown as jest.Mocked<typeof _AudioPlayer>;

function createVoiceConnection(joinConfig: Pick<DataStore.JoinConfig, 'group' | 'guildId'>): VoiceConnection {
	return {
		joinConfig: { channelId: '123', selfMute: false, selfDeaf: true, ...joinConfig },
	} as any;
}

function waitForEventLoop() {
	return new Promise((res) => setImmediate(res));
}

beforeEach(() => {
	const groups = DataStore.getGroups();
	for (const groupKey of groups.keys()) {
		groups.delete(groupKey);
	}
	groups.set('default', new Map());
});

const voiceConnectionDefault = createVoiceConnection({ guildId: '123', group: 'default' });
const voiceConnectionAbc = createVoiceConnection({ guildId: '123', group: 'abc' });

describe('DataStore', () => {
	test('VoiceConnection join payload creation', () => {
		const joinConfig: DataStore.JoinConfig = {
			guildId: '123',
			channelId: '123',
			selfDeaf: true,
			selfMute: false,
			group: 'default',
		};
		expect(DataStore.createJoinVoiceChannelPayload(joinConfig)).toStrictEqual({
			op: GatewayOpcodes.VoiceStateUpdate,
			d: {
				guild_id: joinConfig.guildId,
				channel_id: joinConfig.channelId,
				self_deaf: joinConfig.selfDeaf,
				self_mute: joinConfig.selfMute,
			},
		});
	});
	test('VoiceConnection management respects group', () => {
		DataStore.trackVoiceConnection(voiceConnectionDefault);
		DataStore.trackVoiceConnection(voiceConnectionAbc);
		expect(DataStore.getVoiceConnection('123')).toBe(voiceConnectionDefault);
		expect(DataStore.getVoiceConnection('123', 'default')).toBe(voiceConnectionDefault);
		expect(DataStore.getVoiceConnection('123', 'abc')).toBe(voiceConnectionAbc);

		expect([...DataStore.getGroups().keys()]).toEqual(['default', 'abc']);

		expect([...DataStore.getVoiceConnections().values()]).toEqual([voiceConnectionDefault]);
		expect([...DataStore.getVoiceConnections('default').values()]).toEqual([voiceConnectionDefault]);
		expect([...DataStore.getVoiceConnections('abc').values()]).toEqual([voiceConnectionAbc]);

		DataStore.untrackVoiceConnection(voiceConnectionDefault);
		expect(DataStore.getVoiceConnection('123')).toBeUndefined();
		expect(DataStore.getVoiceConnection('123', 'abc')).toBe(voiceConnectionAbc);
	});
	test('Managing Audio Players', async () => {
		const player = DataStore.addAudioPlayer(new AudioPlayer.AudioPlayer());
		const dispatchSpy = jest.spyOn(player as any, '_stepDispatch');
		const prepareSpy = jest.spyOn(player as any, '_stepPrepare');
		expect(DataStore.hasAudioPlayer(player)).toBe(true);
		expect(DataStore.addAudioPlayer(player)).toBe(player);
		DataStore.deleteAudioPlayer(player);
		expect(DataStore.deleteAudioPlayer(player)).toBe(undefined);
		expect(DataStore.hasAudioPlayer(player)).toBe(false);
		// Tests audio cycle with nextTime === -1
		await waitForEventLoop();
		expect(dispatchSpy).toHaveBeenCalledTimes(0);
		expect(prepareSpy).toHaveBeenCalledTimes(0);
	});
	test('Preparing Audio Frames', async () => {
		// Test functional player
		const player2 = DataStore.addAudioPlayer(new AudioPlayer.AudioPlayer());
		player2['checkPlayable'] = jest.fn(() => true);
		const player3 = DataStore.addAudioPlayer(new AudioPlayer.AudioPlayer());
		const dispatchSpy2 = jest.spyOn(player2 as any, '_stepDispatch');
		const prepareSpy2 = jest.spyOn(player2 as any, '_stepPrepare');
		const dispatchSpy3 = jest.spyOn(player3 as any, '_stepDispatch');
		const prepareSpy3 = jest.spyOn(player3 as any, '_stepPrepare');
		await waitForEventLoop();
		DataStore.deleteAudioPlayer(player2);
		await waitForEventLoop();
		DataStore.deleteAudioPlayer(player3);
		expect(dispatchSpy2).toHaveBeenCalledTimes(1);
		expect(prepareSpy2).toHaveBeenCalledTimes(1);
		expect(dispatchSpy3).toHaveBeenCalledTimes(0);
		expect(prepareSpy3).toHaveBeenCalledTimes(0);
	});
});
