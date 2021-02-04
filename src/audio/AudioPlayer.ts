import { EventEmitter } from 'events';
import { noop } from '../util/util';
import { VoiceConnection, VoiceConnectionStatus } from '../VoiceConnection';
import { AudioResource } from './AudioResource';
import { PlayerSubscription } from './PlayerSubscription';

// Each audio packet is 20ms long
const FRAME_LENGTH = 20;

// The Opus "silent" frame
const SILENCE_FRAME = Buffer.from([0xF8, 0xFF, 0xFE]);

/**
 * Describes the behaviour of the player when an audio packet is played but there are no available
 * voice connections to play to.
 *
 * - `Pause` - pauses playing the stream until a voice connection becomes available
 *
 * - `Play` - continues to play through the resource regardless
 *
 * - `Stop` - the player stops and enters the Idle state.
 */
export enum NoSubscriberBehaviour {
	Pause = 'pause',
	Play = 'play',
	Stop = 'stop'
}

/**
 * The various statuses that a player can hold.
 *
 * - `Idle` - when there is currently no resource for the player to be playing
 *
 * - `Pause` - when the player has been manually paused
 *
 * - `AutoPaused` - when the player has paused itself. Only possible with the "pause" no subscriber behaviour.
 */
export enum AudioPlayerStatus {
	Idle = 'idle',
	Paused = 'paused',
	Playing = 'playing',
	AutoPaused = 'autopaused'
}

/**
 * Options that can be passed when creating an audio player, used to specify its behaviour.
 */
interface CreateAudioPlayerOptions {
	debug: boolean;
	behaviours: {
		noSubscriber: NoSubscriberBehaviour;
	};
}

/**
 * The various states that the player can be in.
 */
type AudioPlayerState = {
	status: AudioPlayerStatus.Idle;
} | {
	status: AudioPlayerStatus.Playing;
	missedFrames: number;
	resource: AudioResource;
	stepTimeout: NodeJS.Timeout;
	nextTime: number;
} | {
	status: AudioPlayerStatus.Paused | AudioPlayerStatus.AutoPaused;
	silencePacketsRemaining: number;
	resource: AudioResource;
	stepTimeout: NodeJS.Timeout;
	nextTime: number;
};

/**
 * Used to play audio resources (i.e. tracks, streams) to voice connections.
 * It is designed to be re-used - even if a resource has finished playing, the player itself can still be used.
 *
 * The AudioPlayer drives the timing of playback, and therefore is unaffected by voice connections
 * becoming unavailable. Its behaviour in these scenarios can be configured.
 */
export class AudioPlayer extends EventEmitter {
	/**
	 * The state that the AudioPlayer is in
	 */
	private _state: AudioPlayerState;

	/**
	 * A list of VoiceConnections that are registered to this AudioPlayer. The player will attempt to play audio
	 * to the streams in this list.
	 */
	private readonly subscribers: PlayerSubscription[];

	/**
	 * The behaviour that the player should follow when it enters certain situations.
	 */
	private readonly behaviours: {
		noSubscriber: NoSubscriberBehaviour;
	};

	/**
	 * The debug logger function, if debugging is enabled.
	 */
	private readonly debug: null | ((message: string) => void);

	/**
	 * Creates a new AudioPlayer
	 */
	public constructor(options: CreateAudioPlayerOptions) {
		super();
		this.subscribers = [];
		this._state = {
			status: AudioPlayerStatus.Idle
		};
		this.behaviours = options.behaviours;
		this.debug = options.debug ? this.emit.bind(this, 'debug') : null;
	}

	/**
	 * Subscribes a VoiceConnection to the audio player's play list. If the VoiceConnection is already subscribed,
	 * then the existing subscription is used.
	 *
	 * This method should not be directly called. Instead, use VoiceConnection#subscribe.
	 *
	 * @param connection The connection to subscribe
	 * @returns The new subscription if the voice connection is not yet subscribed, otherwise the existing subscription.
	 */
	private subscribe(connection: VoiceConnection) {
		const existingSubscription = this.subscribers.find(subscription => subscription.connection === connection);
		if (!existingSubscription) {
			const subscription = new PlayerSubscription(connection, this);
			this.subscribers.push(subscription);

			/**
			 * Emitted when a new subscriber is added to the audio player.
			 *
			 * @event AudioPlayer#subscribe
			 * @type {PlayerSubscription}
			 */
			setImmediate(() => this.emit('subscribe', subscription));

			return subscription;
		}
		return existingSubscription;
	}

