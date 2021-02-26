import { createVoiceConnection } from './VoiceConnection';
import { JoinConfig } from './DataStore';
import {
	GatewayVoiceServerUpdateDispatchData,
	GatewayVoiceStateUpdateDispatchData,
	Snowflake,
} from 'discord-api-types/v8';
import { EventEmitter } from 'events';

interface DiscordGatewayAdapterEvents {
	on(event: 'voiceStateUpdate', listener: (data: GatewayVoiceStateUpdateDispatchData) => void): this;
	on(event: 'voiceServerUpdate', listener: (data: GatewayVoiceServerUpdateDispatchData) => void): this;
}

/**
 * Used to connect a VoiceConnection to a main Discord gateway connection.
 */
export abstract class DiscordGatewayAdapter extends EventEmitter implements DiscordGatewayAdapterEvents {
	/**
	 * Called by @discordjs/voice when the adapter is no longer
	 */
	public abstract destroy?(): void;
	/**
	 * Called by @discordjs/voice when a payload needs to be forwarded to the gateway connection.
	 * The creator of the adapter should make sure that they implement this logic.
	 */
	public abstract sendPayload(data: any): void;
}

/**
 * The options that can be given when joining a voice channel
 */
export interface CreateVoiceConnectionOptions {
	/**
	 * If true, debug messages will be enabled for the voice connection and its
	 * related components. Defaults to false.
	 */
	debug?: boolean;
	adapter: DiscordGatewayAdapter;
}

export interface JoinVoiceChannelOptions {
	channelId: Snowflake;
	guildId: Snowflake;
}

/**
 * Creates a VoiceConnection to a Discord.js Voice Channel.
 *
 * @param voiceChannel - the voice channel to connect to
 * @param options - the options for joining the voice channel
 */
export function joinVoiceChannel(options: JoinVoiceChannelOptions & CreateVoiceConnectionOptions) {
	const joinConfig: JoinConfig = {
		channelId: options.channelId,
		guildId: options.guildId,
		selfDeaf: true,
		selfMute: false,
	};

	return createVoiceConnection(joinConfig, {
		adapter: options.adapter,
		debug: options.debug,
	});
}
