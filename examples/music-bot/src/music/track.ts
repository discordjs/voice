import ytdl, { getInfo } from 'ytdl-core-discord';
import { AudioResource, createAudioResource, StreamType } from '@discordjs/voice';

export interface TrackMetadata {
	url: string;
	title: string;
	onStart: () => void;
	onFinish: () => void;
	onError: (error: Error) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export class Track {
	public readonly metadata: TrackMetadata;

	private constructor(metadata: TrackMetadata) {
		this.metadata = metadata;
	}

	public async createAudioResource(): Promise<AudioResource<TrackMetadata>> {
		return createAudioResource(await ytdl(this.metadata.url), { metadata: this.metadata, inputType: StreamType.Opus });
	}

	public static async from(
		url: string,
		methods: Pick<TrackMetadata, 'onStart' | 'onFinish' | 'onError'>,
	): Promise<Track> {
		const info = await getInfo(url);

		const wrappedMethods: Pick<TrackMetadata, 'onStart' | 'onFinish' | 'onError'> = {
			onStart() {
				wrappedMethods.onStart = noop;
				methods.onStart();
			},
			onFinish() {
				wrappedMethods.onFinish = noop;
				methods.onFinish();
			},
			onError(error) {
				wrappedMethods.onError = noop;
				methods.onError(error);
			},
		};

		return new Track({
			title: info.videoDetails.title,
			url,
			...wrappedMethods,
		});
	}
}
