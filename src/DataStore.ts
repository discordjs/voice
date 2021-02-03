import { GatewayOPCodes } from 'discord-api-types/v8/gateway';
import { GatewayVoiceState } from 'discord-api-types/v8/payloads/voice';
import { Client, Guild } from 'discord.js';
import { VoiceConnection } from './VoiceConnection';

/**
 * The inner payload of a VOICE_SERVER_UPDATE packet
 */
export interface GatewayVoiceServerUpdate {
	token: string;
	guild_id: string;
	endpoint: string;
}

// Clients
const clients: Set<Client> = new Set();
export function trackClient(client: Client) {
	if (clients.has(client)) {
		return;
	}
	clients.add(client);

	client.ws.on('VOICE_SERVER_UPDATE', (payload: GatewayVoiceServerUpdate) => {
		getVoiceConnection(payload.guild_id)?.addServerPacket(payload);
	});

	client.ws.on('VOICE_STATE_UPDATE', (payload: GatewayVoiceState) => {
		if (payload.guild_id && payload.session_id && payload.user_id === client.user?.id) {
			getVoiceConnection(payload.guild_id)?.addStatePacket(payload);
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
