import { GatewayVoiceServerUpdateDispatchData, GatewayVoiceStateUpdateDispatchData } from 'discord-api-types/v8';
import { EventEmitter } from 'events';
import { CreateVoiceConnectionOptions } from '.';
import { AudioPlayer } from './audio/AudioPlayer';
import { PlayerSubscription } from './audio/PlayerSubscription';
import {
	getVoiceConnection,
	createJoinVoiceChannelPayload,
	trackVoiceConnection,
	JoinConfig,
	untrackVoiceConnection,
} from './DataStore';
import { DiscordGatewayAdapterImplementerMethods } from './util/adapter';
import { Networking, NetworkingState, NetworkingStatusCode } from './networking/Networking';
import { noop } from './util/util';

/**
 * The different statuses that a voice connection can hold.
 *
 * @remarks
 * - `Signalling` - sending a packet to the main Discord gateway to indicate we want to change our voice state.
 *
 * - `Connecting` - the `VOICE_SERVER_UPDATE` and `VOICE_STATE_UPDATE` packets have been received, now attempting to establish a voice connection.
 *
 * - `Ready` - a voice connection has been established, and is ready to be used
 *
 * - `Disconnected` - the voice connection has either been severed or not established.
 *
 * - `Destroyed` - the voice connection has been destroyed and untracked, it cannot be reused.
 */
export enum VoiceConnectionStatus {
	Signalling = 'signalling',
	Connecting = 'connecting',
	Ready = 'ready',
	Disconnected = 'disconnected',
	Destroyed = 'destroyed',
}

/**
 * The state that a VoiceConnection will be in when it is waiting to receive a VOICE_SERVER_UPDATE and
 * VOICE_STATE_UPDATE packet from Discord, provided by the adapter.
 */
export interface VoiceConnectionSignallingState {
	status: VoiceConnectionStatus.Signalling;
	subscription?: PlayerSubscription;
	adapter: DiscordGatewayAdapterImplementerMethods;
}

/**
 * The state that a VoiceConnection will be in when it is not connected to a Discord voice server, and
 * is not making an attempt to do so.
 *
 * It is possible to attempt a reconnect when in this state, but it will not be automatically done by
 * the library.
 */
export interface VoiceConnectionDisconnectedState {
	status: VoiceConnectionStatus.Disconnected;
	/**
	 * The close code of the WebSocket connection to the Discord voice server.
	 */
	closeCode: number;
	subscription?: PlayerSubscription;
	adapter: DiscordGatewayAdapterImplementerMethods;
}

/**
 * The state that a VoiceConnection will be in when it is establishing a connection to a Discord
 * voice server.
 */
export interface VoiceConnectionConnectingState {
	status: VoiceConnectionStatus.Connecting;
	networking: Networking;
	subscription?: PlayerSubscription;
	adapter: DiscordGatewayAdapterImplementerMethods;
}

/**
 * The state that a VoiceConnection will be in when it has an active connection to a Discord
 * voice server.
 */
export interface VoiceConnectionReadyState {
	status: VoiceConnectionStatus.Ready;
	networking: Networking;
	subscription?: PlayerSubscription;
	adapter: DiscordGatewayAdapterImplementerMethods;
}

/**
 * The state that a VoiceConnection will be in when it has been permanently been destroyed by the
 * user and untracked by the library. It cannot be reconnected, instead, a new VoiceConnection
 * needs to be established.
 */
export interface VoiceConnectionDestroyedState {
	status: VoiceConnectionStatus.Destroyed;
}

/**
 * The various states that a voice connection can be in.
 */
export type VoiceConnectionState =
	| VoiceConnectionSignallingState
	| VoiceConnectionDisconnectedState
	| VoiceConnectionConnectingState
	| VoiceConnectionReadyState
	| VoiceConnectionDestroyedState;

/**
 * A connection to the voice server of a Guild, can be used to play audio in voice channels.
 */
export class VoiceConnection extends EventEmitter {
	/**
	 * The number of consecutive reconnect attempts. Initially 0, and increments for each reconnect.
	 * When a connection is successfully established, it resets to 0.
	 */
	public reconnectAttempts: number;

	/**
	 * The state of the voice connection
	 */
	private _state: VoiceConnectionState;

