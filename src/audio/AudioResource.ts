import { Edge, findPipeline, StreamType, TransformerType } from './TransformerGraph';
import { pipeline, Readable } from 'stream';
import { noop } from '../util/util';
import { VolumeTransformer } from 'prism-media';
import type { AudioPlayer } from './AudioPlayer';

/**
 * Options that are set when creating a new audio resource.
 */
interface CreateAudioResourceOptions<T> {
	/**
	 * The type of the input stream. Defaults to `StreamType.Arbitrary`.
	 */
	inputType?: StreamType;

	/**
	 * Optional metadata that can be attached to the resource (e.g. track title, random ID).
	 * This is useful for identification purposes when the resource is passed around in events.
	 */
	metadata?: T;

	/**
	 * Whether or not inline volume should be enabled. If enabled, you will be able to change the volume
	 * of the stream on-the-fly. However, this also increases the performance cost of playback. Defaults to `false`.
	 */
	inlineVolume?: boolean;
}

/**
 * Represents an audio resource that can be played by an audio player.
 */
export class AudioResource<T> {
	/**
	 * An object-mode Readable stream that emits Opus packets. This is what is played by audio players.
	 */
	public readonly playStream: Readable;

	/**
	 * The pipeline used to convert the input stream into a playable format. For example, this may
	 * contain an FFmpeg component for arbitrary inputs, and it may contain a VolumeTransformer component
	 * for resources with inline volume transformation enabled.
	 */
	public readonly pipeline: Edge[];

	/**
	 * Optional metadata that can be used to identify the resource.
	 */
	public metadata?: T;

	/**
	 * If the resource was created with inline volume transformation enabled, then this will be a
	 * prism-media VolumeTransformer. You can use this to alter the volume of the stream.
	 */
	public readonly volume?: VolumeTransformer;

	/**
	 * The audio player that the resource is subscribed to, if any.
	 */
	public audioPlayer?: AudioPlayer;

	public constructor(pipeline: Edge[], playStream: Readable, metadata?: T, volume?: VolumeTransformer) {
		this.pipeline = pipeline;
		this.playStream = playStream;
		this.metadata = metadata;
		this.volume = volume;
	}
}

/**
 * Ensures that a path contains at least one volume transforming component
 *
 * @param path - The path to validate constraints on
 */
const VOLUME_CONSTRAINT = (path: Edge[]) => path.some((edge) => edge.type === TransformerType.InlineVolume);

/**
 * Creates an audio resource that can be played be audio players.
 *
 * @remarks
 * If the input is given as a string, then the inputType option will be overridden and FFmpeg will be used.
 *
 * If the input is not in the correct format, then a pipeline of transcoders and transformers will be created
 * to ensure that the resultant stream is in the correct format for playback. This could involve using FFmpeg,
 * Opus transcoders, and Ogg/WebM demuxers.
 *
 * @param input - The resource to play.
 * @param options - Configurable options for creating the resource.
 */
export function createAudioResource<T>(
	input: string | Readable,
	options: CreateAudioResourceOptions<T> = {},
): AudioResource<T> {
	let inputType = options.inputType ?? StreamType.Arbitrary;

	// string inputs can only be used with FFmpeg
	if (typeof input === 'string') {
		inputType = StreamType.Arbitrary;
	}

	const transformerPipeline = findPipeline(inputType, options.inlineVolume ? VOLUME_CONSTRAINT : () => true);

	if (transformerPipeline.length === 0) {
		if (typeof input === 'string') throw new Error(`Invalid pipeline constructed for string resource '${input}'`);
		// No adjustments required
		return new AudioResource([], input, options.metadata);
	}
	const streams = transformerPipeline.map((pipe) => pipe.transformer(input));
	if (typeof input !== 'string') streams.unshift(input);

	// the callback is called once the stream ends
	const playStream = pipeline(streams, noop);

	// attempt to find the volume transformer in the pipeline (if one exists)
	const volume = streams.find((stream) => stream instanceof VolumeTransformer) as VolumeTransformer | undefined;

	return new AudioResource(transformerPipeline, (playStream as any) as Readable, options.metadata, volume);
}
