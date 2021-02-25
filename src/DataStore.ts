import { Snowflake } from 'discord-api-types/v8';
import {
	GatewayVoiceServerUpdateDispatchData,
	GatewayVoiceStateUpdateDispatchData,
} from 'discord-api-types/v8/gateway';
import { AudioPlayer } from './audio';
import { VoiceConnection } from './VoiceConnection';

export function handleVoiceServerUpdate(payload: GatewayVoiceServerUpdateDispatchData) {
	return getVoiceConnection(payload.guild_id)?.addServerPacket(payload);
}

export function handleVoiceStateUpdate(payload: GatewayVoiceStateUpdateDispatchData, clientId: string) {
	if (payload.guild_id && payload.session_id && payload.user_id === clientId) {
		getVoiceConnection(payload.guild_id)?.addStatePacket(payload);
	}
}

export interface JoinConfig {
	guildId: Snowflake;
	channelId: Snowflake | null;
	selfDeaf: boolean;
	selfMute: boolean;
}

// Voice Connections
const voiceConnections: Map<Snowflake, VoiceConnection> = new Map();

export function getVoiceConnection(guildId: Snowflake) {
	return voiceConnections.get(guildId);
}

export function untrackVoiceConnection(guildId: Snowflake) {
	return voiceConnections.delete(guildId);
}

export function trackVoiceConnection(guildId: Snowflake, voiceConnection: VoiceConnection) {
	return voiceConnections.set(guildId, voiceConnection);
}

// Audio Players

// Each audio packet is 20ms long
const FRAME_LENGTH = 20;

let audioCycleInterval: NodeJS.Timeout | undefined;
let nextTime = -1;

/**
 * A list of created audio players that are still active and haven't been destroyed.
 */
const audioPlayers: AudioPlayer[] = [];

/**
 * Called roughly every 20 milliseconds. Dispatches audio from all players, and then gets the players to prepare
 * the next audio frame.
 */
function audioCycleStep() {
	nextTime += FRAME_LENGTH;
	const available = audioPlayers.filter((player) => player.checkPlayable());

	// eslint-disable-next-line @typescript-eslint/dot-notation
	available.forEach((player) => player['_stepDispatch']());

	prepareNextAudioFrame(available);
}

/**
 * Recursively gets the players that have been passed as parameters to prepare audio frames that can be played.
 * at the start of the next cycle.
 */
function prepareNextAudioFrame(players: AudioPlayer[]) {
	const nextPlayer = players.shift();

	if (!nextPlayer) {
		if (nextTime !== -1) {
			audioCycleInterval = setTimeout(() => audioCycleStep(), nextTime - Date.now());
		}
		return;
	}

	// eslint-disable-next-line @typescript-eslint/dot-notation
	nextPlayer['_stepPrepare']();

	// setImmediate to avoid long audio player chains blocking other scheduled tasks
	setImmediate(() => prepareNextAudioFrame(players));
}

/**
 * Checks whether or not the given audio player is being driven by the data store clock.
 *
 * @param target - The target to test for
 * @returns true if it is being tracked, false otherwise
 */
export function hasAudioPlayer(target: AudioPlayer) {
	return audioPlayers.includes(target);
}

/**
 * Adds an audio player to the data store tracking list, if it isn't already there.
 *
 * @param player - The player to track
 */
export function addAudioPlayer(player: AudioPlayer) {
	if (hasAudioPlayer(player)) return player;
	audioPlayers.push(player);
	if (audioPlayers.length === 1) {
		nextTime = Date.now();
		setImmediate(() => audioCycleStep());
	}
	return player;
}

/**
 * Removes an audio player from the data store tracking list, if it is present there.
 */
export function deleteAudioPlayer(player: AudioPlayer) {
	const index = audioPlayers.indexOf(player);
	if (index === -1) return;
	audioPlayers.splice(index, 1);
	if (audioPlayers.length === 0) {
		nextTime = -1;
		if (typeof audioCycleInterval !== 'undefined') clearTimeout(audioCycleInterval);
	}
}
