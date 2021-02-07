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
	InlineVolume = 'inline volume',
}

export interface Edge {
	from: Node;
	to: Node;
	cost: number;
	transformer: (input: string | Readable) => Readable;
	type: TransformerType;
}

export class Node {
	public readonly edges: Edge[] = [];
	public readonly type: StreamType;

	public constructor(type: StreamType) {
		this.type = type;
	}

	public addEdge(edge: Omit<Edge, 'from'>) {
		this.edges.push({ ...edge, from: this });
	}

	public toString() {
		return this.type;
	}
}

const GRAPH: Map<StreamType, Node> = new Map();
for (const streamType of Object.values(StreamType)) {
	GRAPH.set(streamType, new Node(streamType));
}

export function getNode(type: StreamType) {
	const node = GRAPH.get(type);
	if (!node) {
		throw new Error(`Node type '${type}' does not exist!`);
	}
	return node;
}

getNode(StreamType.Raw).addEdge({
	type: TransformerType.OpusEncoder,
	to: getNode(StreamType.Opus),
	cost: 1,
	transformer: () => new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 }),
});

getNode(StreamType.Opus).addEdge({
	type: TransformerType.OpusDecoder,
	to: getNode(StreamType.Raw),
	cost: 1,
	transformer: () => new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 }),
});

getNode(StreamType.OggOpus).addEdge({
	type: TransformerType.OggOpusDemuxer,
	to: getNode(StreamType.Opus),
	cost: 0.5,
	transformer: () => new prism.opus.OggDemuxer(),
});

getNode(StreamType.WebmOpus).addEdge({
	type: TransformerType.WebmOpusDemuxer,
	to: getNode(StreamType.Opus),
	cost: 0.5,
	transformer: () => new prism.opus.WebmDemuxer(),
});

getNode(StreamType.Arbitrary).addEdge({
	type: TransformerType.FFmpegPCM,
	to: getNode(StreamType.Raw),
	cost: 2,
	transformer: (input) =>
		new prism.FFmpeg({
			args: typeof input === 'string' ? ['-i', input, ...FFMPEG_ARGUMENTS] : FFMPEG_ARGUMENTS,
		}),
});

/**
 * Returns all the outbound edges from a given node
 * @param node The source node
 */
function getOutboundEdges(node: Node) {
	return node.edges;
}

/**
 * Finds an edge in the transformer graph that directly connects a to b.
 *
 * @param a The source node
 * @param b The target node
 */
function getEdge(a: Node, b: Node) {
	return a.edges.find((edge) => edge.to === b);
}

/**
 * Finds the optimal path between the start and goal using the Transformer Graph.
 * @param start The start node
 * @param goal The goal node
 * @param edges The edges of the graph
 */
export function findTransformerPipeline(start: Node, goal = getNode(StreamType.Opus)) {
	const Q: Set<Node> = new Set(GRAPH.values());

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
		for (const edge of neighbourEdges) {
			const v = edge.to;
			if (!Q.has(v)) continue;

			const alt = dist.get(u)! + edge.cost;
			if (alt < dist.get(v)!) {
				dist.set(v, alt);
				prev.set(v, u);
			}
		}
	}

	const path = [];
	let current: Node | undefined = goal;
	while (current) {
		path.unshift(current);
		current = prev.get(current);
	}

	// If the path is not connected, return null
	if (path[0] !== start) {
		return null;
	}

	const transformerPath: Edge[] = [];
	for (let i = 0; i < path.length - 1; i++) {
		const edge = getEdge(path[i], path[i + 1])!;
		transformerPath.push(edge);
	}

	return transformerPath;
}

// console.log(findTransformerPipeline(getNode(StreamType.OggOpus)));
