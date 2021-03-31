import EventEmitter from 'events';

type SSRC = number;

export interface VoiceUserData {
	audioSSRC: SSRC;
	videoSSRC?: SSRC;
	userId: string;
	subscribed?: boolean;
}

export class SSRCMap extends EventEmitter {
	private readonly map: Map<SSRC, VoiceUserData>;

	public constructor() {
		super();
		this.map = new Map();
	}

	public update(data: VoiceUserData) {
		const existing = this.map.get(data.audioSSRC);

		const newValue = {
			...this.map.get(data.audioSSRC),
			...data,
		};

		this.map.set(data.audioSSRC, newValue);
		this.emit('update', existing, newValue);
	}

	public getBySSRC(target: SSRC) {
		return this.map.get(target);
	}

	public getByUserId(target: string) {
		for (const data of this.map.values()) {
			if (data.userId === target) {
				return data;
			}
		}
	}

	public deleteBySSRC(target: SSRC) {
		const existing = this.map.get(target);
		if (existing) {
			this.map.delete(target);
			this.emit('delete', existing);
		}
	}

	public deleteByUserId(target: string) {
		for (const [ssrc, data] of this.map.entries()) {
			if (data.userId === target) {
				this.map.delete(ssrc);
				this.emit('delete', data);
			}
		}
	}
}