	/**
	 * A configuration storing all the data needed to reconnect to a Guild's voice server.
	 * @internal
	 */
	public readonly joinConfig: JoinConfig;

	/**
	 * The two packets needed to successfully establish a voice connection. They are received
	 * from the main Discord gateway after signalling to change the voice state.
	 */
	private readonly packets: {
		server: GatewayVoiceServerUpdateDispatchData | undefined;
		state: GatewayVoiceStateUpdateDispatchData | undefined;
	};

	/**
	 * The debug logger function, if debugging is enabled.
	 */
	private readonly debug: null | ((message: string) => void);

	/**
	 * Creates a new voice connection.
	 *
	 * @param joinConfig - The data required to establish the voice connection
	 */
	public constructor(joinConfig: JoinConfig, { debug, adapterCreator }: CreateVoiceConnectionOptions) {
		super();

		this.debug = debug ? this.emit.bind(this, 'debug') : null;
		this.reconnectAttempts = 0;

		this.onNetworkingClose = this.onNetworkingClose.bind(this);
		this.onNetworkingStateChange = this.onNetworkingStateChange.bind(this);
		this.onNetworkingError = this.onNetworkingError.bind(this);
		this.onNetworkingDebug = this.onNetworkingDebug.bind(this);

		const adapter = adapterCreator({
			onVoiceServerUpdate: (data) => this.addServerPacket(data),
			onVoiceStateUpdate: (data) => this.addStatePacket(data),
		});

		this._state = { status: VoiceConnectionStatus.Signalling, adapter };

		this.packets = {
			server: undefined,
			state: undefined,
		};

		this.joinConfig = joinConfig;
	}

	/**
	 * The current state of the voice connection
	 */
	public get state() {
		return this._state;
	}

	/**
	 * Updates the state of the voice connection, performing clean-up operations where necessary.
	 */
	public set state(newState: VoiceConnectionState) {
		const oldState = this._state;
		const oldNetworking: Networking | undefined = Reflect.get(oldState, 'networking');
		const newNetworking: Networking | undefined = Reflect.get(newState, 'networking');

		const oldSubscription: PlayerSubscription | undefined = Reflect.get(oldState, 'subscription');
		const newSubscription: PlayerSubscription | undefined = Reflect.get(newState, 'subscription');

		if (oldNetworking && oldNetworking !== newNetworking) {
			oldNetworking.off('debug', this.onNetworkingDebug);
			oldNetworking.on('error', noop);
			oldNetworking.off('error', this.onNetworkingError);
			oldNetworking.off('close', this.onNetworkingClose);
			oldNetworking.off('stateChange', this.onNetworkingStateChange);
			oldNetworking.destroy();
		}

		if (newState.status === VoiceConnectionStatus.Ready) {
			this.reconnectAttempts = 0;
		}

		// If destroyed, the adapter can also be destroyed so it can be cleaned up by the user
		if (oldState.status !== VoiceConnectionStatus.Destroyed && newState.status === VoiceConnectionStatus.Destroyed) {
			oldState.adapter.destroy?.();
		}

		this._state = newState;

		if (oldSubscription && oldSubscription !== newSubscription) {
			oldSubscription.unsubscribe();
		}

		this.emit('stateChange', oldState, newState);
		if (oldState.status !== newState.status) {
			this.emit(newState.status, oldState, newState);
		}
	}

	/**
	 * Registers a `VOICE_SERVER_UPDATE` packet to the voice connection. This will cause it to reconnect using the
	 * new data provided in the packet.
	 *
	 * @param packet - The received `VOICE_SERVER_UPDATE` packet
	 */
	private addServerPacket(packet: GatewayVoiceServerUpdateDispatchData) {
		this.packets.server = packet;
		this.configureNetworking();
	}

	/**
	 * Registers a `VOICE_STATE_UPDATE` packet to the voice connection. Most importantly, it stores the ID of the
	 * channel that the client is connected to.
	 *
	 * @param packet - The received `VOICE_STATE_UPDATE` packet
	 */
	private addStatePacket(packet: GatewayVoiceStateUpdateDispatchData) {
		this.packets.state = packet;

		if (typeof packet.self_deaf !== 'undefined') this.joinConfig.selfDeaf = packet.self_deaf;
		if (typeof packet.self_mute !== 'undefined') this.joinConfig.selfMute = packet.self_mute;
		if (packet.channel_id) this.joinConfig.channelId = packet.channel_id;
		/*
			the channel_id being null doesn't necessarily mean it was intended for the client to leave the voice channel
			as it may have disconnected due to network failure. This will be gracefully handled once the voice websocket
			dies, and then it is up to the user to decide how they wish to handle this.
		*/
	}

