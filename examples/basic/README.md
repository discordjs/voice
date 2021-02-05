# Basic Example

This example will demonstrate how to join a voice channel and play resources, with some best practice
assistance on making sure you aren't waiting indefinitely for things to happen.

To achieve this, the example sets some fairly arbitrary time constraints for things such as joining
voice channels and audio becoming available.

## Code snippet

This code snippet doesn't include any comments for brevity. If you want to see the full source code,
check the other files in this folder!

```ts
import { Client, VoiceChannel, Intents } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice';
import { errorAfter } from './util';
import { once } from 'events';

const player = createAudioPlayer();

function playSong() {
	const resource = createAudioResource(
		'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
		{ inputType: StreamType.Arbitrary }
	);

	player.play(resource);

	if (player.state.status === AudioPlayerStatus.Playing) {
		return Promise.resolve();
	}

	return Promise.race([
		once(player, AudioPlayerStatus.Playing),
		errorAfter(5e3, 'The stream was not ready after 5 seconds!')
	]);
}

async function connectToChannel(channel: VoiceChannel) {
	const connection = joinVoiceChannel(channel);

	if (connection.state.status === VoiceConnectionStatus.Ready) {
		return connection;
	}

	try {
		await Promise.race([
			once(connection, VoiceConnectionStatus.Ready),
			errorAfter(30e3, 'Voice connection was not ready after 30 seconds!')
		]);
		return connection;
	} catch (error) {
		connection.destroy();
		throw error;
	}
}

const client = new Client({ ws: { intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] } });
client.login('token here');

client.on('ready', async () => {
	console.log('Discord.js client is ready!');
	try {
		await playSong();
		console.log('Song is ready to play!');
	} catch (error) {
		console.error(error);
	}
});

client.on('message', async message => {
	if (!message.guild) return;

	if (message.content === '-join') {
		const channel = message.member?.voice.channel;

		if (channel) {
			try {
				const connection = await connectToChannel(channel);
				connection.subscribe(player);
				message.reply('Playing now!');
			} catch (error) {
				console.error(error);
			}
		} else {
			message.reply('Join a voice channel then try again!');
		}
	}
});
```
