import {
	GatewayOPCodes,
	GatewayVoiceServerUpdateDispatchData,
	GatewayVoiceStateUpdateDispatchData,
} from 'discord-api-types/v8/gateway';
import { Client, Constants, Guild } from 'discord.js';
import { AudioPlayer, AudioPlayerStatus } from './audio';
import { VoiceConnection } from './VoiceConnection';

// Clients
const clients: Set<Client> = new Set();
export function trackClient(client: Client) {
	if (clients.has(client)) {
		return;
	}
	clients.add(client);

	client.ws.on(Constants.WSEvents.VOICE_SERVER_UPDATE, (payload: GatewayVoiceServerUpdateDispatchData) => {
		getVoiceConnection(payload.guild_id)?.addServerPacket(payload);
	});

	client.ws.on(Constants.WSEvents.VOICE_STATE_UPDATE, (payload: GatewayVoiceStateUpdateDispatchData) => {
		if (payload.guild_id && payload.session_id && payload.user_id === client.user?.id) {
			getVoiceConnection(payload.guild_id)?.addStatePacket(payload);
		}
	});
}

export interface JoinConfig {
	guild: Guild;
	channelId: string | null;
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
			self_mute: config.selfMute,
		},
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

// Audio Players
let audioCycleInterval: NodeJS.Timeout | undefined;
let nextTime = -1;
const audioPlayers: AudioPlayer[] = [];

function audioCycleStep() {
	nextTime += 20;
	const available = audioPlayers.filter(
		(player) => player.state.status !== AudioPlayerStatus.Idle && player.state.status !== AudioPlayerStatus.Buffering,
	);

	// eslint-disable-next-line @typescript-eslint/dot-notation
	available.forEach((player) => player['_step']());
	audioCycleInterval = setTimeout(() => audioCycleStep(), nextTime - Date.now());
}

export function hasAudioPlayer(target: AudioPlayer) {
	return audioPlayers.some((player) => player === target);
}

export function addAudioPlayer(player: AudioPlayer) {
	if (hasAudioPlayer(player)) return player;
	audioPlayers.push(player);
	if (audioPlayers.length === 1) {
		nextTime = Date.now();
		setImmediate(() => audioCycleStep());
	}
}

export function deleteAudioPlayer(player: AudioPlayer) {
	for (let i = 0; i < audioPlayers.length; i++) {
		if (audioPlayers[i] === player) {
			audioPlayers.splice(i, 1);
			break;
		}
	}
	if (audioPlayers.length === 0 && typeof audioCycleInterval !== 'undefined') {
		clearTimeout(audioCycleInterval);
	}
}