	/**
	 * Attempts to configure a networking instance for this voice connection using the received packets.
	 * Both packets are required, and any existing networking instance will be destroyed.
	 *
	 * @remarks
	 * This is called when the voice server of the connection changes, e.g. if the bot is moved into a
	 * different channel in the same guild but has a different voice server. In this instance, the connection
	 * needs to be re-established to the new voice server.
	 *
	 * The connection will transition to the Connecting state when this is called.
	 */
	public configureNetworking() {
		const { server, state } = this.packets;
		if (!server || !state || this.state.status === VoiceConnectionStatus.Destroyed) return;

		const networking = new Networking(
			{
				endpoint: server.endpoint,
				serverID: server.guild_id,
				token: server.token,
				sessionID: state.session_id,
				userID: state.user_id,
			},
			Boolean(this.debug),
		);

		networking.once('close', this.onNetworkingClose);
		networking.on('stateChange', this.onNetworkingStateChange);
		networking.on('error', this.onNetworkingError);
		networking.on('debug', this.onNetworkingDebug);

		this.state = {
			...this.state,
			status: VoiceConnectionStatus.Connecting,
			networking,
		};
	}

	/**
	 * Called when the networking instance for this connection closes. If the close code is 4014 (do not reconnect),
	 * the voice connection will transition to the Disconnected state which will store the close code. You can
	 * decide whether or not to reconnect when this occurs by listening for the state change and calling reconnect().
	 *
	 * @remarks
	 * If the close code was anything other than 4014, it is likely that the closing was not intended, and so the
	 * VoiceConnection will signal to Discord that it would like to rejoin the channel. This automatically attempts
	 * to re-establish the connection. This would be seen as a transition from the Ready state to the Signalling state.
	 *
	 * @param code - The close code
	 */
	private onNetworkingClose(code: number) {
		if (this.state.status === VoiceConnectionStatus.Destroyed) return;
		// If networking closes, try to connect to the voice channel again.
		if (code === 4014) {
			// Disconnected - networking is already destroyed here
			this.state = {
				...this.state,
				status: VoiceConnectionStatus.Disconnected,
				closeCode: code,
			};
		} else {
			this.state = {
				...this.state,
				status: VoiceConnectionStatus.Signalling,
			};
			this.reconnectAttempts++;
			this.state.adapter.sendPayload(createJoinVoiceChannelPayload(this.joinConfig));
		}
	}

	/**
	 * Called when the state of the networking instance changes. This is used to derive the state of the voice connection.
	 *
	 * @param oldState - The previous state
	 * @param newState - The new state
	 */
	private onNetworkingStateChange(oldState: NetworkingState, newState: NetworkingState) {
		if (oldState.code === newState.code) return;
		if (this.state.status !== VoiceConnectionStatus.Connecting && this.state.status !== VoiceConnectionStatus.Ready)
			return;

		if (newState.code === NetworkingStatusCode.Ready) {
			this.state = {
				...this.state,
				status: VoiceConnectionStatus.Ready,
			};
		} else if (newState.code !== NetworkingStatusCode.Closed) {
			this.state = {
				...this.state,
				status: VoiceConnectionStatus.Connecting,
			};
		}
	}

	/**
	 * Propagates errors from the underlying network instance.
	 *
	 * @param error - The error to propagate
	 */
	private onNetworkingError(error: Error) {
		this.emit('error', error);
	}

	/**
	 * Propagates debug messages from the underlying network instance.
	 *
	 * @param message - The debug message to propagate
	 */
	private onNetworkingDebug(message: string) {
		this.debug?.(`[NW] ${message}`);
	}

	/**
	 * Prepares an audio packet for dispatch
	 *
	 * @param buffer - The Opus packet to prepare
	 */
	public prepareAudioPacket(buffer: Buffer) {
		const state = this.state;
		if (state.status !== VoiceConnectionStatus.Ready) return;
		return state.networking.prepareAudioPacket(buffer);
	}

