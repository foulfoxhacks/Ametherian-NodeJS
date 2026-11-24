import type { AmetherianError } from '@foulfoxhacks/ametherian-core';
import type { LookupFunction } from 'node:net';

export type AddressCategory =
  | 'public' | 'unspecified' | 'loopback' | 'private' | 'link-local' | 'unique-local'
  | 'cgnat' | 'multicast' | 'broadcast' | 'documentation' | 'benchmarking' | 'reserved';

export declare const ADDRESS_CATEGORIES: readonly AddressCategory[];
export declare function classifyAddress(ip: string): AddressCategory | null;
export declare function ipToBytes(ip: string): number[] | null;
export declare function unbracket(host: string): string;

export declare const DESTINATION_BLOCKED: 'AMETHERIAN_DESTINATION_BLOCKED';
export type BlockReason =
  | 'invalid-url' | 'protocol' | 'credentials' | 'port' | 'denied-host' | 'host-not-allowed'
  | 'blocked-address' | 'protocol-downgrade' | 'invalid-address';

export declare class DestinationBlockedError extends AmetherianError {
  readonly code: typeof DESTINATION_BLOCKED;
  readonly details: Readonly<{
    reason: BlockReason;
    url?: string;
    host?: string;
    address?: string;
    category?: AddressCategory | null;
  }>;
}

export interface DestinationPolicyOptions {
  allowedProtocols?: string[];
  allowCategories?: Exclude<AddressCategory, 'public'>[];
  allowHosts?: string[];
  denyHosts?: string[];
  allowPorts?: number[];
  allowCredentials?: boolean;
  allowDowngrade?: boolean;
  lookup?: LookupFunction;
}

export interface DestinationPolicy {
  checkUrl(input: string | URL, base?: string | URL): URL;
  checkRedirect(from: string | URL, location: string): URL;
  checkAddress(address: string, hostname?: string): void;
  checkHost(host: string): string;
  lookup: LookupFunction;
  readonly options: Readonly<Required<Omit<DestinationPolicyOptions, 'allowPorts' | 'lookup'>> & Pick<DestinationPolicyOptions, 'allowPorts' | 'lookup'>>;
}

export declare function createDestinationPolicy(options?: DestinationPolicyOptions): DestinationPolicy;
