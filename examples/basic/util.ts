import { AudioPlayer, AudioPlayerStatus, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { once } from 'events';

export function entersState(target: VoiceConnection, status: VoiceConnectionStatus, maxTime: number): Promise<VoiceConnection>;
export function entersState(target: AudioPlayer, status: AudioPlayerStatus, maxTime: number): Promise<AudioPlayer>;

/**
 * Allows a target a specified amount of time to enter a given state, otherwise rejects with an error.
 * 
 * @param target The object that we want to observe the state change for
 * @param status The status that the target should be in
 * @param maxTime The maximum time we are allowing for this to occur
 */
export function entersState<T extends VoiceConnection | AudioPlayer>(target: T, status: VoiceConnectionStatus | AudioPlayerStatus, maxTime: number) {
	if (target.state.status === status) {
		return Promise.resolve(target);
	}

	const timeout = setTimeout(() => Promise.reject(new Error(`Did not enter state ${status} within ${maxTime}ms`)), maxTime);

	return Promise.race([once(target, status), timeout])
		.then(() => Promise.resolve(target))
		.finally(() => clearTimeout(timeout));
}
