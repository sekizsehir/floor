"use client";

import { base, mainnet } from "wagmi/chains";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, http, fallback, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  connectorsForWallets,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  phantomWallet,
  baseAccount,
} from "@rainbow-me/rainbowkit/wallets";

import { Toaster } from "sonner";
import "@rainbow-me/rainbowkit/styles.css";
import { farcasterMiniApp } from "@farcaster/miniapp-wagmi-connector";
import { sdk } from "@farcaster/miniapp-sdk";
import { Attribution } from "ox/erc8021";

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ["bc_uzb9vqpt"],
});

const baseTransports = fallback(
  [
    process.env.NEXT_PUBLIC_BASE_RPC_PRIMARY
      ? http(process.env.NEXT_PUBLIC_BASE_RPC_PRIMARY)
      : null,
    process.env.NEXT_PUBLIC_BASE_RPC_FALLBACK
      ? http(process.env.NEXT_PUBLIC_BASE_RPC_FALLBACK)
      : null,
    http("https://mainnet.base.org"),
    http("https://base.llamarpc.com"),
    http("https://1rpc.io/base"),
  ].filter((t): t is ReturnType<typeof http> => Boolean(t)),
);

const mainnetTransports = fallback(
  [
    process.env.NEXT_PUBLIC_ETH_RPC_URL
      ? http(process.env.NEXT_PUBLIC_ETH_RPC_URL)
      : null,
    http("https://cloudflare-eth.com"),
    http("https://eth.llamarpc.com"),
  ].filter((t): t is ReturnType<typeof http> => Boolean(t)),
);

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  "f4be81876ed5bc310bbc1b67612831c3";

const connectors = connectorsForWallets(
  [
    {
      groupName: "Popular",
      wallets: [
        metaMaskWallet,
        walletConnectWallet,
        baseAccount,
        phantomWallet,
      ],
    },
  ],
  {
    appName: "flooor.fun",
    projectId,
  },
);

export const wagmiConfig = createConfig({
  chains: [base, mainnet],
  connectors: [...connectors, farcasterMiniApp()],
  transports: {
    [base.id]: baseTransports,
    [mainnet.id]: mainnetTransports,
  },
  dataSuffix: DATA_SUFFIX,
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 15_000,
            retry: 2,
          },
        },
      }),
  );

  useEffect(() => {
    let active = true;
    const notifyReady = async () => {
      try {
        if (active) {
          await sdk?.actions?.ready?.();
        }
      } catch {
        // Ignore outside Farcaster Mini App container
      }
    };
    notifyReady();
    return () => {
      active = false;
    };
  }, []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={base}
          appInfo={{
            appName: "flooor.fun",
            learnMoreUrl: "https://flooor.fun",
          }}
        >
          <Toaster position="top-right" richColors closeButton />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
