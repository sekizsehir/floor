import MARKET_ABI_RAW from "@/app/abi/market.json";
import NFT_ABI_RAW from "@/app/abi/nft.json";
import { Attribution } from "ox/erc8021";
import { type Abi, type Address, namehash } from "viem";
import { getEnsName, readContract } from "wagmi/actions";
import { base, mainnet } from "wagmi/chains";
import type { Config } from "wagmi";

export const CONTRACT_ADDR =
  "0xF6B2C2411a101Db46c8513dDAef10b11184c58fF" as const satisfies Address;

export const COLLECTION_ADDR =
  "0xbB56a9359DF63014B3347585565d6F80Ac6305fd" as const satisfies Address;

// Official Base Mainnet ENSIP-19 L2 Resolver for *.base.eth Basenames
export const BASENAME_L2_RESOLVER =
  "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const satisfies Address;

export const MINIMUM_BID_FLOOR_ETH = "0.0015";
export const BUILDER_CODE = "bc_uzb9vqpt";
export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

export const MARKET_ABI = MARKET_ABI_RAW as Abi;
export const NFT_ABI = NFT_ABI_RAW as Abi;

const L2_RESOLVER_ABI = [
  {
    inputs: [{ internalType: "bytes32", name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const nameCache = new Map<string, string>();

export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Resolves a wallet address to:
 * 1) Base L2 Basename (`*.base.eth`) via official ENSIP-19 `80002105.reverse` node on Base Mainnet
 * 2) Ethereum Mainnet ENS (`*.eth`) via Wagmi `getEnsName`
 * 3) Shortened `0x1234...5678` address fallback
 */
export async function resolveAddressDisplayName(
  config: Config,
  address: string,
): Promise<string> {
  if (!address || address === "0x0000000000000000000000000000000000000000") {
    return "";
  }

  const key = address.toLowerCase();
  const cached = nameCache.get(key);
  if (cached) return cached;

  // 1. Try Base Mainnet Basename (*.base.eth) via ENSIP-19 reverse node
  try {
    const cleanHex = key.startsWith("0x") ? key.slice(2) : key;
    // CoinType for Base (chainId 8453): (0x80000000 | 8453) >>> 0 === 0x80002105
    const reverseNode = namehash(`${cleanHex}.80002105.reverse`);
    const baseName = await readContract(config, {
      chainId: base.id,
      address: BASENAME_L2_RESOLVER,
      abi: L2_RESOLVER_ABI,
      functionName: "name",
      args: [reverseNode],
    });

    if (baseName && typeof baseName === "string" && baseName.trim().length > 0) {
      nameCache.set(key, baseName);
      return baseName;
    }
  } catch {
    // Fall through to Ethereum Mainnet ENS
  }

  // 2. Try Ethereum Mainnet ENS (*.eth)
  try {
    const ensName = await getEnsName(config, {
      address: address as Address,
      chainId: mainnet.id,
    });
    if (ensName) {
      nameCache.set(key, ensName);
      return ensName;
    }
  } catch {
    // Fall through to shortened address
  }

  const fallbackLabel = shortenAddress(address);
  nameCache.set(key, fallbackLabel);
  return fallbackLabel;
}

/**
 * Safely decodes on-chain VRNouns `data:application/json;base64,...` tokenURI metadata.
 */
export function decodeOnChainTokenImage(tokenURI: string): string | null {
  try {
    if (tokenURI.startsWith("data:application/json;base64,")) {
      const base64Data = tokenURI.slice("data:application/json;base64,".length);
      const binary = atob(base64Data);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const decodedJson = new TextDecoder().decode(bytes);
      const metadata = JSON.parse(decodedJson) as {
        image?: string;
        image_data?: string;
      };

      if (metadata.image) {
        return metadata.image;
      }
      if (metadata.image_data) {
        const utf8Bytes = new TextEncoder().encode(metadata.image_data);
        let binarySvg = "";
        utf8Bytes.forEach((b) => {
          binarySvg += String.fromCharCode(b);
        });
        return `data:image/svg+xml;base64,${btoa(binarySvg)}`;
      }
    }
    if (tokenURI.startsWith("http") || tokenURI.startsWith("data:image/")) {
      return tokenURI;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Turns verbose Viem / wallet error objects into crisp user-facing messages.
 */
export function parseReadableContractError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request")
  ) {
    return "Transaction cancelled in wallet.";
  }
  if (lower.includes("insufficient funds")) {
    return "Insufficient ETH balance in wallet to cover amount + Base gas.";
  }
  if (lower.includes("owner cannot bid")) {
    return "Contract owner wallet cannot place bids.";
  }
  if (lower.includes("bid too low")) {
    return "Bid is below the required minimum increment. Use the Min button to fill the exact minimum.";
  }
  if (lower.includes("must hold exactly 1 nft")) {
    return "Wallet holds more than 1 VRNoun. Transfer extras so this wallet holds exactly 1 VRNoun.";
  }
  if (lower.includes("already signed")) {
    return "You already signed in this epoch.";
  }
  if (lower.includes("already claimed")) {
    return "You already claimed your reward for this epoch.";
  }
  if (lower.includes("token used")) {
    return "This VRNoun already signed in the current epoch from another wallet.";
  }
  if (lower.includes("wrong token for claim")) {
    return "You must hold the exact same VRNoun you signed with to claim this epoch.";
  }
  if (lower.includes("zero share")) {
    return "Current epoch reward pool has 0 claimable ETH.";
  }
  if (lower.includes("you cannot sell to yourself")) {
    return "Your wallet is currently the highest bidder — you cannot sell to yourself.";
  }
  if (lower.includes("no active bid")) {
    return "There is no active bid to sell into right now.";
  }

  const shortMatch = raw.match(/Details:\s*([^\n]+)/i);
  if (shortMatch?.[1]) return shortMatch[1].trim();

  const firstLine = raw.split("\n")[0]?.trim();
  return firstLine && firstLine.length <= 160
    ? firstLine
    : "Transaction failed. Please try again.";
}
