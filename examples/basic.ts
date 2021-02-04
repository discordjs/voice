// todo

import { Client, VoiceChannel } from 'discord.js';
import { joinVoiceChannel } from '../';
import { getVoiceConnection } from '../dist/DataStore';
import { createAudioPlayer } from '../dist/audio/AudioPlayer';
import { createAudioResource } from '../dist/audio/AudioResource';
import { StreamType } from '../dist/audio/TransformerGraph';

const player = createAudioPlayer();
const resource = createAudioResource('file.mp3', { inputType: StreamType.Arbitrary });
resource.playStream.once('readable', () => player.play(resource));

const client = new Client();
client.login('token here');

client.on('message', message => {
	if (!message.guild) return;

	if (message.content.startsWith('-join')) {
		const channelID = message.content.split(' ')[1];
		const channel = message.guild.channels.cache.get(channelID);

		if (channel instanceof VoiceChannel) {
			connectToChannel(channel);
		}
	}
});

function connectToChannel(channel: VoiceChannel) {
	const existingConnection = getVoiceConnection(channel.guild.id);
	if (existingConnection) {
		return;
	}

	const voiceConnection = joinVoiceChannel(channel);

	voiceConnection.once('ready', () => {
		player.subscribe(voiceConnection);
	});
}
