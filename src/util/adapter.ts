import {
	GatewayVoiceServerUpdateDispatchData,
	GatewayVoiceStateUpdateDispatchData,
} from 'discord-api-types/v8/gateway';

/**
 * Methods that are provided by the @discordjs/voice library to implementations of
 * Discord gateway DiscordGatewayAdapters.
 */
export interface DiscordGatewayAdapterLibraryMethods {
	onVoiceServerUpdate(data: GatewayVoiceServerUpdateDispatchData): void;
	onVoiceStateUpdate(data: GatewayVoiceStateUpdateDispatchData): void;
}

/**
 * Methods that are provided by the implementer of a Discord gateway DiscordGatewayAdapter.
 */
export interface DiscordGatewayAdapterImplementerMethods {
	sendPayload(payload: any): void;
	destroy?(): void;
}

/**
 * A function used to build adapters. It accepts a methods parameter that contains functions that
 * can be called by the implementer when new data is received on its gateway connection. In return,
 * the implementer will return some methods that the library can call - e.g. to send messages on
 * the gateway, or to signal that the adapter can be removed.
 */
export type DiscordGatewayAdapterCreator = (
	methods: DiscordGatewayAdapterLibraryMethods,
) => DiscordGatewayAdapterImplementerMethods;
