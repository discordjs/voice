import { TypedEmitter } from 'tiny-typed-emitter';
import { Awaited } from '../util/util';

export interface SpeakingMapEvents {
	start: (userId: string) => Awaited<void>;
	end: (userId: string) => Awaited<void>;
}

export class SpeakingMap extends TypedEmitter<SpeakingMapEvents> {
	public static readonly DELAY = 100;
	public readonly users: Map<string, number>;
	private readonly speakingTimeouts: Map<string, NodeJS.Timeout>;

	public constructor() {
		super();
		this.users = new Map();
		this.speakingTimeouts = new Map();
	}

	public onPacket(userId: string) {
		const timeout = this.speakingTimeouts.get(userId);
		if (timeout) {
			clearTimeout(timeout);
		} else {
			this.users.set(userId, Date.now());
			this.emit('start', userId);
		}
		this.startTimeout(userId);
	}

	private startTimeout(userId: string) {
		this.speakingTimeouts.set(
			userId,
			setTimeout(() => {
				this.emit('end', userId);
				this.speakingTimeouts.delete(userId);
				this.users.delete(userId);
			}, SpeakingMap.DELAY),
		);
	}
}
