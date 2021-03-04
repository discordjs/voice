import { AudioResource } from '../../audio/AudioResource';
import { createAudioPlayer, AudioPlayerStatus, AudioPlayer } from '../AudioPlayer';
import { Readable } from 'stream';

function* silence() {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	while (true) {
		yield Buffer.from([0xf8, 0xff, 0xfe]);
	}
}

describe('State transitions', () => {
	let player: AudioPlayer | undefined;

	afterEach(() => {
		player?.stop();
	});

	test('Starts in Idle state', () => {
		player = createAudioPlayer();
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
	});

	test('Playing resource with pausing and resuming', () => {
		// Call AudioResource constructor directly to avoid analysing pipeline for stream
		const resource = new AudioResource([], Readable.from(silence()));
		player = createAudioPlayer();
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);

		// Pause and unpause should not affect the status of an Idle player
		expect(player.pause()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(player.unpause()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);

		// Expect to be in the Playing state after calling .play() with a readable resource
		player.play(resource);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);

		// Expect pause() to return true and transition to paused state
		expect(player.pause()).toBe(true);
		expect(player.state.status).toBe(AudioPlayerStatus.Paused);

		// further calls to pause() should be unsuccessful
		expect(player.pause()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Paused);

		// unpause() should transition back to Playing
		expect(player.unpause()).toBe(true);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);

		// further calls to unpause() should be unsuccessful
		expect(player.unpause()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);
	});
});
