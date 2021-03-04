import { AudioResource } from '../../audio/AudioResource';
import { createAudioPlayer, AudioPlayerStatus, AudioPlayer } from '../AudioPlayer';
import { Readable } from 'stream';
import { addAudioPlayer, deleteAudioPlayer } from '../../DataStore';

jest.mock('../../DataStore');

const addAudioPlayerMock = (addAudioPlayer as unknown) as jest.Mock<typeof addAudioPlayer>;
const deleteAudioPlayerMock = (deleteAudioPlayer as unknown) as jest.Mock<typeof deleteAudioPlayer>;

function* silence() {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	while (true) {
		yield Buffer.from([0xf8, 0xff, 0xfe]);
	}
}

describe('State transitions', () => {
	let player: AudioPlayer | undefined;

	beforeEach(() => {
		addAudioPlayerMock.mockReset();
		deleteAudioPlayerMock.mockReset();
	});

	afterEach(() => {
		player?.stop();
	});

	test('Starts in Idle state', () => {
		player = createAudioPlayer();
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(addAudioPlayerMock).toBeCalledTimes(0);
		expect(deleteAudioPlayerMock).toBeCalledTimes(0);
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
		expect(addAudioPlayerMock).toBeCalledTimes(0);

		// Expect to be in the Playing state after calling .play() with a readable resource
		player.play(resource);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		expect(addAudioPlayerMock).toBeCalledTimes(1);

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

		// The audio player should not have been deleted throughout these changes
		expect(deleteAudioPlayerMock).toBeCalledTimes(0);
	});

	test('Playing to Stopping', () => {
		const resource = new AudioResource([], Readable.from(silence()));
		player = createAudioPlayer();

		// stop() shouldn't do anything in Idle state
		expect(player.stop()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);

		player.play(resource);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		expect(addAudioPlayerMock).toBeCalledTimes(1);
		expect(deleteAudioPlayerMock).toBeCalledTimes(0);

		expect(player.stop()).toBe(true);
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(addAudioPlayerMock).toBeCalledTimes(1);
		expect(deleteAudioPlayerMock).toBeCalledTimes(1);
	});
});