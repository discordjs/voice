/* eslint-disable @typescript-eslint/dot-notation */
import { AudioResource } from '../../audio/AudioResource';
import { createAudioPlayer, AudioPlayerStatus, AudioPlayer } from '../AudioPlayer';
import { Readable } from 'stream';
import { addAudioPlayer, deleteAudioPlayer } from '../../DataStore';
import { NoSubscriberBehavior } from '../..';
import { VoiceConnection, VoiceConnectionStatus } from '../../VoiceConnection';
import { once } from 'events';
import { AudioPlayerError } from '../AudioPlayerError';

jest.mock('../../DataStore');
jest.mock('../../VoiceConnection');
jest.mock('../AudioPlayerError');

const addAudioPlayerMock = (addAudioPlayer as unknown) as jest.Mock<typeof addAudioPlayer>;
const deleteAudioPlayerMock = (deleteAudioPlayer as unknown) as jest.Mock<typeof deleteAudioPlayer>;
const AudioPlayerErrorMock = (AudioPlayerError as unknown) as jest.Mock<typeof AudioPlayerError>;
const VoiceConnectionMock = (VoiceConnection as unknown) as jest.Mock<VoiceConnection>;

function* silence() {
	// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
	while (true) {
		yield Buffer.from([0xf8, 0xff, 0xfe]);
	}
}

function createVoiceConnectionMock() {
	const connection = new VoiceConnectionMock();
	connection.state = {
		status: VoiceConnectionStatus.Signalling,
		adapter: {
			sendPayload: jest.fn(),
			destroy: jest.fn(),
		},
	};
	connection.subscribe = jest.fn((player) => player['subscribe'](connection));
	return connection;
}

function wait() {
	return new Promise((resolve) => process.nextTick(resolve));
}

async function started(resource: AudioResource) {
	while (!resource.started) {
		await wait();
	}
	return resource;
}

let player: AudioPlayer | undefined;

beforeEach(() => {
	AudioPlayerErrorMock.mockReset();
	VoiceConnectionMock.mockReset();
	addAudioPlayerMock.mockReset();
	deleteAudioPlayerMock.mockReset();
});

afterEach(() => {
	player?.stop();
});

