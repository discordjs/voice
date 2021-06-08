import Discord, { Interaction, GuildMember, Snowflake } from 'discord.js';
import {
	AudioPlayerStatus,
	AudioResource,
	entersState,
	joinVoiceChannel,
	VoiceConnectionStatus,
} from '@discordjs/voice';
import { createDiscordJSAdapter } from './music/adapter';
import { Track } from './music/track';
import { MusicSubscription } from './music/subscription';
import { token } from '../auth.example.json';

const client = new Discord.Client({ intents: ['GUILD_VOICE_STATES', 'GUILD_MESSAGES', 'GUILDS'] });

client.on('ready', () => console.log('Ready!'));

// This contains the setup code for creating slash commands in a guild. The owner of the bot can send "!deploy" to create them.
client.on('message', async (message) => {
	if (!message.guild) return;
	if (!client.application?.owner) await client.application?.fetch();

	if (message.content.toLowerCase() === '!deploy' && message.author.id === client.application?.owner?.id) {
		await message.guild.commands.create({
			name: 'play',
			description: 'Plays a song',
			options: [
				{
					name: 'song',
					type: 'STRING' as const,
					description: 'The URL of the song to play',
					required: true,
				},
			],
		});

		await message.guild.commands.create({
			name: 'skip',
			description: 'Skip to the next song in the queue',
		});

		await message.guild.commands.create({
			name: 'queue',
			description: 'See the music queue',
		});

		await message.guild.commands.create({
			name: 'pause',
			description: 'Pauses the song that is currently playing',
		});

		await message.guild.commands.create({
			name: 'resume',
			description: 'Resume playback of the current song',
		});

		await message.guild.commands.create({
			name: 'leave',
			description: 'Leave the voice channel',
		});

		await message.reply('Deployed!');
	}
});

/**
 * Maps guild IDs to music subscriptions, which exist if the bot has an active VoiceConnection to the guild.
 */
const subscriptions = new Map<Snowflake, MusicSubscription>();

// Handles slash command interactions
client.on('interaction', async (interaction: Interaction) => {
	if (!interaction.isCommand() || !interaction.guildID) return;
	let subscription = subscriptions.get(interaction.guildID);

	if (interaction.commandName === 'play') {
		// Extract the video URL from the command
		const url = interaction.options.get('song')!.value! as string;

		// If a connection to the guild doesn't already exist and the user is in a voice channel, join that channel
		// and create a subscription.
		if (!subscription) {
			if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
				const channel = interaction.member.voice.channel;
				subscription = new MusicSubscription(
					joinVoiceChannel({
						channelId: channel.id,
						guildId: channel.guild.id,
						adapterCreator: createDiscordJSAdapter(channel),
					}),
				);
				subscription.voiceConnection.on('error', console.warn);
				subscriptions.set(interaction.guildID, subscription);
			}
		}

		// If there is no subscription, tell the user they need to join a channel.
		if (!subscription) {
			await interaction.reply('Join a voice channel and then try that again!');
			return;
		}

		// Make sure the connection is ready before processing the user's request
		try {
			await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20e3);
		} catch (error) {
			console.warn(error);
			await interaction.reply('Failed to join voice channel within 20 seconds, please try again later!');
			return;
		}

		try {
			// Attempt to create a Track from the user's video URL
			const track = await Track.from(url, {
				onStart() {
					interaction.followUp(`Now playing!`, { ephemeral: true }).catch(console.warn);
				},
				onFinish() {
					interaction.followUp(`Now finished!`, { ephemeral: true }).catch(console.warn);
				},
				onError(error) {
					console.warn(error);
					interaction.followUp(`Error: ${error.message}`, { ephemeral: true }).catch(console.warn);
				},
			});
			// Enqueue the track and reply a success message to the user
			subscription.enqueue(track);
			await interaction.reply(`Enqueued **${track.title}**`);
		} catch (error) {
			console.warn(error);
			await interaction.reply('Failed to play track, please try again later!');
		}
	} else if (interaction.commandName === 'skip') {
		if (subscription) {
			// Calling .stop() on an AudioPlayer causes it to transition into the Idle state. Because of a state transition
			// listener defined in music/subscription.ts, transitions into the Idle state mean the next track from the queue
			// will be loaded and played.
			subscription.audioPlayer.stop();
			await interaction.reply('Skipped song!');
		} else {
			await interaction.reply('Not playing in this server!');
		}
	} else if (interaction.commandName === 'queue') {
		// Print out the current queue, including up to the next 5 tracks to be played.
		if (subscription) {
			const current =
				subscription.audioPlayer.state.status === AudioPlayerStatus.Idle
					? `Nothing is currently playing!`
					: `Playing **${(subscription.audioPlayer.state.resource as AudioResource<Track>).metadata!.title}**`;

			const queue = subscription.queue
				.slice(0, 5)
				.map((track, index) => `${index + 1}) ${track.title}`)
				.join('\n');

			await interaction.reply(`${current}\n\n${queue}`);
		}
	} else if (interaction.commandName === 'pause' && subscription) {
		subscription.audioPlayer.pause();
		await interaction.reply(`Paused!`, { ephemeral: true });
	} else if (interaction.commandName === 'resume' && subscription) {
		subscription.audioPlayer.unpause();
		await interaction.reply(`Unpaused!`, { ephemeral: true });
	} else if (interaction.commandName === 'leave' && subscription) {
		subscription.voiceConnection.destroy();
		subscriptions.delete(interaction.guildID);
		await interaction.reply(`Left channel!`, { ephemeral: true });
	}
});

client.on('error', console.warn);

void client.login(token);
