import { Guild } from 'discord.js';

export const deploy = async (guild: Guild) => {
	await guild.commands.set([
		{
			name: 'join',
			description: 'Joins the voice channel that you are in',
		},
		{
			name: 'record',
			description: 'Enables recording for a user',
			options: [
				{
					name: 'speaker',
					type: 'USER' as const,
					description: 'The user to record',
					required: true,
				},
			],
		},
		{
			name: 'leave',
			description: 'Leave the voice channel',
		},
	]);
};
