import { DiscordGatewayAdapterCreator, DiscordGatewayAdapterLibraryMethods } from '../../';
import { VoiceChannel, Snowflake, Client, Constants, WebSocketShard, Guild } from 'discord.js';
import {
	GatewayVoiceServerUpdateDispatchData,
	GatewayVoiceStateUpdateDispatchData,
} from 'discord-api-types/v8/gateway';

const adapters = new Map<Snowflake, DiscordGatewayAdapterLibraryMethods>();
const trackedClients = new Set<Client>();

/**
 * Tracks a Discord.js client, listening to VOICE_SERVER_UPDATE and VOICE_STATE_UPDATE events.
 * @param client - The Discord.js Client to track
 */
function trackClient(client: Client) {
	if (trackedClients.has(client)) return;
	trackedClients.add(client);
	client.ws.on(Constants.WSEvents.VOICE_SERVER_UPDATE, (payload: GatewayVoiceServerUpdateDispatchData) => {
		adapters.get(payload.guild_id)?.onVoiceServerUpdate(payload);
	});
	client.ws.on(Constants.WSEvents.VOICE_STATE_UPDATE, (payload: GatewayVoiceStateUpdateDispatchData) => {
		if (payload.guild_id && payload.session_id && payload.user_id === client.user?.id) {
			adapters.get(payload.guild_id)?.onVoiceStateUpdate(payload);
		}
	});
}

const trackedGuilds = new Map<WebSocketShard, Set<Snowflake>>();

function cleanupGuilds(shard: WebSocketShard) {
	const guilds = trackedGuilds.get(shard);
	if (guilds) {
		for (const guildID of guilds.values()) {
			adapters.get(guildID)?.destroy();
		}
	}
}

function trackGuild(guild: Guild) {
	let guilds = trackedGuilds.get(guild.shard);
	if (!guilds) {
		const cleanup = () => cleanupGuilds(guild.shard);
		guild.shard.on('close', cleanup);
		guild.shard.on('destroyed', cleanup);
		guilds = new Set();
		trackedGuilds.set(guild.shard, guilds);
	}
	guilds.add(guild.id);
}

/**
 * Creates an adapter for a Voice Channel
 * @param channel - The channel to create the adapter for
 */
export function createDiscordJSAdapter(channel: VoiceChannel): DiscordGatewayAdapterCreator {
	return (methods) => {
		adapters.set(channel.guild.id, methods);
		trackClient(channel.client);
		trackGuild(channel.guild);
		return {
			sendPayload(data) {
				return channel.guild.shard.send(data);
			},
			destroy() {
				return adapters.delete(channel.guild.id);
			},
		};
	};
}
