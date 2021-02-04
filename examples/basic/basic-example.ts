import { Client, VoiceChannel } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, AudioPlayerStatus, VoiceConnectionStatus } from '@discordjs/voice';
import { errorAfter } from './util';
import { once } from 'events';

/*
	In this example, we are creating a single audio player that plays to a number of
	voice channels.

	The audio player will play a single track.
*/

/*
	Create the audio player. We will use this for all of our connections.
*/
const player = createAudioPlayer();

function playSong() {
	/*
		Here we are creating an audio resource using a sample song freely available online
		(see https://www.soundhelix.com/audio-examples)

		We specify an arbitrary inputType. This means that we aren't too sure what the format of
		the input is, and that we'd like to have this converted into a format we can use. If we
		were using an Ogg or WebM source, then we could change this value. However, for now we
		will leave this as arbitrary.
	*/
	const resource = createAudioResource(
		'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
		{ inputType: StreamType.Arbitrary }
	);

	/*
		We will now play this to the audio player. By default, the audio player will not play until
		at least one voice connection is subscribed to it, so we do not have to worry about attaching
		our resource to the audio player so early.
	*/
	player.play(resource);

	/*
		If the audio player is immediately ready to start playing, then we can return here.
	 */
	if (player.state.status === AudioPlayerStatus.Playing) {
		return Promise.resolve();
	}

	/*
		If the song isn't yet ready to play, we will allow it 5 seconds to become ready to play.
		Otherwise, we will throw an error. This stops us waiting indefinitely.
	 */
	return Promise.race([
		once(player, AudioPlayerStatus.Playing),
		errorAfter(5e3, 'The stream was not ready after 5 seconds!')
	]);
}

async function connectToChannel(channel: VoiceChannel) {
	/*
		Here, we try to establish a connection to a voice channel. If we're already connected
		to this voice channel, @discordjs/voice will just return the existing connection for
		us!
	*/
	const connection = joinVoiceChannel(channel);

	/*
		In case the connection already exists, we should check to see if that connection is
		in the Ready state. If it is, then we can return it.
	*/
	if (connection.state.status === VoiceConnectionStatus.Ready) {
		return connection;
	}

	/**
	 * If we're dealing with a connection that isn't yet Ready, we can set a reasonable
	 * time limit before giving up. In this example, we give the voice connection 30 seconds
	 * to enter the ready state before giving up.
	 */
	try {
		await Promise.race([
			once(connection, VoiceConnectionStatus.Ready),
			errorAfter(30e3, 'Voice connection was not ready after 30 seconds!')
		]);
		/*
			At this point, the voice connection is ready within 30 seconds! This means we can
			start playing audio in the voice channel. We return the connection so it can be
			used by the caller.
		*/
		return connection;
	} catch (error) {
		/*
			At this point, the voice connection has not entered the Ready state. We should make
			sure to destroy it, and propagate the error by throwing it, so that the calling function
			is aware that we failed to connect to the channel.
		*/
		connection.destroy();
		throw error;
	}
}

/*
	Main code
	=========
	Here we will implement the helper functions that we have defined above
*/
const client = new Client();
client.login('token here');

client.on('ready', async () => {
	console.log('Discord.js client is ready!');

	/*
		Try to get our song ready to play for when the bot joins a voice channel
	*/
	try {
		await playSong();
		console.log('Song is ready to play!');
	} catch (error) {
		/*
			The song isn't ready to play for some reason :(
		*/
		console.error(error);
	}
});

client.on('message', async message => {
	if (!message.guild) return;

	if (message.content === '-join') {
		const channel = message.member?.voice.channel;

		if (channel) {
			/*
				The user is in a voice channel, try to connect
			*/
			try {
				const connection = await connectToChannel(channel);

				/*
					We have successfully connected! Now we can subscribe our connection to
					the player. This means that the player will play audio in the user's
					voice channel.
				*/
				connection.subscribe(player);
				message.reply('Playing now!');
			} catch (error) {
				/*
					Unable to connect to the voice channel within 30 seconds :(
				*/
				console.error(error);
			}
		} else {
			/*
				The user is not in a voice channel
			*/
			message.reply('Join a voice channel then try again!');
		}
	}
});
