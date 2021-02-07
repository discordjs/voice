import { Edge, findTransformerPipeline, getNode, StreamType, TransformerType } from './TransformerGraph';
import { pipeline, Readable } from 'stream';
import { noop } from '../util/util';
import { VolumeTransformer, opus } from 'prism-media';

/**
 * Options that are set when creating a new audio resource.
 */
interface CreateAudioResourceOptions {
	/**
	 * The type of the input stream. Defaults to `StreamType.Arbitrary`.
	 */
	inputType?: StreamType;

	/**
	 * An optional name that can be attached to the resource. This could be a track title, song name etc.
	 * This is useful for identification purposes when the resource is passed around in events.
	 */
	name?: string;

	/**
	 * Whether or not inline volume should be enabled. If enabled, you will be able to change the volume
	 * of the stream on-the-fly. However, this also increases the performance cost of playback. Defaults to `false`.
	 */
	inlineVolume?: boolean;
}

/**
 * Represents an audio resource that can be played by an audio player.
 */
export interface AudioResource {
	/**
	 * An object-mode Readable stream that emits Opus packets. This is what is played by audio players.
	 */
	playStream: Readable;

	/**
	 * The pipeline used to convert the input stream into a playable format. For example, this may
	 * contain an FFmpeg component for arbitrary inputs, and it may contain a VolumeTransformer component
	 * for resources with inline volume transformation enabled.
	 */
	pipeline: Edge[];

	/**
	 * An optional name that can be used to identify the resource.
	 */
	name?: string;

	/**
	 * If the resource was created with inline volume transformation enabled, then this will be a
	 * prism-media VolumeTransformer. You can use this to alter the volume of the stream.
	 */
	volume?: VolumeTransformer;
}

/**
 * Creates an audio resource that can be played be audio players.
 *
 * If the input is given as a string, then the inputType option will be overridden and FFmpeg will be used.
 *
 * If the input is not in the correct format, then a pipeline of transcoders and transformers will be created
 * to ensure that the resultant stream is in the correct format for playback. This could involve using FFmpeg,
 * Opus transcoders, and Ogg/WebM demuxers.
 *
 * @param input The resource to play.
 * @param options Configurable options for creating the resource.
 */
export function createAudioResource(input: string | Readable, options: CreateAudioResourceOptions = {}): AudioResource {
	let inputType = options.inputType ?? StreamType.Arbitrary;

	// string inputs can only be used with FFmpeg
	if (typeof input === 'string') {
		inputType = StreamType.Arbitrary;
	}

	const transformerPipeline = findTransformerPipeline(getNode(inputType));
	if (!transformerPipeline) {
		throw new Error(`Cannot create transcoder pipeline for stream type '${inputType}'`);
	}

	let volumeTransformer: VolumeTransformer | undefined;
	if (options.inlineVolume) {
		volumeTransformer = insertInlineVolumeTransformer(transformerPipeline);
	}

	if (transformerPipeline.length === 0) {
		if (typeof input === 'string') throw new Error(`Invalid pipeline constructed for string resource '${input}'`);
		// No adjustments required
		return {
			playStream: input,
			pipeline: [],
		};
	}
	const streams = [...transformerPipeline.map((pipe) => pipe.transformer(input))];
	if (typeof input !== 'string') streams.unshift(input);

	// the callback is called once the stream ends
	const playStream = pipeline(streams, noop);
	// @types/node seems to be incorrect here - the output can still implement Readable
	return {
		playStream: (playStream as any) as Readable,
		pipeline: transformerPipeline,
		name: options.name,
		volume: volumeTransformer,
	};
}

/**
 * Inserts a prism VolumeTransformer into a pipeline such that the volume of the audio can be altered on-the-fly.
 * @param transformerPipeline The pipeline to insert into
 */
function insertInlineVolumeTransformer(transformerPipeline: Edge[]) {
	const volumeTransformer = new VolumeTransformer({ type: 's16le', volume: 1 });
	const transformer = {
		from: getNode(StreamType.Raw),
		to: getNode(StreamType.Raw),
		cost: 0.5,
		transformer: () => volumeTransformer,
		type: TransformerType.InlineVolume,
	};

	// The best insertion would be immediately after a Raw phase in the pipeline
	for (let i = 0; i < transformerPipeline.length; i++) {
		const component = transformerPipeline[i];
		if (component.to === getNode(StreamType.Raw)) {
			transformerPipeline.splice(i + 1, 0, transformer);
			return volumeTransformer;
		}
	}

	// There is no Raw phase in the pipeline - need to decode final Opus phase, add VolumeTransformer, then reinsert an Opus encoder
	transformerPipeline.push({
		cost: 0.5,
		from: getNode(StreamType.Opus),
		to: getNode(StreamType.Raw),
		transformer: () => new opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 }),
		type: TransformerType.OpusDecoder,
	});

	transformerPipeline.push(transformer);

	transformerPipeline.push({
		cost: 0.5,
		from: getNode(StreamType.Raw),
		to: getNode(StreamType.Opus),
		transformer: () => new opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 }),
		type: TransformerType.OpusEncoder,
	});
	return volumeTransformer;
}
