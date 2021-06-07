import Discord, { Interaction, GuildMember, Snowflake } from 'discord.js';
import { AudioPlayerStatus, entersState, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { createDiscordJSAdapter } from './music/adapter';
import { Track, TrackMetadata } from './music/track';
import { MusicSubscription } from './music/subscription';
import { token } from '../auth.example.json';

const client = new Discord.Client({ intents: ['GUILD_VOICE_STATES', 'GUILD_MESSAGES', 'GUILDS'] });

client.on('ready', () => console.log('Ready!'));

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

const subscriptions = new Map<Snowflake, MusicSubscription>();

client.on('interaction', async (interaction: Interaction) => {
	if (!interaction.isCommand() || !interaction.guildID) return;
	let subscription = subscriptions.get(interaction.guildID);

	if (interaction.commandName === 'play') {
		const url = interaction.options.get('song')!.value! as string;

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

		if (!subscription) {
			await interaction.reply('Join a voice channel and then try that again!');
			return;
		}

		try {
			await entersState(subscription.voiceConnection, VoiceConnectionStatus.Ready, 20e3);
		} catch (error) {
			console.warn(error);
			await interaction.reply('Failed to join voice channel within 20 seconds, please try again later!');
			return;
		}

		try {
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

			subscription.enqueue(track);
			await interaction.reply(`Enqueued **${track.metadata.title}**`);
		} catch (error) {
			console.warn(error);
			await interaction.reply('Failed to play track, please try again later!');
		}
	} else if (interaction.commandName === 'skip') {
		const subscription = subscriptions.get(interaction.guildID);
		if (subscription) {
			subscription.audioPlayer.stop();
			await interaction.reply('Skipped song!');
		} else {
			await interaction.reply('Not playing in this server!');
		}
	} else if (interaction.commandName === 'queue') {
		if (subscription) {
			const current =
				subscription.audioPlayer.state.status === AudioPlayerStatus.Idle
					? `Nothing is currently playing!`
					: `Playing **${(subscription.audioPlayer.state.resource.metadata as TrackMetadata).title}**`;

			const queue = subscription.queue
				.slice(0, 5)
				.map((track, index) => `${index + 1}) ${track.metadata.title}`)
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
