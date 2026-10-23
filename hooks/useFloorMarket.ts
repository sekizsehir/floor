"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  useConfig,
} from "wagmi";
import {
  getPublicClient,
  multicall,
  simulateContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import { base } from "wagmi/chains";
import {
  type Address,
  formatEther,
  isAddress,
  parseAbiItem,
  parseEther,
} from "viem";
import { toast } from "sonner";
import {
  COLLECTION_ADDR,
  CONTRACT_ADDR,
  DATA_SUFFIX,
  MARKET_ABI,
  MINIMUM_BID_FLOOR_ETH,
  NFT_ABI,
  decodeOnChainTokenImage,
  parseReadableContractError,
  resolveAddressDisplayName,
} from "@/lib/contracts";

export interface PhaseInfo {
  currentPhase: string;
  eid: bigint;
  elapsed: bigint;
  remaining: bigint;
}

export interface MarketActivityItem {
  id: string;
  type: "bid" | "sale" | "sign" | "claim";
  actor: string;
  actorLabel: string;
  counterparty?: string;
  tokenId?: string;
  amountEth?: string;
  txHash: string;
  blockNumber: bigint;
}

const FLOOR_MIN_BID_WEI = parseEther(MINIMUM_BID_FLOOR_ETH);

const BID_PLACED_EVENT = parseAbiItem(
  "event BidPlaced(address indexed bidder, uint256 amount, address indexed refunded, uint256 refundAmount)",
);
const SALE_SETTLED_EVENT = parseAbiItem(
  "event SaleSettled(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 amount)",
);
const STAKED_EVENT = parseAbiItem(
  "event Staked(address indexed user, uint256 indexed tokenId, uint256 epochStart)",
);
const CLAIMED_EVENT = parseAbiItem(
  "event Claimed(address indexed user, uint256 epochStart, uint256 share)",
);

/**
 * Rounds a wei value UP to `stepDecimals` decimals so user-facing quick-bid numbers
 * stay clean while strictly satisfying `msg.value >= nextMinBid()` on-chain.
 */
function formatMinBidCeil(wei: bigint, stepDecimals = 6): string {
  if (wei <= BigInt(0)) return MINIMUM_BID_FLOOR_ETH;
  const step = BigInt(10) ** BigInt(18 - stepDecimals);
  const roundedWei = ((wei + step - BigInt(1)) / step) * step;
  const raw = formatEther(roundedWei);
  const [whole, frac = ""] = raw.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole;
}

export function useFloorMarket() {
  const config = useConfig();
  const chainId = useChainId();
  const { address } = useAccount();
  const { data: walletBalance, refetch: refetchBalance } = useBalance({
    address,
    chainId: base.id,
  });

  const [bidInput, setBidInput] = useState("");
  const [phaseInfo, setPhaseInfo] = useState<PhaseInfo | null>(null);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState<number>(0);

  const [dailySigners, setDailySigners] = useState<number>(0);
  const [claimedCount, setClaimedCount] = useState<number>(0);
  const [dailyVaultWei, setDailyVaultWei] = useState<bigint>(BigInt(0));
  const [queuedNextEpochWei, setQueuedNextEpochWei] = useState<bigint>(
    BigInt(0),
  );
  const [yieldPerNftWei, setYieldPerNftWei] = useState<bigint>(BigInt(0));

  const [currentBidWei, setCurrentBidWei] = useState<bigint>(BigInt(0));
  const [requiredMinBidWei, setRequiredMinBidWei] =
    useState<bigint>(FLOOR_MIN_BID_WEI);
  const [minIncrementPct, setMinIncrementPct] = useState<number>(2);
  const [activeBidder, setActiveBidder] = useState<string>("");
  const [activeBidderName, setActiveBidderName] = useState<string>("");

  const [userNFTs, setUserNFTs] = useState<bigint[]>([]);
  const [nftImages, setNftImages] = useState<Record<string, string>>({});
  const [nftApprovalStatus, setNftApprovalStatus] = useState<
    Record<string, boolean>
  >({});
  const [nftLoadingStatus, setNftLoadingStatus] = useState<
    Record<string, boolean>
  >({});
  const [userSignedTokenId, setUserSignedTokenId] = useState<bigint | null>(
    null,
  );
  const [userHasSigned, setUserHasSigned] = useState<boolean>(false);
  const [userHasClaimed, setUserHasClaimed] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCheckingApproval, setIsCheckingApproval] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [activities, setActivities] = useState<MarketActivityItem[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState<boolean>(false);

  const showNetworkWarning = Boolean(address && chainId !== base.id);

  // Fetch live ETH/USD reference price with CoinGecko fallback
  const fetchEthPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      );
      if (res.ok) {
        const data = (await res.json()) as { price?: string };
        if (data.price) {
          setEthPrice(parseFloat(data.price));
          return;
        }
      }
    } catch {
      // Fallback to Coinbase spot ticker if Binance is geo-blocked
    }

    try {
      const res = await fetch(
        "https://api.coinbase.com/v2/prices/ETH-USD/spot",
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: { amount?: string } };
        if (json.data?.amount) {
          setEthPrice(parseFloat(json.data.amount));
        }
      }
    } catch {
      // Leave USD conversion hidden if offline
    }
  }, []);

  useEffect(() => {
    fetchEthPrice();
    const timer = setInterval(fetchEthPrice, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [fetchEthPrice]);

  // Fetch recent on-chain activity logs from Base Mainnet
  const fetchRecentActivity = useCallback(async () => {
    setIsLoadingActivity(true);
    try {
      const client = getPublicClient(config, { chainId: base.id });
      if (!client) return;

      const latestBlock = await client.getBlockNumber();
      const ranges = [BigInt(9_500), BigInt(2_000), BigInt(500)];

      for (const span of ranges) {
        try {
          const fromBlock =
            latestBlock > span ? latestBlock - span : BigInt(0);

          const [bids, sales, stakes, claims] = await Promise.all([
            client.getLogs({
              address: CONTRACT_ADDR,
              event: BID_PLACED_EVENT,
              fromBlock,
              toBlock: latestBlock,
            }),
            client.getLogs({
              address: CONTRACT_ADDR,
              event: SALE_SETTLED_EVENT,
              fromBlock,
              toBlock: latestBlock,
            }),
            client.getLogs({
              address: CONTRACT_ADDR,
              event: STAKED_EVENT,
              fromBlock,
              toBlock: latestBlock,
            }),
            client.getLogs({
              address: CONTRACT_ADDR,
              event: CLAIMED_EVENT,
              fromBlock,
              toBlock: latestBlock,
            }),
          ]);

          type RawItem = Omit<MarketActivityItem, "actorLabel"> & {
            logIndex: number;
          };
          const rawItems: RawItem[] = [];

          for (const log of bids) {
            if (!log.args.bidder || log.args.amount === undefined) continue;
            rawItems.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "bid",
              actor: log.args.bidder,
              amountEth: formatEther(log.args.amount),
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
            });
          }

          for (const log of sales) {
            if (!log.args.seller || log.args.amount === undefined) continue;
            rawItems.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "sale",
              actor: log.args.seller,
              counterparty: log.args.buyer,
              tokenId: log.args.tokenId?.toString(),
              amountEth: formatEther(log.args.amount),
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
            });
          }

          for (const log of stakes) {
            if (!log.args.user) continue;
            rawItems.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "sign",
              actor: log.args.user,
              tokenId: log.args.tokenId?.toString(),
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
            });
          }

          for (const log of claims) {
            if (!log.args.user || log.args.share === undefined) continue;
            rawItems.push({
              id: `${log.transactionHash}-${log.logIndex}`,
              type: "claim",
              actor: log.args.user,
              amountEth: formatEther(log.args.share),
              txHash: log.transactionHash,
              blockNumber: log.blockNumber,
              logIndex: log.logIndex,
            });
          }

          rawItems.sort((a, b) => {
            if (b.blockNumber !== a.blockNumber) {
              return b.blockNumber > a.blockNumber ? 1 : -1;
            }
            return b.logIndex - a.logIndex;
          });

          const top = rawItems.slice(0, 8);
          const resolved = await Promise.all(
            top.map(async (item) => ({
              ...item,
              actorLabel: await resolveAddressDisplayName(config, item.actor),
            })),
          );

          setActivities(resolved);
          break;
        } catch {
          // Try smaller block window if public RPC caps eth_getLogs range
        }
      }
    } finally {
      setIsLoadingActivity(false);
    }
  }, [config]);

  /**
   * Batched Multicall refresh:
   * - Call 1 (Multicall3): Global contract phase, epoch, bid & vault state
   * - Call 2 (Multicall3): Epoch snapshot/participants + connected wallet NFTs & sign state
   * - Call 3 (Multicall3): All owned NFT SVGs (`tokenURI`) + per-token approvals (`getApproved`)
   */
  const refreshAll = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
      }
      setRpcError(null);

      try {
        // 1. Single batched Multicall for global market state
        const globalResults = await multicall(config, {
          chainId: base.id,
          allowFailure: true,
          contracts: [
            {
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "getPhaseInfo",
            },
            {
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "currentEpochStart",
            },
            {
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "activebidAM",
            },
            {
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "activeBidder",
            },
            {
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "nextMinBid",
            },
            {
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "minBidIncrementPercentage",
            },
            {
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "poolAccrued",
            },
          ],
        });

        const rawPhase = globalResults[0].result as
          | [string, bigint, bigint, bigint]
          | undefined;
        const epochStart =
          (globalResults[1].result as bigint | undefined) ?? BigInt(0);
        const onChainBidWei =
          (globalResults[2].result as bigint | undefined) ?? BigInt(0);
        const bidder =
          (globalResults[3].result as string | undefined) ?? "";
        const onChainNextMinWei =
          (globalResults[4].result as bigint | undefined) ?? BigInt(0);
        const incrementPct = Number(
          (globalResults[5].result as number | bigint | undefined) ?? 2,
        );
        const poolAccruedWei =
          (globalResults[6].result as bigint | undefined) ?? BigInt(0);

        let isSign = true;
        if (rawPhase) {
          const nextPhase: PhaseInfo = {
            currentPhase: rawPhase[0],
            eid: rawPhase[1],
            elapsed: rawPhase[2],
            remaining: rawPhase[3],
          };
          setPhaseInfo(nextPhase);
          setRemainingTimeDisplay(Number(rawPhase[3]));
          isSign = rawPhase[0].toLowerCase().includes("sign");
        }

        setCurrentBidWei(onChainBidWei);
        setMinIncrementPct(incrementPct);
        setRequiredMinBidWei(
          onChainNextMinWei > FLOOR_MIN_BID_WEI
            ? onChainNextMinWei
            : FLOOR_MIN_BID_WEI,
        );
        setActiveBidder(bidder);

        if (
          bidder &&
          bidder !== "0x0000000000000000000000000000000000000000"
        ) {
          resolveAddressDisplayName(config, bidder).then(setActiveBidderName);
        } else {
          setActiveBidderName("");
        }

        // 2. Single batched Multicall for epoch pool details + user wallet state
        const epochAndUserContracts = [
          {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "partCount",
            args: [epochStart],
          },
          {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "poolSnap",
            args: [epochStart],
          },
          {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "claimedCount",
            args: [epochStart],
          },
          ...(address
            ? [
                {
                  address: CONTRACT_ADDR,
                  abi: MARKET_ABI,
                  functionName: "mySignedToken",
                  args: [epochStart, address],
                },
                {
                  address: COLLECTION_ADDR,
                  abi: NFT_ABI,
                  functionName: "getNFTzBelongingToOwner",
                  args: [address],
                },
                {
                  address: COLLECTION_ADDR,
                  abi: NFT_ABI,
                  functionName: "isApprovedForAll",
                  args: [address, CONTRACT_ADDR],
                },
              ]
            : []),
        ];

        const secondResults = await multicall(config, {
          chainId: base.id,
          allowFailure: true,
          contracts: epochAndUserContracts,
        });

        const signersCount = Number(
          (secondResults[0]?.result as bigint | undefined) ?? BigInt(0),
        );
        const poolSnapWei =
          (secondResults[1]?.result as bigint | undefined) ?? BigInt(0);
        const epochClaimedCount = Number(
          (secondResults[2]?.result as bigint | undefined) ?? BigInt(0),
        );

        setDailySigners(signersCount);
        setClaimedCount(epochClaimedCount);

        // Accurate Vault & Yield accounting in BOTH Sign and Claim phases!
        if (isSign) {
          setDailyVaultWei(poolAccruedWei);
          setQueuedNextEpochWei(BigInt(0));
          setYieldPerNftWei(
            signersCount > 0
              ? poolAccruedWei / BigInt(signersCount)
              : poolAccruedWei,
          );
        } else {
          const activeClaimPool =
            poolSnapWei > BigInt(0) ? poolSnapWei : poolAccruedWei;
          const queuedForNext =
            poolSnapWei > BigInt(0) ? poolAccruedWei : BigInt(0);
          setDailyVaultWei(activeClaimPool);
          setQueuedNextEpochWei(queuedForNext);
          setYieldPerNftWei(
            signersCount > 0
              ? activeClaimPool / BigInt(signersCount)
              : BigInt(0),
          );
        }

        if (!address) {
          setUserNFTs([]);
          setNftImages({});
          setNftApprovalStatus({});
          setUserSignedTokenId(null);
          setUserHasSigned(false);
          setUserHasClaimed(false);
          return;
        }

        const signedTok =
          (secondResults[3]?.result as bigint | undefined) ?? BigInt(0);
        const ownedTokens = [
          ...((secondResults[4]?.result as bigint[] | undefined) ?? []),
        ].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
        const isAllApproved = Boolean(secondResults[5]?.result);

        const hasSigned = signedTok > BigInt(0);
        setUserSignedTokenId(hasSigned ? signedTok : null);
        setUserHasSigned(hasSigned);
        setUserNFTs(ownedTokens);

        // 3. Single batched Multicall for ALL owned NFT SVGs + individual approvals
        if (ownedTokens.length > 0) {
          setIsCheckingApproval(true);
          try {
            const perTokenContracts = [
              ...ownedTokens.map((tokenId) => ({
                address: COLLECTION_ADDR,
                abi: NFT_ABI,
                functionName: "tokenURI",
                args: [tokenId],
              })),
              ...(!isAllApproved
                ? ownedTokens.map((tokenId) => ({
                    address: COLLECTION_ADDR,
                    abi: NFT_ABI,
                    functionName: "getApproved",
                    args: [tokenId],
                  }))
                : []),
            ];

            const tokenResults = await multicall(config, {
              chainId: base.id,
              allowFailure: true,
              contracts: perTokenContracts,
            });

            const nextImages: Record<string, string> = {};
            const nextApprovals: Record<string, boolean> = {};

            ownedTokens.forEach((tokenId, idx) => {
              const key = tokenId.toString();
              const uri = tokenResults[idx]?.result as string | undefined;
              if (uri) {
                const decoded = decodeOnChainTokenImage(uri);
                if (decoded) {
                  nextImages[key] = decoded;
                }
              }

              if (isAllApproved) {
                nextApprovals[key] = true;
              } else {
                const approvedAddr = tokenResults[ownedTokens.length + idx]
                  ?.result as string | undefined;
                nextApprovals[key] =
                  Boolean(approvedAddr) &&
                  approvedAddr!.toLowerCase() === CONTRACT_ADDR.toLowerCase();
              }
            });

            setNftImages(nextImages);
            setNftApprovalStatus(nextApprovals);
          } finally {
            setIsCheckingApproval(false);
          }
        } else {
          setNftImages({});
          setNftApprovalStatus({});
        }

        // Check precise claim status ONLY against explicit "already claimed" revert
        if (hasSigned && !isSign) {
          try {
            await simulateContract(config, {
              chainId: base.id,
              address: CONTRACT_ADDR,
              abi: MARKET_ABI,
              functionName: "signOrClaim",
              args: [signedTok],
              account: address,
            });
            setUserHasClaimed(false);
          } catch (simErr) {
            const msg =
              simErr instanceof Error ? simErr.message.toLowerCase() : "";
            setUserHasClaimed(msg.includes("already claimed"));
          }
        } else {
          setUserHasClaimed(false);
        }
      } catch (err) {
        console.error("Failed to fetch Flooor market data:", err);
        setRpcError("Unable to reach Base RPC right now. Click Refresh to retry.");
      } finally {
        setIsLoading(false);
      }
    },
    [config, address],
  );

  // Keep latest `refreshAll` in a ref so timers never capture stale closures
  const refreshRef = useRef(refreshAll);
  useEffect(() => {
    refreshRef.current = refreshAll;
  }, [refreshAll]);

  // Immediate load on mount AND whenever connected wallet address changes!
  useEffect(() => {
    refreshAll();
    fetchRecentActivity();
  }, [refreshAll, fetchRecentActivity]);

  // Periodic background polling (every 45s)
  useEffect(() => {
    const poll = setInterval(() => {
      refreshRef.current({ silent: true });
    }, 45_000);
    return () => clearInterval(poll);
  }, []);

  // Smooth 1s countdown with clean phase-boundary refresh at 0
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingTimeDisplay((prev) => {
        if (prev <= 0) return 0;
        if (prev === 1) {
          setTimeout(() => {
            refreshRef.current({ silent: true });
          }, 1200);
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const ensureBase = useCallback(async () => {
    if (chainId !== base.id) {
      await switchChain(config, { chainId: base.id });
    }
  }, [chainId, config]);

  const toUsd = useCallback(
    (eth: string) => {
      if (!ethPrice) return null;
      const val = parseFloat(eth) * ethPrice;
      if (isNaN(val) || val === 0) return null;
      return val < 0.01 ? `$${val.toFixed(4)}` : `$${val.toFixed(2)}`;
    },
    [ethPrice],
  );

  const fmtEth = useCallback((eth: string) => {
    const n = parseFloat(eth);
    if (!n || isNaN(n)) return "0";
    if (n >= 1) return n.toFixed(3);
    if (n >= 0.001) return n.toFixed(4);
    return n.toFixed(6);
  }, []);

  const formatTimeRemaining = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0",
    )}:${String(secs).padStart(2, "0")}`;
  }, []);

  const currentBid = useMemo(
    () => formatEther(currentBidWei),
    [currentBidWei],
  );
  const dailyVault = useMemo(
    () => formatEther(dailyVaultWei),
    [dailyVaultWei],
  );
  const queuedNextEpochEth = useMemo(
    () => formatEther(queuedNextEpochWei),
    [queuedNextEpochWei],
  );
  const yieldPerNFT = useMemo(
    () => formatEther(yieldPerNftWei),
    [yieldPerNftWei],
  );
  const minBidEth = useMemo(
    () => formatMinBidCeil(requiredMinBidWei),
    [requiredMinBidWei],
  );

  const applyBidPreset = useCallback(
    (extraBps = 0) => {
      const baseTarget = requiredMinBidWei;
      const targetWei =
        extraBps > 0
          ? (baseTarget * BigInt(10_000 + extraBps)) / BigInt(10_000)
          : baseTarget;
      setBidInput(formatMinBidCeil(targetWei));
    },
    [requiredMinBidWei],
  );

  const handleBidInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let nextValue = event.target.value
        .replace(/,/g, ".")
        .replace(/[^0-9.]/g, "");
      const firstDotIndex = nextValue.indexOf(".");
      if (firstDotIndex !== -1) {
        nextValue =
          nextValue.slice(0, firstDotIndex + 1) +
          nextValue.slice(firstDotIndex + 1).replace(/\./g, "");
      }
      if (nextValue.startsWith(".")) nextValue = `0${nextValue}`;
      setBidInput(nextValue);
    },
    [],
  );

  const handleBid = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first.");
      return;
    }

    let value: bigint;
    try {
      value = parseEther((bidInput || "0") as `${string}`);
    } catch {
      toast.error("Please enter a valid ETH bid amount.");
      return;
    }

    if (value < requiredMinBidWei) {
      toast.error(`Minimum valid bid right now is Ξ ${minBidEth}.`);
      setBidInput(minBidEth);
      return;
    }

    const toastId = toast.loading("Confirm bid in your wallet...");
    setPendingAction("bid");

    try {
      await ensureBase();
      const hash = await writeContract(config, {
        chainId: base.id,
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "placeBid",
        args: [],
        value,
        dataSuffix: DATA_SUFFIX,
      });

      setPendingTxHash(hash);
      toast.loading("Waiting for Base confirmation...", { id: toastId });

      const receipt = await waitForTransactionReceipt(config, {
        chainId: base.id,
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error("Bid transaction reverted on-chain.");
      }

      toast.success("Bid confirmed on Base!", { id: toastId });
      setBidInput("");
      await Promise.all([
        refreshAll({ silent: true }),
        fetchRecentActivity(),
        refetchBalance(),
      ]);
    } catch (error) {
      toast.error(parseReadableContractError(error), { id: toastId });
    } finally {
      setPendingAction(null);
      setPendingTxHash(null);
    }
  }, [
    address,
    bidInput,
    requiredMinBidWei,
    minBidEth,
    ensureBase,
    config,
    refreshAll,
    fetchRecentActivity,
    refetchBalance,
  ]);

  const handleSellNFT = useCallback(
    async (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first.");
        return;
      }

      if (currentBidWei < FLOOR_MIN_BID_WEI) {
        toast.error(
          `Active bid (Ξ ${fmtEth(currentBid)}) is below the minimum floor of Ξ ${MINIMUM_BID_FLOOR_ETH}.`,
        );
        return;
      }

      if (
        activeBidder &&
        activeBidder.toLowerCase() === address.toLowerCase()
      ) {
        toast.warning(
          "Your wallet holds the highest bid — switch wallets or wait for another bidder.",
        );
        return;
      }

      if (userNFTs.length > 1) {
        toast.warning(
          "Contract requires holding exactly 1 VRNoun to sell. Use the Transfer helper below to move extras first.",
        );
        return;
      }

      const tokenIdStr = tokenId.toString();
      const isApproved = nftApprovalStatus[tokenIdStr] === true;
      const toastId = toast.loading(
        isApproved
          ? `Confirm sale of VRNoun #${tokenIdStr} in wallet...`
          : `Step 1/2: Approve VRNoun #${tokenIdStr} in wallet...`,
      );

      setPendingAction(`sell-${tokenIdStr}`);
      setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: true }));

      try {
        await ensureBase();

        if (!isApproved) {
          const approveHash = await writeContract(config, {
            chainId: base.id,
            address: COLLECTION_ADDR,
            abi: NFT_ABI,
            functionName: "setApprovalForAll",
            args: [CONTRACT_ADDR, true],
            dataSuffix: DATA_SUFFIX,
          });

          setPendingTxHash(approveHash);
          toast.loading("Waiting for approval confirmation on Base...", {
            id: toastId,
          });

          const approveReceipt = await waitForTransactionReceipt(config, {
            chainId: base.id,
            hash: approveHash,
          });

          if (approveReceipt.status !== "success") {
            throw new Error("Approval transaction reverted on-chain.");
          }

          setNftApprovalStatus((prev) => ({ ...prev, [tokenIdStr]: true }));
          toast.loading(
            `Approval confirmed! Step 2/2: Confirm selling VRNoun #${tokenIdStr}...`,
            { id: toastId },
          );
        }

        const sellHash = await writeContract(config, {
          chainId: base.id,
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "sellToHighest",
          args: [tokenId],
          dataSuffix: DATA_SUFFIX,
        });

        setPendingTxHash(sellHash);
        toast.loading(`Finalizing sale of VRNoun #${tokenIdStr} on Base...`, {
          id: toastId,
        });

        const sellReceipt = await waitForTransactionReceipt(config, {
          chainId: base.id,
          hash: sellHash,
        });

        if (sellReceipt.status !== "success") {
          throw new Error("Sale transaction reverted on-chain.");
        }

        toast.success(`VRNoun #${tokenIdStr} sold for Ξ ${fmtEth(currentBid)}!`, {
          id: toastId,
        });

        await Promise.all([
          refreshAll({ silent: true }),
          fetchRecentActivity(),
          refetchBalance(),
        ]);
      } catch (error) {
        toast.error(parseReadableContractError(error), { id: toastId });
      } finally {
        setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: false }));
        setPendingAction(null);
        setPendingTxHash(null);
      }
    },
    [
      address,
      currentBidWei,
      currentBid,
      fmtEth,
      activeBidder,
      userNFTs.length,
      nftApprovalStatus,
      ensureBase,
      config,
      refreshAll,
      fetchRecentActivity,
      refetchBalance,
    ],
  );

  const handleSignOrClaim = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first.");
      return;
    }

    if (userNFTs.length === 0) {
      toast.error("No VRNouns found in your connected wallet.");
      return;
    }

    if (userNFTs.length > 1) {
      toast.warning(
        "You hold more than 1 VRNoun. Transfer extras below so your wallet holds exactly 1 VRNoun.",
      );
      return;
    }

    const isSign = Boolean(
      phaseInfo?.currentPhase.toLowerCase().includes("sign"),
    );
    const tokenId = userSignedTokenId ?? userNFTs[0];
    const toastId = toast.loading(
      isSign
        ? `Confirm Daily Sign with VRNoun #${tokenId.toString()}...`
        : `Confirm Claim with VRNoun #${tokenId.toString()}...`,
    );

    setPendingAction("signOrClaim");

    try {
      await ensureBase();
      const hash = await writeContract(config, {
        chainId: base.id,
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "signOrClaim",
        args: [tokenId],
        dataSuffix: DATA_SUFFIX,
      });

      setPendingTxHash(hash);
      toast.loading("Waiting for Base confirmation...", { id: toastId });

      const receipt = await waitForTransactionReceipt(config, {
        chainId: base.id,
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error("Transaction reverted on-chain.");
      }

      if (isSign) {
        setUserHasSigned(true);
        toast.success("Daily Sign confirmed on Base!", { id: toastId });
      } else {
        setUserHasClaimed(true);
        toast.success("Royalty reward claimed!", { id: toastId });
      }

      await Promise.all([
        refreshAll({ silent: true }),
        fetchRecentActivity(),
        refetchBalance(),
      ]);
    } catch (error) {
      toast.error(parseReadableContractError(error), { id: toastId });
    } finally {
      setPendingAction(null);
      setPendingTxHash(null);
    }
  }, [
    address,
    userNFTs,
    phaseInfo,
    userSignedTokenId,
    ensureBase,
    config,
    refreshAll,
    fetchRecentActivity,
    refetchBalance,
  ]);

  const handleTransferNFT = useCallback(
    async (tokenId: bigint, recipient: string) => {
      if (!address) {
        toast.warning("Please connect your wallet first.");
        return false;
      }
      const trimmed = recipient.trim();
      if (!isAddress(trimmed)) {
        toast.error("Please enter a valid 0x recipient wallet address.");
        return false;
      }
      if (trimmed.toLowerCase() === address.toLowerCase()) {
        toast.error("Recipient must be a different wallet address.");
        return false;
      }

      const tokenIdStr = tokenId.toString();
      const toastId = toast.loading(
        `Transferring VRNoun #${tokenIdStr} to ${trimmed.slice(0, 6)}...${trimmed.slice(-4)}...`,
      );
      setPendingAction(`transfer-${tokenIdStr}`);
      setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: true }));

      try {
        await ensureBase();
        const hash = await writeContract(config, {
          chainId: base.id,
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "safeTransferFrom",
          args: [address, trimmed as Address, tokenId],
          dataSuffix: DATA_SUFFIX,
        });

        setPendingTxHash(hash);
        toast.loading("Waiting for Base confirmation...", { id: toastId });

        const receipt = await waitForTransactionReceipt(config, {
          chainId: base.id,
          hash,
        });

        if (receipt.status !== "success") {
          throw new Error("Transfer reverted on-chain.");
        }

        toast.success(`VRNoun #${tokenIdStr} transferred!`, { id: toastId });
        await refreshAll({ silent: true });
        return true;
      } catch (error) {
        toast.error(parseReadableContractError(error), { id: toastId });
        return false;
      } finally {
        setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: false }));
        setPendingAction(null);
        setPendingTxHash(null);
      }
    },
    [address, ensureBase, config, refreshAll],
  );

  const isSignPhase = Boolean(
    phaseInfo?.currentPhase.toLowerCase().includes("sign"),
  );

  const isClaimReady =
    Boolean(phaseInfo) &&
    !isSignPhase &&
    userHasSigned &&
    !userHasClaimed &&
    yieldPerNftWei > BigInt(0);

  const yieldUsd = toUsd(yieldPerNFT);

  const signButtonText = useMemo(() => {
    const rewardLabel =
      yieldUsd ??
      (yieldPerNftWei > BigInt(0) ? `Ξ ${fmtEth(yieldPerNFT)}` : "");

    if (!phaseInfo) {
      return "Loading Epoch...";
    }
    if (pendingAction === "signOrClaim") {
      return "Confirming on Base...";
    }
    if (isSignPhase) {
      if (userHasSigned) {
        if (remainingTimeDisplay < 60) return "Claim Phase Opening...";
        return `Signed · Claim opens in ${formatTimeRemaining(remainingTimeDisplay)}`;
      }
      return rewardLabel
        ? `Daily Sign & Earn ${rewardLabel}`
        : "Daily Sign with VRNoun";
    }
    if (userHasClaimed) {
      return `Claimed · Next Sign in ${formatTimeRemaining(remainingTimeDisplay)}`;
    }
    if (userHasSigned) {
      if (yieldPerNftWei === BigInt(0)) {
        return `No Vault Pool This Epoch · Next Sign in ${formatTimeRemaining(remainingTimeDisplay)}`;
      }
      return rewardLabel ? `Claim ${rewardLabel}` : "Claim Royalty Share";
    }
    return `Sign Closed · Opens in ${formatTimeRemaining(remainingTimeDisplay)}`;
  }, [
    phaseInfo,
    pendingAction,
    isSignPhase,
    userHasSigned,
    userHasClaimed,
    remainingTimeDisplay,
    formatTimeRemaining,
    yieldUsd,
    yieldPerNftWei,
    fmtEth,
    yieldPerNFT,
  ]);

  const isSignButtonDisabled = useMemo(() => {
    if (!phaseInfo || !address || pendingAction !== null) return true;
    if (isSignPhase) {
      return userHasSigned;
    }
    return !userHasSigned || userHasClaimed || yieldPerNftWei === BigInt(0);
  }, [
    phaseInfo,
    address,
    pendingAction,
    isSignPhase,
    userHasSigned,
    userHasClaimed,
    yieldPerNftWei,
  ]);

  const handleManualRefresh = useCallback(() => {
    refreshAll();
    fetchRecentActivity();
    if (address) {
      refetchBalance();
    }
  }, [refreshAll, fetchRecentActivity, address, refetchBalance]);

  return {
    address,
    walletBalanceEth: walletBalance
      ? fmtEth(formatEther(walletBalance.value))
      : null,
    showNetworkWarning,
    ensureBase,
    bidInput,
    handleBidInputChange,
    applyBidPreset,
    minBidEth,
    minIncrementPct,
    phaseInfo,
    isSignPhase,
    isClaimReady,
    remainingTimeDisplay,
    formatTimeRemaining,
    dailySigners,
    claimedCount,
    dailyVault,
    queuedNextEpochEth,
    queuedNextEpochWei,
    yieldPerNFT,
    currentBid,
    currentBidWei,
    activeBidder,
    activeBidderName,
    userNFTs,
    nftImages,
    nftApprovalStatus,
    nftLoadingStatus,
    userHasSigned,
    userHasClaimed,
    userSignedTokenId,
    isLoading,
    isCheckingApproval,
    pendingAction,
    pendingTxHash,
    rpcError,
    activities,
    isLoadingActivity,
    toUsd,
    fmtEth,
    signButtonText,
    isSignButtonDisabled,
    handleBid,
    handleSellNFT,
    handleSignOrClaim,
    handleTransferNFT,
    handleManualRefresh,
  };
}
