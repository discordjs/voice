import { GatewayDispatchEvents, GatewayOPCodes, GatewayVoiceServerUpdateDispatch, GatewayVoiceStateUpdateDispatch } from 'discord-api-types/v8/gateway';
import { Client, Constants, Guild } from 'discord.js';
import { VoiceConnection } from './VoiceConnection';

// Clients
const clients: Set<Client> = new Set();
export function trackClient(client: Client) {
	if (clients.has(client)) {
		return;
	}
	clients.add(client);
	client.on(Constants.Events.RAW, payload => {
		if (payload.t === GatewayDispatchEvents.VoiceServerUpdate) {
			const packet: GatewayVoiceServerUpdateDispatch = payload;
			getVoiceConnection(packet.d.guild_id)?.addServerPacket(packet);
		} else if (payload.t === GatewayDispatchEvents.VoiceStateUpdate) {
			const packet: GatewayVoiceStateUpdateDispatch = payload;
			if (packet.d.guild_id && packet.d.session_id && packet.d.user_id === client.user?.id) {
				getVoiceConnection(packet.d.guild_id)?.addStatePacket(packet);
			}
		}
	});
}

export interface JoinConfig {
	guild: Guild;
	channelId: string|null;
	selfDeaf: boolean;
	selfMute: boolean;
}

/**
 * Sends a voice state update to the main websocket shard of a guild, to indicate joining/leaving/moving across
 * voice channels
 * @param voiceChannel The voice channel to move to
 */
export function signalJoinVoiceChannel(config: JoinConfig) {
	return config.guild.shard.send({
		op: GatewayOPCodes.VoiceStateUpdate,
		d: {
			guild_id: config.guild.id,
			channel_id: config.channelId,
			self_deaf: config.selfDeaf,
			self_mute: config.selfMute
		}
	});
}

// Voice Connections
const voiceConnections: Map<string, VoiceConnection> = new Map();

export function getVoiceConnection(guildId: string) {
	return voiceConnections.get(guildId);
}

export function untrackVoiceConnection(guildId: string) {
	return voiceConnections.delete(guildId);
}

export function trackVoiceConnection(guildId: string, voiceConnection: VoiceConnection) {
	return voiceConnections.set(guildId, voiceConnection);
}
