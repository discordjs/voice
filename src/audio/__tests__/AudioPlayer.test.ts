import { createAudioPlayer, AudioPlayerStatus } from '../AudioPlayer';

describe('State transitions', () => {
	test('Starts in Idle state', () => {
		const player = createAudioPlayer();
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
	});
});
