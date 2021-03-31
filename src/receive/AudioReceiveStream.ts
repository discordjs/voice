import { Readable, ReadableOptions } from 'stream';

export class AudioReceiveStream extends Readable {
	public constructor(options?: ReadableOptions) {
		super({
			...options,
			objectMode: true,
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	public _read() {}
}