	/**
	 * Unsubscribes a subscription - i.e. removes a voice connection from the play list of the audio player.
	 *
	 * This method should not be directly called. Instead, use PlayerSubscription#unsubscribe.
	 *
	 * @param subscription The subscription to remove
	 * @returns Whether or not the subscription existed on the player and was removed.
	 */
	private unsubscribe(subscription: PlayerSubscription) {
		const index = this.subscribers.indexOf(subscription);
		const exists = index !== -1;
		if (exists) {
			this.subscribers.splice(index, 1);
			subscription.connection.setSpeaking(false);

			/**
			 * Emitted when a subscription is removed from the audio player.
			 *
			 * @event AudioPlayer#unsubscribe
			 * @type {PlayerSubscription}
			 */
			this.emit('unsubscribe', subscription);
		}
		return exists;
	}

	/**
	 * The state that the player is in.
	 */
	public get state() {
		return this._state;
	}

	/**
	 * Sets a new state for the player, performing clean-up operations where necessary.
	 */
	public set state(newState: AudioPlayerState) {
		const oldState = this._state;
		const newResource = Reflect.get(newState, 'resource') as AudioResource|undefined;

		if (oldState.status !== AudioPlayerStatus.Idle && oldState.resource !== newResource) {
			oldState.resource.playStream.on('error', noop);
			oldState.resource.playStream.destroy();
			oldState.resource.playStream.read(); // required to ensure buffered data is drained, prevents memory leak
			clearTimeout(oldState.stepTimeout);
		}

		// transitioning into an idle should ensure that connections stop speaking
		if (newState.status === AudioPlayerStatus.Idle) {
			this._signalStopSpeaking();
		}

		// playing -> playing state changes should still transition if a resource changed (seems like it would be useful!)
		const didChangeResources = (
			oldState.status !== AudioPlayerStatus.Idle && newState.status === AudioPlayerStatus.Playing &&
			oldState.resource !== newState.resource
		);

		this._state = newState;

		this.emit('stateChange', oldState, this._state);
		if (oldState.status !== newState.status || didChangeResources) {
			this.emit(newState.status, oldState, this._state);
		}

		/**
		 * Debug event for AudioPlayer.
		 *
		 * @event AudioPlayer#debug
		 * @type {string}
		 */
		this.debug?.(`state change:\nfrom ${stringifyState(oldState)}\nto ${stringifyState(newState)}`);
	}

	/**
	 * Plays a new resource on the player. If the player is already playing a resource, the existing resource is destroyed
	 * (it cannot be reused, even in another player) and is replaced with the new resource.
	 *
	 * The player will transition to the Playing state once playback begins, and will return to the Idle state once
	 * playback is ended.
	 *
	 * If the player was previously playing a resource and this method is called, the player will not transition to the
	 * Idle state during the swap over.
	 *
	 * @param resource The resource to play
	 */
	public play(resource: AudioResource) {
		this.state = {
			status: AudioPlayerStatus.Playing,
			missedFrames: 0,
			resource,
			nextTime: Date.now(),
			stepTimeout: setTimeout(() => this._step(), 0)
		};
	}

	/**
	 * Pauses playback of the current resource, if any.
	 *
	 * @param interpolateSilence If true, the player will play 5 packets of silence after pausing to prevent audio glitches.
	 * @returns true if the player was successfully paused, otherwise false.
	 */
	public pause(interpolateSilence = true) {
		if (this.state.status !== AudioPlayerStatus.Playing) return false;
		this.state = {
			...this.state,
			status: AudioPlayerStatus.Paused,
			silencePacketsRemaining: interpolateSilence ? 5 : 0
		};
		return true;
	}

	/**
	 * Unpauses playback of the current resource, if any.
	 *
	 * @returns true if the player was successfully unpaused, otherwise false.
	 */
	public unpause() {
		if (this.state.status !== AudioPlayerStatus.Paused) return false;
		this.state = {
			...this.state,
			status: AudioPlayerStatus.Playing,
			missedFrames: 0
		};
		return true;
	}

	/**
	 * Stops playback of the current resource and destroys the resource. The player will transition to the Idle state.
	 *
	 * @returns true if the player was successfully stopped, otherwise false.
	 */
	public stop() {
		if (this.state.status === AudioPlayerStatus.Idle) return false;
		this.state = {
			status: AudioPlayerStatus.Idle
		};
		return true;
	}

