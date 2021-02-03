import { VoiceChannel } from 'discord.js';
import { createVoiceConnection } from './VoiceConnection';
import { JoinConfig } from './DataStore';

/**
 * Creates a VoiceConnection to a Discord.js Voice Channel.
 */
export function joinVoiceChannel(voiceChannel: VoiceChannel) {
	const joinConfig: JoinConfig = {
		channelId: voiceChannel.id,
		guild: voiceChannel.guild,
		selfDeaf: true,
		selfMute: false
	};

	return createVoiceConnection(joinConfig);
}
