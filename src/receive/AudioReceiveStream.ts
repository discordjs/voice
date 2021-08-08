import { Readable, ReadableOptions } from 'stream';
import { SILENCE_FRAME } from '../audio/AudioPlayer';

export enum EndBehaviorType {
	Manual,
	AfterSilence,
	AfterInactivity,
}

export type EndBehavior =
	| {
			behavior: EndBehaviorType.Manual;
	  }
	| {
			behavior: EndBehaviorType.AfterSilence | EndBehaviorType.AfterInactivity;
			duration: number;
	  };

export interface AudioReceiveStreamOptions extends ReadableOptions {
	end: EndBehavior;
}

export function createDefaultAudioReceiveStreamOptions(): AudioReceiveStreamOptions {
	return {
		end: {
			behavior: EndBehaviorType.Manual,
		},
	};
}

/**
 * A readable stream of Opus packets received from a specific entity
 * in a Discord voice connection.
 */
export class AudioReceiveStream extends Readable {
	public readonly end: EndBehavior;

	private endTimeout?: NodeJS.Timeout;

	public constructor({ end, ...options }: AudioReceiveStreamOptions) {
		super({
			...options,
			objectMode: true,
		});

		this.end = end;
	}

	public push(buffer: Buffer | null) {
		if (buffer) {
			if (
				this.end.behavior === EndBehaviorType.AfterInactivity ||
				(this.end.behavior === EndBehaviorType.AfterSilence && buffer.compare(SILENCE_FRAME) === 0)
			) {
				this.renewEndTimeout(this.end);
			}
		}

		return super.push(buffer);
	}

	private renewEndTimeout(end: EndBehavior & { duration: number }) {
		if (this.endTimeout) {
			clearTimeout(this.endTimeout);
		}
		this.endTimeout = setTimeout(() => super.push(null), end.duration);
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	public _read() {}
}
