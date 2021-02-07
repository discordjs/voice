import { Readable } from 'stream';
import * as prism from 'prism-media';

/*
	This module creates a Transformer Graph to figure out what the most efficient way
	of transforming the input stream into something playable would be.
*/

const FFMPEG_ARGUMENTS = ['-analyzeduration', '0', '-loglevel', '0', '-f', 's16le', '-ar', '48000', '-ac', '2'];

/**
 * The different types of stream that can exist within the pipeline
 *
 * - `Arbitrary` - the type of the stream at this point is unknown.
 *
 * - `Raw` - the stream at this point is s16le PCM.
 *
 * - `OggOpus` - the stream at this point is Opus audio encoded in an Ogg wrapper.
 *
 * - `WebmOpus` - the stream at this point is Opus audio encoded in a WebM wrapper.
 *
 * - `Opus` - the stream at this point is Opus audio, and the stream is in object-mode. This is ready to play.
 */
export enum StreamType {
	Arbitrary = 'arbitrary',
	Raw = 'raw',
	OggOpus = 'ogg/opus',
	WebmOpus = 'webm/opus',
	Opus = 'opus',
}

/**
 * The different types of transformers that can exist within the pipeline
 */
export enum TransformerType {
	FFmpegPCM = 'ffmpeg pcm',
	OpusEncoder = 'opus encoder',
	OpusDecoder = 'opus decoder',
	OggOpusDemuxer = 'ogg opus demuxer',
	WebmOpusDemuxer = 'webm opus demuxer',
}

/**
 * Represents a transformer within the transformer pipeline.
 */
interface TransformerComponent {
	transformer: (input: string | Readable) => Readable;
	cost: number;
	type: TransformerType;
}

/**
 * Represents a section of the transformer pipeline.
 */
export interface TransformerPathComponent extends TransformerComponent {
	/**
	 * The StreamType that comes into this transformer (its input)
	 */
	from: Node;

	/**
	 * The StreamType that comes out of this transformer (its result)
	 */
	to: Node;

	/**
	 * A function that returns a transformer stream that will map the input stream
	 * to the specified output of this section of the transformer pipeline.
	 *
	 * For example, a section that goes from Raw to Opus may have the transformer
	 * as a function that returns an Opus encoder.
	 */
	transformer: (input: string | Readable) => Readable;

	/**
	 * The arbitrary cost assigned to this component. More computationally expensive
	 * transformer components will have higher costs.
	 */
	cost: number;
}

type Node = StreamType;
type Edge = [Node, Node];

const GRAPH: Map<Edge, TransformerComponent> = new Map();

GRAPH.set([StreamType.Raw, StreamType.Opus], {
	transformer: () => new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 }),
	cost: 1,
	type: TransformerType.OpusEncoder,
});

GRAPH.set([StreamType.Opus, StreamType.Raw], {
	transformer: () => new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 }),
	cost: 1,
	type: TransformerType.OpusDecoder,
});

GRAPH.set([StreamType.OggOpus, StreamType.Opus], {
	transformer: () => new prism.opus.OggDemuxer(),
	cost: 0.5,
	type: TransformerType.OggOpusDemuxer,
});

GRAPH.set([StreamType.WebmOpus, StreamType.Opus], {
	transformer: () => new prism.opus.WebmDemuxer(),
	cost: 0.5,
	type: TransformerType.WebmOpusDemuxer,
});

GRAPH.set([StreamType.Arbitrary, StreamType.Raw], {
	transformer: (input) =>
		new prism.FFmpeg({
			args: typeof input === 'string' ? ['-i', input, ...FFMPEG_ARGUMENTS] : FFMPEG_ARGUMENTS,
		}),
	cost: 2,
	type: TransformerType.FFmpegPCM,
});

const EDGES_LIST = [...GRAPH.keys()];
const GRAPH_LIST = [...GRAPH.entries()];

/**
 * Returns all the outbound edges from a given node
 * @param node The source node
 */
function getOutboundEdges(node: StreamType) {
	return GRAPH_LIST.filter(([edge]) => edge[0] === node);
}

/**
 * Finds an edge in the transformer graph that directly connects a to b.
 *
 * @param a The source node
 * @param b The target node
 */
function getEdge(a: Node, b: Node) {
	return GRAPH_LIST.find(([edge]) => a === edge[0] && b === edge[1]);
}

/**
 * Finds the optimal path between the start and goal using the Transformer Graph.
 * @param start The start node
 * @param goal The goal node
 * @param edges The edges of the graph
 */
export function findTransformerPipeline(start: Node, goal = StreamType.Opus, edges = EDGES_LIST) {
	const Q: Set<Node> = new Set(edges.reduce((acc, edge) => acc.concat(edge), [] as Node[]));

	if (start === goal) {
		return [];
	}

	const dist: Map<Node, number> = new Map();
	const prev: Map<Node, Node> = new Map();

	for (const node of Q) {
		dist.set(node, Infinity);
	}
	dist.set(start, 0);

	while (Q.size > 0) {
		const u = [...Q.values()].sort((a, b) => dist.get(a)! - dist.get(b)!)[0];
		Q.delete(u);
		const neighbourEdges = getOutboundEdges(u);
		for (const [edge, { cost }] of neighbourEdges) {
			const v = edge[1];
			if (!Q.has(v)) continue;

			const alt = dist.get(u)! + cost;
			if (alt < dist.get(v)!) {
				dist.set(v, alt);
				prev.set(v, u);
			}
		}
	}

	const path = [];
	let current: StreamType | undefined = goal;
	while (current) {
		path.unshift(current);
		current = prev.get(current);
	}

	// If the path is not connected, return null
	if (path[0] !== start) {
		return null;
	}

	const transformerPath: TransformerPathComponent[] = [];
	for (let i = 0; i < path.length - 1; i++) {
		const edge = getEdge(path[i], path[i + 1])!;
		transformerPath.push({
			from: path[i],
			to: path[i + 1],
			...edge[1],
		});
	}

	return transformerPath;
}
