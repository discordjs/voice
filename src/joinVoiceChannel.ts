import { createVoiceConnection } from './VoiceConnection';
import { JoinConfig } from './DataStore';
import { DiscordGatewayAdapterCreator } from './util/adapter';

/**
 * The options that can be given when joining a voice channel
 */
export interface CreateVoiceConnectionOptions {
	/**
	 * If true, debug messages will be enabled for the voice connection and its
	 * related components. Defaults to false.
	 */
	debug?: boolean;
	adapterCreator: DiscordGatewayAdapterCreator;
}

export interface JoinVoiceChannelOptions {
	channelId: string;
	guildId: string;
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
		adapterCreator: options.adapterCreator,
		debug: options.debug,
	});
}
