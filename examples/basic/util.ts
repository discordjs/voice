import { AudioPlayer, AudioPlayerStatus, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';

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
	return new Promise((resolve, reject) => {
		if (target.state.status === status) {
			return resolve(target);
		}

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error(`Did not enter state ${status} within ${maxTime}ms`))
		}, maxTime);

		target.once(status, () => {
			cleanup();
			resolve(target);
		});

		target.once('error', error => {
			cleanup();
			reject(error);
		});
	
		const cleanup = () => {
			clearTimeout(timeout);
			target.off(status, resolve);
			target.off('error', reject);
		};
	});
}