describe('State transitions', () => {
	test('Starts in Idle state', () => {
		player = createAudioPlayer();
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(addAudioPlayerMock).toBeCalledTimes(0);
		expect(deleteAudioPlayerMock).toBeCalledTimes(0);
	});

	test('Playing resource with pausing and resuming', async () => {
		// Call AudioResource constructor directly to avoid analysing pipeline for stream
		const resource = await started(new AudioResource([], Readable.from(silence())));
		player = createAudioPlayer();
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);

		// Pause and unpause should not affect the status of an Idle player
		expect(player.pause()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(player.unpause()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(addAudioPlayerMock).toBeCalledTimes(0);

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

	test('Playing to Stopping', async () => {
		const resource = await started(new AudioResource([], Readable.from(silence())));
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

	test('Buffering to Playing', async () => {
		const resource = new AudioResource([], Readable.from(silence()));
		player = createAudioPlayer();

		player.play(resource);
		expect(player.state.status).toBe(AudioPlayerStatus.Buffering);

		await started(resource);

		expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		expect(addAudioPlayerMock).toHaveBeenCalled();
		expect(deleteAudioPlayerMock).not.toHaveBeenCalled();
	});

	describe('NoSubscriberBehavior transitions', () => {
		test('NoSubscriberBehavior.Pause', async () => {
			const connection = createVoiceConnectionMock();
			if (connection.state.status !== VoiceConnectionStatus.Signalling) {
				throw new Error('Voice connection should have been Signalling');
			}

			const resource = await started(new AudioResource([], Readable.from(silence())));
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

		test('NoSubscriberBehavior.Play', async () => {
			const resource = await started(new AudioResource([], Readable.from(silence())));
			player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });

			player.play(resource);
			expect(player.checkPlayable()).toBe(true);
			player['_stepPrepare']();
			expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		});

		test('NoSubscriberBehavior.Stop', async () => {
			const resource = await started(new AudioResource([], Readable.from(silence())));
			player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Stop } });

			player.play(resource);
			expect(addAudioPlayerMock).toBeCalledTimes(1);
			expect(player.checkPlayable()).toBe(true);
			player['_stepPrepare']();
			expect(player.state.status).toBe(AudioPlayerStatus.Idle);
			expect(deleteAudioPlayerMock).toBeCalledTimes(1);
		});
	});

	test('Normal playing state', async () => {
		const connection = createVoiceConnectionMock();
		if (connection.state.status !== VoiceConnectionStatus.Signalling) {
			throw new Error('Voice connection should have been Signalling');
		}
		connection.state = {
			...connection.state,
			status: VoiceConnectionStatus.Ready,
			networking: null as any,
		};

		const buffer = Buffer.from([1, 2, 4, 8]);
		const resource = await started(new AudioResource([], Readable.from([buffer, buffer, buffer, buffer, buffer])));
		player = createAudioPlayer();
		connection.subscribe(player);

		player.play(resource);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		expect(addAudioPlayerMock).toBeCalledTimes(1);
		expect(player.checkPlayable()).toBe(true);

		// Run through a few packet cycles
		for (let i = 1; i <= 5; i++) {
			player['_stepDispatch']();
			expect(connection.dispatchAudio).toHaveBeenCalledTimes(i);

			await wait(); // Wait for the stream

			player['_stepPrepare']();
			expect(connection.prepareAudioPacket).toHaveBeenCalledTimes(i);
			expect(connection.prepareAudioPacket).toHaveBeenLastCalledWith(buffer);
			expect(player.state.status).toBe(AudioPlayerStatus.Playing);
			if (player.state.status === AudioPlayerStatus.Playing) {
				expect(player.state.playbackDuration).toStrictEqual(i * 20);
			}
		}

		// Expect silence to be played
		player['_stepDispatch']();
		expect(connection.dispatchAudio).toHaveBeenCalledTimes(6);
		await wait();
		player['_stepPrepare']();
		const prepareAudioPacket = (connection.prepareAudioPacket as unknown) as jest.Mock<
			typeof connection.prepareAudioPacket
		>;
		expect(prepareAudioPacket).toHaveBeenCalledTimes(6);
		expect(prepareAudioPacket.mock.calls[5][0]).toEqual(silence().next().value);

		player.stop();
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(connection.setSpeaking).toBeCalledTimes(1);
		expect(connection.setSpeaking).toHaveBeenLastCalledWith(false);
		expect(deleteAudioPlayerMock).toHaveBeenCalledTimes(1);
	});

	test('Plays silence 5 times for unreadable stream before quitting', async () => {
		const connection = createVoiceConnectionMock();
		if (connection.state.status !== VoiceConnectionStatus.Signalling) {
			throw new Error('Voice connection should have been Signalling');
		}
		connection.state = {
			...connection.state,
			status: VoiceConnectionStatus.Ready,
			networking: null as any,
		};

		const resource = await started(new AudioResource([], Readable.from([1])));
		resource.playStream.read();
		player = createAudioPlayer({ behaviors: { maxMissedFrames: 5 } });
		connection.subscribe(player);

		player.play(resource);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		expect(addAudioPlayerMock).toBeCalledTimes(1);
		expect(player.checkPlayable()).toBe(true);

		const prepareAudioPacket = (connection.prepareAudioPacket as unknown) as jest.Mock<
			typeof connection.prepareAudioPacket
		>;

		// Run through a few packet cycles
		for (let i = 1; i <= 5; i++) {
			expect(player.state.status).toBe(AudioPlayerStatus.Playing);
			if (player.state.status !== AudioPlayerStatus.Playing) throw new Error('Error');
			expect(player.state.playbackDuration).toStrictEqual((i - 1) * 20);
			expect(player.state.missedFrames).toBe(i - 1);
			player['_stepDispatch']();
			expect(connection.dispatchAudio).toHaveBeenCalledTimes(i);
			player['_stepPrepare']();
			expect(prepareAudioPacket).toHaveBeenCalledTimes(i);
			expect(prepareAudioPacket.mock.calls[i - 1][0]).toEqual(silence().next().value);
		}

		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
		expect(connection.setSpeaking).toBeCalledTimes(1);
		expect(connection.setSpeaking).toHaveBeenLastCalledWith(false);
		expect(deleteAudioPlayerMock).toHaveBeenCalledTimes(1);
	});

	test('checkPlayable() transitions to Idle for unreadable stream', async () => {
		const resource = await started(new AudioResource([], Readable.from([1])));
		player = createAudioPlayer();
		player.play(resource);
		expect(player.checkPlayable()).toBe(true);
		expect(player.state.status).toBe(AudioPlayerStatus.Playing);
		for (let i = 0; i < 3; i++) {
			resource.playStream.read();
			await wait();
		}
		expect(resource.playStream.readableEnded).toBe(true);
		expect(player.checkPlayable()).toBe(false);
		expect(player.state.status).toBe(AudioPlayerStatus.Idle);
	});
});

test('play() throws when playing a resource that has already ended', async () => {
	const resource = await started(new AudioResource([], Readable.from([1])));
	player = createAudioPlayer();
	player.play(resource);
	expect(player.state.status).toBe(AudioPlayerStatus.Playing);
	for (let i = 0; i < 3; i++) {
		resource.playStream.read();
		await wait();
	}
	expect(resource.playStream.readableEnded).toBe(true);
	player.stop();
	expect(player.state.status).toBe(AudioPlayerStatus.Idle);
	expect(() => player.play(resource)).toThrow();
});

test('Propagates errors from streams', async () => {
	const resource = await started(new AudioResource([], Readable.from(silence())));
	player = createAudioPlayer();
	player.play(resource);
	expect(player.state.status).toBe(AudioPlayerStatus.Playing);
	const error = new Error('AudioPlayer test error');
	process.nextTick(() => resource.playStream.emit('error', error));
	const res = await once(player, 'error');
	const playerError = res[0] as AudioPlayerError;
	expect(playerError).toBeInstanceOf(AudioPlayerError);
	expect(AudioPlayerErrorMock).toHaveBeenCalledWith(error, resource);
	expect(player.state.status).toBe(AudioPlayerStatus.Idle);
});
