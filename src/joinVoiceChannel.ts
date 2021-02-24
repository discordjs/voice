import { VoiceChannel } from 'discord.js';
import { createVoiceConnection } from './VoiceConnection';
import { JoinConfig } from './DataStore';

/**
 * The options that can be given when joining a voice channel
 */
export interface JoinVoiceChannelOptions {
	/**
	 * If true, debug messages will be enabled for the voice connection and its
	 * related components. Defaults to false.
	 */
	debug?: boolean;
}

/**
 * Creates a VoiceConnection to a Discord.js Voice Channel.
 *
 * @param voiceChannel - the voice channel to connect to
 * @param options - the options for joining the voice channel
 */
export function joinVoiceChannel(voiceChannel: VoiceChannel, options?: JoinVoiceChannelOptions) {
	const joinConfig: JoinConfig = {
		channelId: voiceChannel.id,
		guild: voiceChannel.guild,
		selfDeaf: true,
		selfMute: false,
	};

	return createVoiceConnection(joinConfig, { debug: false, ...options });
}