	/**
	 * Attempts to capture an Opus packet from the current resource and play it across all the available connections that
	 * are subscribed to this player.
	 *
	 * Called roughly every 20ms during playback.
	 *
	 * Even while the player is paused, this method will still continue to be called at 20ms intervals to check whether
	 * audio can continue to play again.
	 */
	private _step() {
		const state = this.state;

		// Guard against the Idle state
		if (state.status === AudioPlayerStatus.Idle) return;

		// If the stream has been destroyed or is no longer readable, then transition to the Idle state.
		if (state.resource.playStream.readableEnded || state.resource.playStream.destroyed) {
			this.state = {
				status: AudioPlayerStatus.Idle
			};
			return;
		}

		// The next time that this method should be called (20ms from now)
		state.nextTime += FRAME_LENGTH;

		// List of connections that can receive the packet
		const playable = this.subscribers
			.filter(({ connection }) => connection.state.status === VoiceConnectionStatus.Ready)
			.map(({ connection }) => connection);

		// Dispatch any audio packets that were prepared in the previous cycle
		playable.forEach(connection => connection.dispatchAudio());

		/* If the player was previously in the AutoPaused state, check to see whether there are newly available
		   connections, allowing us to transition out of the AutoPaused state back into the Playing state */
		if (state.status === AudioPlayerStatus.AutoPaused && playable.length > 0) {
			this.state = {
				...state,
				status: AudioPlayerStatus.Playing,
				missedFrames: 0
			};
		}

		/* If the player is (auto)paused, check to see whether silence packets should be played and
		   set a timeout to begin the next cycle, ending the current cycle here. */
		if (state.status === AudioPlayerStatus.Paused || state.status === AudioPlayerStatus.AutoPaused) {
			if (state.silencePacketsRemaining > 0) {
				state.silencePacketsRemaining--;
				this._preparePacket(SILENCE_FRAME, playable);
				if (state.silencePacketsRemaining === 0) {
					this._signalStopSpeaking();
				}
			}
			state.stepTimeout = setTimeout(() => this._step(), state.nextTime - Date.now());
			return;
		}

		// If there are no available connections in this cycle, observe the configured "no subscriber" behaviour.
		if (playable.length === 0) {
			if (this.behaviours.noSubscriber === NoSubscriberBehaviour.Pause) {
				this.state = {
					...state,
					status: AudioPlayerStatus.AutoPaused,
					silencePacketsRemaining: 5
				};
				state.stepTimeout = setTimeout(() => this._step(), state.nextTime - Date.now());
				return;
			} else if (this.behaviours.noSubscriber === NoSubscriberBehaviour.Stop) {
				this.stop();
			}
		}

		/* Attempt to read an Opus packet from the resource. If there isn't an available packet,
			 play a silence packet. If there are 5 consecutive cycles with failed reads, then the
			 playback will end. */
		const packet: Buffer|null = state.resource.playStream.read();

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (state.status === AudioPlayerStatus.Playing) {
			if (packet) {
				this._preparePacket(packet, playable);
				state.missedFrames = 0;
			} else {
				this._preparePacket(SILENCE_FRAME, playable);
				state.missedFrames++;
				if (state.missedFrames >= 5) {
					this.stop();
				}
			}
		}
		state.stepTimeout = setTimeout(() => this._step(), state.nextTime - Date.now());
	}

	/**
	 * Signals to all the subscribed connections that they should send a packet to Discord indicating
	 * they are no longer speaking. Called once playback of a resource ends.
	 */
	private _signalStopSpeaking() {
		return this.subscribers.forEach(({ connection }) => connection.setSpeaking(false));
	}

	/**
	 * Instructs the given connections to each prepare this packet to be played at the start of the
	 * next cycle.
	 *
	 * @param packet The Opus packet to be prepared by each receiver
	 * @param receivers The connections that should play this packet
	 */
	private _preparePacket(packet: Buffer, receivers: VoiceConnection[]) {
		receivers.forEach(connection => connection.prepareAudioPacket(packet));
	}
}

/**
 * Stringifies an AudioPlayerState instance
 *
 * @param state The state to stringify
 */
function stringifyState(state: AudioPlayerState) {
	return JSON.stringify({
		...state,
		resource: Reflect.has(state, 'resource'),
		stepTimeout: Reflect.has(state, 'stepTimeout')
	});
}

/**
 * Creates a new AudioPlayer to be used
 */
export function createAudioPlayer(options?: CreateAudioPlayerOptions) {
	return new AudioPlayer({
		behaviours: {
			noSubscriber: NoSubscriberBehaviour.Pause,
			...options?.behaviours
		},
		debug: options?.debug ?? true
	});
}
