import Discord, { Interaction, GuildMember, Snowflake } from 'discord.js';
import { entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } from '@discordjs/voice';
import { SILENCE_FRAME } from '../../../dist/audio/AudioPlayer';
import { deploy } from './deploy';
import { createListeningStream } from './createListeningStream';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const { token } = require('../auth.json');

const client = new Discord.Client({ intents: ['GUILD_VOICE_STATES', 'GUILD_MESSAGES', 'GUILDS'] });

client.on('ready', () => console.log('Ready!'));

// This contains the setup code for creating slash commands in a guild. The owner of the bot can send "!deploy" to create them.
client.on('messageCreate', async (message) => {
	if (!message.guild) return;
	if (!client.application?.owner) await client.application?.fetch();

	if (message.content.toLowerCase() === '!deploy' && message.author.id === client.application?.owner?.id) {
		await deploy(message.guild);
		await message.reply('Deployed!');
	}
});

const listening = new Set<string>();

// Handles slash command interactions
client.on('interactionCreate', async (interaction: Interaction) => {
	if (!interaction.isCommand() || !interaction.guildId) return;

	let connection = getVoiceConnection(interaction.guildId);

	if (interaction.commandName === 'join') {
		await interaction.deferReply();

		// If a connection to the guild doesn't already exist and the user is in a voice channel, join that channel
		// and create a subscription.
		if (!connection) {
			if (interaction.member instanceof GuildMember && interaction.member.voice.channel) {
				const channel = interaction.member.voice.channel;
				connection = joinVoiceChannel({
					channelId: channel.id,
					guildId: channel.guild.id,
					adapterCreator: channel.guild.voiceAdapterCreator,
					selfDeaf: false,
				});
			}
		}

		// If there is no subscription, tell the user they need to join a channel.
		if (!connection) {
			await interaction.followUp('Join a voice channel and then try that again!');
			return;
		}

		// Make sure the connection is ready before processing the user's request
		try {
			await entersState(connection, VoiceConnectionStatus.Ready, 20e3);
			const receiver = connection.receiver;
			connection.playOpusPacket(SILENCE_FRAME);

			connection.receiver.speaking.on('start', (userId) => {
				if (listening.has(userId)) {
					createListeningStream(receiver, userId, client.users.cache.get(userId));
				}
			});
			await interaction.followUp('Ready!');
		} catch (error) {
			console.warn(error);
			await interaction.followUp('Failed to join voice channel within 20 seconds, please try again later!');
		}
	} else if (interaction.commandName === 'listen') {
		if (connection) {
			const userId = interaction.options.get('speaker')!.value! as Snowflake;
			try {
				listening.add(userId);
				await interaction.reply({
					ephemeral: true,
					content: 'Listening!',
				});
			} catch (error) {
				console.warn(error);
			}
		}
	} else if (interaction.commandName === 'leave') {
		if (connection) {
			connection.destroy();
			await interaction.reply({ content: `Left channel!`, ephemeral: true });
		} else {
			await interaction.reply('Not playing in this server!');
		}
	} else {
		await interaction.reply('Unknown command');
	}
});

client.on('error', console.warn);

void client.login(token);
