type SSRC = number;

export interface VoiceUserData {
	audioSSRC: SSRC;
	videoSSRC?: SSRC;
	userId: string;
	subscribed?: boolean;
}

export class SSRCMap {
	private readonly map: Map<SSRC, VoiceUserData>;

	public constructor() {
		this.map = new Map();
	}

	public add(data: VoiceUserData) {
		this.map.set(data.audioSSRC, {
			...(this.map.get(data.audioSSRC) ?? {}),
			...data,
		});
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
		this.map.delete(target);
	}

	public deleteByUserId(target: string) {
		for (const [ssrc, data] of this.map.entries()) {
			if (data.userId === target) {
				this.map.delete(ssrc);
			}
		}
	}
}
