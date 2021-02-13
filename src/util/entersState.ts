import { VoiceConnection, VoiceConnectionStatus } from '../VoiceConnection';
import { AudioPlayer, AudioPlayerStatus } from '../audio/AudioPlayer';

/**
 * Allows a target a specified amount of time to enter a given state, otherwise rejects with an error.
 *
 * @param target The object that we want to observe the state change for
 * @param status The status that the target should be in
 * @param maxTime The maximum time we are allowing for this to occur
 */
export function entersState(
	target: VoiceConnection,
	status: VoiceConnectionStatus,
	maxTime: number,
): Promise<VoiceConnection>;

/**
 * Allows a target a specified amount of time to enter a given state, otherwise rejects with an error.
 *
 * @param target The object that we want to observe the state change for
 * @param status The status that the target should be in
 * @param maxTime The maximum time we are allowing for this to occur
 */
export function entersState(target: AudioPlayer, status: AudioPlayerStatus, maxTime: number): Promise<AudioPlayer>;

export function entersState<T extends VoiceConnection | AudioPlayer>(
	target: T,
	status: VoiceConnectionStatus | AudioPlayerStatus,
	maxTime: number,
) {
	if (target.state.status === status) {
		return Promise.resolve(target);
	}
	let cleanup: () => void;
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(
			() => reject(new Error(`Did not enter state ${status as string} within ${maxTime}ms`)),
			maxTime,
		);

		const once = (target as any).once;
		const off = (target as any).once;

		once(status, resolve);
		once('error', reject);

		cleanup = () => {
			clearTimeout(timeout);
			off(status, resolve);
			off('error', reject);
		};
	})
		.then(() => target)
		.finally(cleanup!);
}
