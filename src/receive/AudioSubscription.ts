import EventEmitter from 'events';
import { Readable, ReadableOptions } from 'stream';

export class ReceiveAudioStream extends Readable {
	private paused = false;
	private readonly queue: Buffer[];

	public constructor(options?: ReadableOptions) {
		super({
			...options,
			objectMode: true,
		});
		this.queue = [];
	}

	public _read() {
		this.paused = false;
		while (this.queue.length > 0) {
			const packet = this.queue.shift()!;
			if (!this.push(packet)) {
				this.paused = true;
			}
		}
	}

	public addPacket(packet: Buffer) {
		if (this.paused) {
			this.queue.push(packet);
		} else if (!this.push(packet)) {
			this.paused = true;
		}
	}
}

export class AudioSubscription extends EventEmitter {
	public stream?: ReceiveAudioStream;

	public addPacket(packet: Buffer) {
		this.emit('packet', packet);
		this.stream?.addPacket(packet);
	}

	public createStream() {
		if (this.stream) return this.stream;
		this.stream = new ReceiveAudioStream();
		return this.stream;
	}

	public destroy() {
		this.stream?.destroy();
		this.emit('destroy');
	}
}