	/**
	 * Dispatches the previously prepared audio packet (if any)
	 */
	public dispatchAudio() {
		const state = this.state;
		if (state.status !== VoiceConnectionStatus.Ready) return;
		return state.networking.dispatchAudio();
	}

	/**
	 * Prepares an audio packet and dispatches it immediately
	 *
	 * @param buffer - The Opus packet to play
	 */
	public playOpusPacket(buffer: Buffer) {
		const state = this.state;
		if (state.status !== VoiceConnectionStatus.Ready) return;
		state.networking.prepareAudioPacket(buffer);
		return state.networking.dispatchAudio();
	}

	/**
	 * Destroys the VoiceConnection, preventing it from connecting to voice again.
	 * This method should be called when you no longer require the VoiceConnection to
	 * prevent memory leaks.
	 */
	public destroy() {
		if (this.state.status === VoiceConnectionStatus.Destroyed) {
			throw new Error('Cannot destroy VoiceConnection - it has already been destroyed');
		}
		if (getVoiceConnection(this.joinConfig.guildId) === this) {
			untrackVoiceConnection(this.joinConfig.guildId);
		}
		this.state.adapter.sendPayload(createJoinVoiceChannelPayload({ ...this.joinConfig, channelId: null }));
		this.state = {
			status: VoiceConnectionStatus.Destroyed,
		};
	}

	/**
	 * Attempts to reconnect the VoiceConnection if it is in the Disconnected state.
	 *
	 * @remarks
	 * Calling this method successfully will automatically increment the `reconnectAttempts` counter,
	 * which you can use to inform whether or not you'd like to keep attempting to reconnect your
	 * voice connection.
	 *
	 * A state transition from Disconnected to Signalling will be observed when this is called.
	 */
	public reconnect() {
		if (this.state.status !== VoiceConnectionStatus.Disconnected) {
			return false;
		}

		this.state.adapter.sendPayload(createJoinVoiceChannelPayload(this.joinConfig));
		this.reconnectAttempts++;

		this.state = {
			...this.state,
			status: VoiceConnectionStatus.Signalling,
		};
		return true;
	}

	/**
	 * Updates the speaking status of the voice connection. This is used when audio players are done playing audio,
	 * and need to signal that the connection is no longer playing audio.
	 *
	 * @param enabled - Whether or not to show as speaking
	 */
	public setSpeaking(enabled: boolean) {
		if (this.state.status !== VoiceConnectionStatus.Ready) return false;
		this.state.networking.setSpeaking(enabled);
	}

	/**
	 * Subscribes to an audio player, allowing the player to play audio on this voice connection.
	 *
	 * @param player - The audio player to subscribe to
	 * @returns The created subscription
	 */
	public subscribe(player: AudioPlayer) {
		if (this.state.status === VoiceConnectionStatus.Destroyed) return;

		// eslint-disable-next-line @typescript-eslint/dot-notation
		const subscription = player['subscribe'](this);

		this.state = {
			...this.state,
			subscription,
		};

		return subscription;
	}

	/**
	 * Called when a subscription of this voice connection to an audio player is removed.
	 *
	 * @param subscription - The removed subscription
	 */
	private onSubscriptionRemoved(subscription: PlayerSubscription) {
		if (this.state.status !== VoiceConnectionStatus.Destroyed && this.state.subscription === subscription) {
			this.state = {
				...this.state,
				subscription: undefined,
			};
		}
	}
}

/**
 * Creates a new voice connection
 *
 * @param joinConfig - The data required to establish the voice connection
 * @param options - The options to use when joining the voice channel
 */
export function createVoiceConnection(joinConfig: JoinConfig, options: CreateVoiceConnectionOptions) {
	const payload = createJoinVoiceChannelPayload(joinConfig);
	const existing = getVoiceConnection(joinConfig.guildId);
	if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
		existing.state.adapter.sendPayload(payload);
		return existing;
	}

	const voiceConnection = new VoiceConnection(joinConfig, options);
	trackVoiceConnection(joinConfig.guildId, voiceConnection);
	if (voiceConnection.state.status !== VoiceConnectionStatus.Destroyed) {
		voiceConnection.state.adapter.sendPayload(payload);
	}
	return voiceConnection;
}
