import {
	AudioPlayer,
	AudioPlayerStatus,
	AudioResource,
	createAudioPlayer,
	entersState,
	VoiceConnection,
	VoiceConnectionStatus,
} from '@discordjs/voice';
import { Track } from './track';

/**
 * A MusicSubscription exists for each active VoiceConnection. Each subscription has its own audio player and queue,
 * and it also attaches logic to the audio player and voice connection for error handling and reconnection logic.
 */
export class MusicSubscription {
	public readonly voiceConnection: VoiceConnection;
	public readonly audioPlayer: AudioPlayer;
	public queue: Track[];
	public queueLock = false;
	public connectPromise?: Promise<void>;

	public constructor(voiceConnection: VoiceConnection) {
		this.voiceConnection = voiceConnection;
		this.audioPlayer = createAudioPlayer();
		this.queue = [];

		// Configure voice connection
		this.voiceConnection.on('stateChange', (_, newState) => {
			if (newState.status === VoiceConnectionStatus.Disconnected) {
				// In the Disconnected state, try to reconnect or destroy if too many failed attempts
				if (this.voiceConnection.reconnectAttempts < 5) {
					setTimeout(() => {
						if (this.voiceConnection.state.status === VoiceConnectionStatus.Disconnected) {
							this.voiceConnection.reconnect();
						}
					}, (this.voiceConnection.reconnectAttempts + 1) * 5_000).unref();
				} else {
					this.voiceConnection.destroy();
				}
			} else if (newState.status === VoiceConnectionStatus.Destroyed) {
				// In the Destroyed state, stop the player and kill the queue
				this.stop();
			} else if (
				!this.connectPromise &&
				(newState.status === VoiceConnectionStatus.Connecting || newState.status === VoiceConnectionStatus.Signalling)
			) {
				// In the Signalling or Connecting states, set a time limit to prevent starvation
				// These states can be entered after Ready in an automatic reconnect, e.g. unknown close code, UDP keep-alive failed
				this.connectPromise = entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20_000)
					.then(() => undefined)
					.catch(() => {
						if (this.voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) this.voiceConnection.destroy();
					})
					.finally(() => (this.connectPromise = undefined));
			}
		});

		// Configure audio player
		this.audioPlayer.on('stateChange', (oldState, newState) => {
			if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
				// If the Idle state is entered from a non-Idle state, it means that an audio resource has finished playing.
				// The queue is then processed to start playing the next track, if one is available.
				(oldState.resource as AudioResource<Track>).metadata!.onFinish();
				void this.processQueue();
			} else if (newState.status === AudioPlayerStatus.Playing) {
				// If the Playing state has been entered, then a new track has started playback.
				(newState.resource as AudioResource<Track>).metadata!.onStart();
			}
		});

		this.audioPlayer.on('error', (error) => (error.resource as AudioResource<Track>).metadata!.onError(error));

		voiceConnection.subscribe(this.audioPlayer);
	}

	/**
	 * Adds a new Track to the queue.
	 *
	 * @param track The track to add to the queue
	 */
	public enqueue(track: Track) {
		this.queue.push(track);
		void this.processQueue();
	}

	/**
	 * Stops audio playback and empties the queue
	 */
	public stop() {
		this.queueLock = true;
		this.queue = [];
		this.audioPlayer.stop();
	}

	/**
	 * Attempts to play a Track from the queue
	 */
	private async processQueue(): Promise<void> {
		// If the queue is locked (already being processed), is empty, or the audio player is already playing something, return
		if (this.queueLock || this.audioPlayer.state.status !== AudioPlayerStatus.Idle || this.queue.length === 0) {
			return;
		}
		// Lock the queue to guarantee safe access
		this.queueLock = true;

		// Take the first item from the queue. This is guaranteed to exist due to the non-empty check above.
		const nextTrack = this.queue.shift()!;
		try {
			// Attempt to convert the Track into an AudioResource (i.e. start streaming the video)
			const resource = await nextTrack.createAudioResource();
			this.audioPlayer.play(resource);
			this.queueLock = false;
		} catch (error) {
			// If an error occurred, try the next item of the queue instead
			nextTrack.onError(error);
			this.queueLock = false;
			return this.processQueue();
		}
	}
}
