import { Client, Interaction } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { deploy } from './deploy';
import { interactionHandlers } from './interactions';

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const { token, deployment_guild_id } = require('../config.json');

const client = new Client({ intents: ['GUILD_VOICE_STATES', 'GUILDS'] });

client.on('ready', async () => {
	console.log('Ready!')

	const app = await client.application?.fetch();
	const devGuild = await client.guilds.fetch(deployment_guild_id).catch(() => null);
	if (app && devGuild) {
		await deploy(devGuild);
		console.log('Deployed commands!');
	}
});

/**
 * The IDs of the users that can be recorded by the bot.
 */
const recordable = new Set<string>();

client.on('interactionCreate', async (interaction: Interaction) => {
	if (!interaction.isCommand() || !interaction.guildId) return;

	const handler = interactionHandlers.get(interaction.commandName);

	try {
		if (handler) {
			await handler(interaction, recordable, client, getVoiceConnection(interaction.guildId));
		} else {
			await interaction.reply('Unknown command');
		}
	} catch (error) {
		console.warn(error);
	}
});

client.on('error', console.warn);

void client.login(token);
