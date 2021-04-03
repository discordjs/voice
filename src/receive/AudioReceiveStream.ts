import { Readable, ReadableOptions } from 'stream';

/**
 * A readable stream of Opus packets received from a specific entity
 * in a Discord voice connection.
 */
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
