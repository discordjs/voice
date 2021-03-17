import { VoiceOPCodes } from 'discord-api-types/v8/gateway';
import EventEmitter from 'events';
import WebSocket, { MessageEvent } from 'ws';

/**
 * Debug event for VoiceWebSocket.
 *
 * @event VoiceWebSocket#debug
 * @type {string}
 */

/**
 * An extension of the WebSocket class to provide helper functionality when interacting
 * with the Discord Voice gateway.
 */
export class VoiceWebSocket extends EventEmitter {
	/**
	 * The current heartbeat interval, if any
	 */
	private heartbeatInterval?: NodeJS.Timeout;

	/**
	 * The time (milliseconds since UNIX epoch) that the last heartbeat acknowledgement packet was received.
	 * This is set to 0 if an acknowledgement packet hasn't been received yet.
	 */
	private lastHeartbeatAck: number;

	/**
	 * The time (milliseconds since UNIX epoch) that the last heartbeat was sent. This is set to 0 if a heartbeat
	 * hasn't been sent yet.
	 */
	private lastHeatbeatSend: number;

	/**
	 * The last recorded ping.
	 */
	public ping?: number;

	/**
	 * The debug logger function, if debugging is enabled.
	 */
	private readonly debug: null | ((message: string) => void);

	/**
	 * The underlying WebSocket of this wrapper
	 */
	private readonly ws: WebSocket;

	/**
	 * Creates a new VoiceWebSocket
	 *
	 * @param address - The address to connect to
	 */
	public constructor(address: string, debug: boolean) {
		super();
		this.ws = new WebSocket(address);
		this.ws.onmessage = (e) => this.onMessage(e);
		this.ws.onopen = (e) => this.emit('open', e);
		this.ws.onerror = (e) => this.emit('error', e);
		this.ws.onclose = (e) => this.emit('close', e);

		this.lastHeartbeatAck = 0;
		this.lastHeatbeatSend = 0;

		this.debug = debug ? this.emit.bind(this, 'debug') : null;
	}

	/**
	 * Destroys the VoiceWebSocket. The heartbeat interval is cleared, and the connection is closed.
	 */
	public destroy() {
		try {
			this.debug?.('destroyed');
			this.setHeartbeatInterval(-1);
			this.ws.close(1000);
		} catch (error) {
			this.emit('error', error);
		}
	}

	/**
	 * Handles message events on the WebSocket. Attempts to JSON parse the messages and emit them
	 * as packets.
	 *
	 * @param event - The message event
	 */
	public onMessage(event: MessageEvent) {
		if (typeof event.data !== 'string') return;

		this.debug?.(`<< ${event.data}`);

		let packet: any;
		try {
			packet = JSON.parse(event.data);
		} catch (error) {
			this.emit('error', error);
			return;
		}

		if (packet.op === VoiceOPCodes.HeartbeatAck) {
			this.lastHeartbeatAck = Date.now();
			this.ping = this.lastHeartbeatAck - this.lastHeatbeatSend;
		}

		/**
		 * Packet event.
		 *
		 * @event VoiceWebSocket#packet
		 * @type {any}
		 */
		this.emit('packet', packet);
	}

	/**
	 * Sends a JSON-stringifiable packet over the WebSocket
	 *
	 * @param packet - The packet to send
	 */
	public sendPacket(packet: any) {
		try {
			const stringified = JSON.stringify(packet);
			this.debug?.(`>> ${stringified}`);
			return this.ws.send(stringified);
		} catch (error) {
			this.emit('error', error);
		}
	}

	/**
	 * Sends a heartbeat over the WebSocket
	 */
	private sendHeartbeat() {
		this.lastHeatbeatSend = Date.now();
		const nonce = this.lastHeatbeatSend;
		return this.sendPacket({
			op: VoiceOPCodes.Heartbeat,
			d: nonce,
		});
	}

	/**
	 * Sets/clears an interval to send heartbeats over the WebSocket
	 *
	 * @param ms - The interval in milliseconds. If negative, the interval will be unset.
	 */
	public setHeartbeatInterval(ms: number) {
		if (typeof this.heartbeatInterval !== 'undefined') clearInterval(this.heartbeatInterval);
		if (ms > 0) {
			this.heartbeatInterval = setInterval(() => {
				if (this.lastHeartbeatAck !== 0 && Date.now() - this.lastHeartbeatAck >= 3 * ms) {
					// Missed too many heartbeats - disconnect
					this.ws.close();
				}
				this.sendHeartbeat();
			}, ms);
		}
	}
}
