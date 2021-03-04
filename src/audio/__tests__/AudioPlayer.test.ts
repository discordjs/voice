/* eslint-disable @typescript-eslint/dot-notation */
import { AudioResource } from '../../audio/AudioResource';
import { createAudioPlayer, AudioPlayerStatus, AudioPlayer } from '../AudioPlayer';
import { Readable } from 'stream';
import { addAudioPlayer, deleteAudioPlayer } from '../../DataStore';
import { NoSubscriberBehavior } from '../..';
import { VoiceConnection, VoiceConnectionStatus } from '../../VoiceConnection';

jest.mock('../../DataStore');
jest.mock('../../VoiceConnection');

const addAudioPlayerMock = (addAudioPlayer as unknown) as jest.Mock<typeof addAudioPlayer>;
const deleteAudioPlayerMock = (deleteAudioPlayer as unknown) as jest.Mock<typeof deleteAudioPlayer>;
const VoiceConnectionMock = (VoiceConnection as unknown) as jest.Mock<VoiceConnection>;

function* silence() {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	while (true) {
		yield Buffer.from([0xf8, 0xff, 0xfe]);
	}
}

describe('State transitions', () => {
	let player: AudioPlayer | undefined;

	beforeEach(() => {
		VoiceConnectionMock.mockReset();
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

	describe('NoSubscriberBehavior transitions', () => {
		test('NoSubscriberBehavior.Pause', () => {
			const connection = new VoiceConnectionMock();
			connection.state = {
				status: VoiceConnectionStatus.Signalling,
				adapter: {
					sendPayload: jest.fn(),
					destroy: jest.fn(),
				},
			};
			connection.subscribe = jest.fn((player) => player['subscribe'](connection));

			const resource = new AudioResource([], Readable.from(silence()));
			player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
			connection.subscribe(player);

			player.play(resource);
			expect(player.checkPlayable()).toBe(true);
			player['_stepPrepare']();
			expect(player.state.status).toBe(AudioPlayerStatus.AutoPaused);

			connection.state = {
				...connection.state,
				status: VoiceConnectionStatus.Ready,
				networking: null as any,
			};

			expect(player.checkPlayable()).toBe(true);
			player['_stepPrepare']();
			expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		});

		test('NoSubscriberBehavior.Play', () => {
			const resource = new AudioResource([], Readable.from(silence()));
			player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });

			player.play(resource);
			expect(player.checkPlayable()).toBe(true);
			player['_stepPrepare']();
			expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		});

		test('NoSubscriberBehavior.Stop', () => {
			const resource = new AudioResource([], Readable.from(silence()));
			player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });

			player.play(resource);
			expect(player.checkPlayable()).toBe(true);
			player['_stepPrepare']();
			expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		});
	});
});
