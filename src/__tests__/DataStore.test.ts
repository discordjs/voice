/* eslint-disable @typescript-eslint/dot-notation */
import * as DataStore from '../DataStore';
import { VoiceConnection } from '../VoiceConnection';
jest.mock('../VoiceConnection');

function createVoiceConnection(joinConfig: Pick<DataStore.JoinConfig, 'group' | 'guildId'>): VoiceConnection {
	return {
		joinConfig: { channelId: '123', selfMute: false, selfDeaf: true, ...joinConfig },
	} as any;
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
});
