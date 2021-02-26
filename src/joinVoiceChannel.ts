import { VoiceChannel } from 'discord.js';
import { createVoiceConnection } from './VoiceConnection';
import { JoinConfig } from './DataStore';
import { GatewayVoiceServerUpdateDispatchData, GatewayVoiceStateUpdateDispatchData } from 'discord-api-types/v8';
import { EventEmitter } from 'events';

/**
 * Used to connect a VoiceConnection to a main Discord gateway connection.
 */
export interface DiscordGatewayAdapter extends EventEmitter {
	on(event: 'voiceServerUpdate', listener: (data: GatewayVoiceServerUpdateDispatchData) => void): this;
	on(event: 'voiceStateUpdate', listener: (data: GatewayVoiceStateUpdateDispatchData) => void): this;
	/**
	 * Called by @discordjs/voice when the adapter is no longer
	 */
	destroy?(): void;
	/**
	 * Called by @discordjs/voice when a payload needs to be forwarded to the gateway connection.
	 * The creator of the adapter should make sure that they implement this logic.
	 */
	sendPayload(data: any): void;
}

/**
 * The options that can be given when joining a voice channel
 */
export interface JoinVoiceChannelOptions {
	/**
	 * If true, debug messages will be enabled for the voice connection and its
	 * related components. Defaults to false.
	 */
	debug?: boolean;
	adapter: DiscordGatewayAdapter;
}

/**
 * Creates a VoiceConnection to a Discord.js Voice Channel.
 *
 * @param voiceChannel - the voice channel to connect to
 * @param options - the options for joining the voice channel
 */
export function joinVoiceChannel(voiceChannel: VoiceChannel, options: JoinVoiceChannelOptions) {
	const joinConfig: JoinConfig = {
		channelId: voiceChannel.id,
		guild: voiceChannel.guild,
		selfDeaf: true,
		selfMute: false,
	};

	return createVoiceConnection(joinConfig, { debug: false, ...options });
}
