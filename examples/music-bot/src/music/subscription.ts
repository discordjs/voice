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
					}, (this.voiceConnection.reconnectAttempts + 1) * 5e3).unref();
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
				this.connectPromise = entersState(this.voiceConnection, VoiceConnectionStatus.Ready, 20e3)
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
				(oldState.resource as AudioResource<Track>).metadata!.onFinish();
				void this.processQueue();
			} else if (newState.status === AudioPlayerStatus.Playing) {
				(newState.resource as AudioResource<Track>).metadata!.onStart();
			}
		});

		this.audioPlayer.on('error', (error) => (error.resource as AudioResource<Track>).metadata!.onError(error));

		voiceConnection.subscribe(this.audioPlayer);
	}

	public enqueue(track: Track) {
		this.queue.push(track);
		void this.processQueue();
	}

	public stop() {
		this.queueLock = true;
		this.queue = [];
		this.audioPlayer.stop();
	}

	private async processQueue(): Promise<void> {
		if (this.queueLock || this.audioPlayer.state.status !== AudioPlayerStatus.Idle || this.queue.length === 0) {
			return;
		}
		this.queueLock = true;
		const nextTrack = this.queue.shift()!;
		try {
			const resource = await nextTrack.createAudioResource();
			this.audioPlayer.play(resource);
		} catch (error) {
			nextTrack.onError(error);
			return this.processQueue();
		} finally {
			this.queueLock = false;
		}
	}
}
