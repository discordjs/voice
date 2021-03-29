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

/**
 * The options specified when joining a voice channel
 */
export interface JoinVoiceChannelOptions {
	/**
	 * The ID of the Discord voice channel to join
	 */
	channelId: string;
	/**
	 * The ID of the guild that the voice channel belongs to
	 */
	guildId: string;
	/**
	 * Whether to join the channel deafened (defaults to true)
	 */
	selfDeaf?: boolean;
	/**
	 * Whether to join the channel muted (defaults to true)
	 */
	selfMute?: boolean;
}

/**
 * Creates a VoiceConnection to a Discord.js Voice Channel.
 *
 * @param voiceChannel - the voice channel to connect to
 * @param options - the options for joining the voice channel
 */
export function joinVoiceChannel(options: JoinVoiceChannelOptions & CreateVoiceConnectionOptions) {
	const joinConfig: JoinConfig = {
		selfDeaf: true,
		selfMute: false,
		...options,
	};

	return createVoiceConnection(joinConfig, {
		adapterCreator: options.adapterCreator,
		debug: options.debug,
	});
}
