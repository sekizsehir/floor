"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Logo from "@/app/svg/Logo";
import { BlockieAvatar } from "@/components/BlockieAvatar";
import { useFloorMarket } from "@/hooks/useFloorMarket";
import { COLLECTION_ADDR, CONTRACT_ADDR } from "@/lib/contracts";

const EthGlyph = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z" />
    <path d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z" />
  </svg>
);

export function FloorApp() {
  const {
    address,
    walletBalanceEth,
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
    activeBidder,
    activeBidderName,
    userNFTs,
    nftImages,
    nftApprovalStatus,
    nftLoadingStatus,
    userHasSigned,
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
  } = useFloorMarket();

  const [selectedTransferToken, setSelectedTransferToken] =
    useState<string>("");
  const [transferRecipient, setTransferRecipient] = useState<string>("");

  const isUserTopBidder = Boolean(
    address &&
      activeBidder &&
      activeBidder.toLowerCase() === address.toLowerCase(),
  );

  const onSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const fallbackToken = userNFTs[userNFTs.length - 1];
    const chosen = selectedTransferToken
      ? BigInt(selectedTransferToken)
      : fallbackToken;
    if (!chosen) return;
    const ok = await handleTransferNFT(chosen, transferRecipient);
    if (ok) {
      setTransferRecipient("");
      setSelectedTransferToken("");
    }
  };

  return (
    <div
      className="min-h-screen relative z-10"
      style={{ color: "#141414" }}
    >
      {/* Sticky Header */}
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid #ECEAE4",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 focus:outline-none"
              aria-label="flooor.fun Home"
            >
              <Logo className="h-9 w-auto" />
            </Link>
            <nav
              className="hidden md:flex items-center gap-6 text-sm font-semibold"
              style={{ color: "#6B6862" }}
            >
              <a
                href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                Docs
              </a>
              <a
                href="https://snapshot.org/#/s:vrnouns.eth"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                DAO
              </a>
              <a
                href="https://opensea.io/collection/vrnouns"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                VRNouns
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {pendingTxHash && (
              <a
                href={`https://basescan.org/tx/${pendingTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-blue-600 animate-ping" />
                Confirming Tx ↗
              </a>
            )}

            {phaseInfo && (
              <div
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                  isSignPhase
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isSignPhase ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {isSignPhase ? "SIGN PHASE" : "CLAIM PHASE"}
              </div>
            )}

            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;
                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                  >
                    {!connected ? (
                      <button
                        onClick={openConnectModal}
                        type="button"
                        className="px-5 py-2.5 font-bold text-sm rounded-full transition-all hover:opacity-85 active:scale-[0.98]"
                        style={{
                          backgroundColor: "#141414",
                          color: "#fff",
                          boxShadow: "0 6px 16px -6px rgba(0,0,0,0.35)",
                        }}
                      >
                        Connect Wallet
                      </button>
                    ) : chain.unsupported ? (
                      <button
                        onClick={openChainModal}
                        type="button"
                        className="px-4 py-2 rounded-full font-bold text-sm bg-red-50 text-red-600 ring-1 ring-red-200"
                      >
                        Wrong Network
                      </button>
                    ) : (
                      <button
                        onClick={openAccountModal}
                        type="button"
                        className="px-4 py-2 font-bold text-sm rounded-full transition-all flex items-center gap-2 hover:bg-white"
                        style={{
                          border: "1px solid #E2DFD8",
                          backgroundColor: "#FDFDFB",
                        }}
                      >
                        {chain.hasIcon && chain.iconUrl && (
                          <Image
                            alt={chain.name ?? "Chain icon"}
                            src={chain.iconUrl}
                            width={16}
                            height={16}
                          />
                        )}
                        {account.displayName}
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </header>

      {/* Network Warning Banner */}
      {showNetworkWarning && (
        <div className="bg-red-50 border-b border-red-200 py-3 px-6">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <span className="text-red-700 font-semibold text-sm">
              Your wallet is connected to another network — switch to Base to bid, sell, or claim.
            </span>
            <button
              onClick={() => ensureBase()}
              type="button"
              className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm font-bold hover:bg-red-700 transition-colors"
            >
              Switch to Base
            </button>
          </div>
        </div>
      )}

      {/* RPC Error Banner */}
      {rpcError && (
        <div className="bg-amber-50 border-b border-amber-200 py-2.5 px-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 text-sm text-amber-800">
            <span>{rpcError}</span>
            <button
              onClick={handleManualRefresh}
              type="button"
              className="px-3 py-1 rounded-full bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-5 sm:px-6 pt-10 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          {/* Left Column: Collection Showcase + Transparent Split */}
          <div className="lg:sticky lg:top-24 space-y-4">
            <a
              href="https://opensea.io/collection/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                border: "1px solid #E8E5DF",
                boxShadow: "0 30px 70px -30px rgba(20,20,20,0.25)",
                backgroundColor: "#fff",
              }}
            >
              <Image
                src="/bg.png"
                alt="VRNouns Collection on Base"
                width={560}
                height={560}
                priority
                className="w-full h-auto object-cover"
              />
            </a>

            <div
              className="rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold"
              style={{
                backgroundColor: "#fff",
                border: "1px solid #ECEAE4",
                color: "#6B6862",
              }}
            >
              <span>VRNouns on Base · CC0</span>
              <span className="flex items-center gap-2">
                <span className="text-emerald-700 font-bold">
                  95% Seller
                </span>
                <span>·</span>
                <span className="text-blue-700 font-bold">
                  4.5% Signers Vault
                </span>
                <span>·</span>
                <span>0.5% Protocol</span>
              </span>
            </div>
          </div>

          {/* Right Column: Live Market Controls */}
          <div className="flex flex-col gap-5">
            {/* Epoch & Collection Title */}
            <div className="flex items-end justify-between gap-4">
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-[0.2em] mb-2"
                  style={{ color: "#A8A29E" }}
                >
                  {phaseInfo
                    ? `${isSignPhase ? "Sign Phase" : "Claim Phase"} · Epoch #${phaseInfo.eid.toString()}`
                    : "Connecting to Base..."}
                </p>
                <h1
                  className="text-5xl font-extrabold tracking-tight leading-none"
                  style={{ color: "#141414" }}
                >
                  VRNouns
                </h1>
              </div>

              <button
                onClick={handleManualRefresh}
                disabled={isLoading}
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:bg-white"
                style={{
                  backgroundColor: "#F1EFE9",
                  color: isLoading ? "#B8B3AC" : "#6B6862",
                  border: "1px solid #E8E5DF",
                  cursor: isLoading ? "not-allowed" : "pointer",
                }}
              >
                <svg
                  className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {isLoading ? "Syncing" : "Refresh"}
              </button>
            </div>

            {/* Active Bid + Countdown Card */}
            <div
              className="rounded-3xl p-6"
              style={{
                backgroundColor: "#fff",
                border: "1px solid #ECEAE4",
                boxShadow: "0 18px 44px -28px rgba(20,20,20,0.18)",
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: "#A8A29E" }}
                  >
                    Highest Pool Bid
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <EthGlyph className="w-6 h-6 self-center" />
                    <span
                      className="text-4xl font-extrabold tabular-nums tracking-tight"
                      style={{ color: "#141414" }}
                    >
                      {fmtEth(currentBid)}
                    </span>
                  </div>
                  {toUsd(currentBid) && (
                    <p
                      className="text-sm font-semibold mt-1"
                      style={{ color: "#A8A29E" }}
                    >
                      {toUsd(currentBid)}
                    </p>
                  )}
                </div>

                <div
                  className="sm:pl-6 pt-4 sm:pt-0 border-t sm:border-t-0 sm:border-l"
                  style={{ borderColor: "#ECEAE4" }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: "#A8A29E" }}
                  >
                    {isSignPhase ? "Sign closes in" : "Claim closes in"}
                  </p>
                  <p
                    className="text-4xl font-extrabold tabular-nums tracking-tight"
                    style={{ color: "#141414" }}
                  >
                    {formatTimeRemaining(remainingTimeDisplay)}
                  </p>
                  <p
                    className="text-xs font-semibold mt-1"
                    style={{ color: "#A8A29E" }}
                  >
                    {isSignPhase
                      ? "16h daily sign window"
                      : "8h daily claim window"}
                  </p>
                </div>
              </div>

              {activeBidder &&
                activeBidder !==
                  "0x0000000000000000000000000000000000000000" && (
                  <div
                    className="flex items-center gap-2.5 mt-5 pt-4"
                    style={{ borderTop: "1px solid #F1EFE9" }}
                  >
                    <BlockieAvatar
                      address={activeBidder}
                      size={24}
                      className="ring-1 ring-black/10"
                    />
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "#A8A29E" }}
                    >
                      Highest bidder
                    </span>
                    {isUserTopBidder && (
                      <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                        You
                      </span>
                    )}
                    <a
                      href={`https://basescan.org/address/${activeBidder}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold hover:underline ml-auto"
                      style={{ color: "#3B63F3" }}
                    >
                      {activeBidderName ||
                        `${activeBidder.slice(0, 6)}...${activeBidder.slice(-4)}`}
                    </a>
                  </div>
                )}

              {/* Bid Input + Quick Presets */}
              <div className="mt-5 flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label="Bid amount in ETH"
                  placeholder={`Ξ ${minBidEth} or more`}
                  className="flex-1 px-4 py-3 rounded-2xl text-base font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-black/10"
                  style={{
                    border: "1px solid #E2DFD8",
                    backgroundColor: "#FAF9F6",
                    color: "#141414",
                  }}
                  value={bidInput}
                  onChange={handleBidInputChange}
                />
                <button
                  onClick={handleBid}
                  disabled={pendingAction !== null}
                  type="button"
                  className="px-8 py-3 rounded-2xl font-bold text-base transition-all hover:opacity-85 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: "#141414",
                    color: "#fff",
                    boxShadow: "0 8px 20px -8px rgba(0,0,0,0.4)",
                  }}
                >
                  {pendingAction === "bid" ? "Bidding..." : "Bid"}
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyBidPreset(0)}
                    className="px-2.5 py-1 rounded-lg font-bold transition-colors hover:bg-black hover:text-white"
                    style={{
                      backgroundColor: "#F1EFE9",
                      color: "#4B4843",
                    }}
                  >
                    Min (Ξ {minBidEth})
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBidPreset(500)}
                    className="px-2.5 py-1 rounded-lg font-bold transition-colors hover:bg-black hover:text-white"
                    style={{
                      backgroundColor: "#F1EFE9",
                      color: "#4B4843",
                    }}
                  >
                    +5%
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBidPreset(1000)}
                    className="px-2.5 py-1 rounded-lg font-bold transition-colors hover:bg-black hover:text-white"
                    style={{
                      backgroundColor: "#F1EFE9",
                      color: "#4B4843",
                    }}
                  >
                    +10%
                  </button>
                </div>

                <span style={{ color: "#9C968E" }} className="font-semibold">
                  {walletBalanceEth
                    ? `Balance: Ξ ${walletBalanceEth}`
                    : `+${minIncrementPct}% min increment`}
                </span>
              </div>
            </div>

            {/* Daily Sign / Claim CTA */}
            <div>
              <button
                onClick={handleSignOrClaim}
                disabled={isSignButtonDisabled}
                type="button"
                className="w-full py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-[0.99] hover:opacity-90"
                style={
                  isSignButtonDisabled
                    ? {
                        backgroundColor: "#ECEAE4",
                        color: "#8C867E",
                        cursor: "not-allowed",
                      }
                    : isClaimReady
                      ? {
                          backgroundColor: "#16A34A",
                          color: "#fff",
                          boxShadow: "0 14px 34px -12px rgba(22,163,74,0.55)",
                        }
                      : {
                          backgroundColor: "#141414",
                          color: "#fff",
                          boxShadow: "0 14px 34px -14px rgba(0,0,0,0.45)",
                        }
                }
              >
                {signButtonText}
              </button>

              {address && userHasSigned && userSignedTokenId !== null && (
                <p
                  className="text-xs font-semibold text-center mt-2"
                  style={{ color: "#6B6862" }}
                >
                  Signed this epoch with VRNoun #{userSignedTokenId.toString()}
                </p>
              )}
            </div>

            {/* 3-Card Real-Time Vault Metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div
                className="rounded-2xl p-4"
                style={{ backgroundColor: "#fff", border: "1px solid #ECEAE4" }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: "#A8A29E" }}
                >
                  Signers
                </p>
                <p
                  className="text-2xl font-extrabold tabular-nums"
                  style={{ color: "#141414" }}
                >
                  {dailySigners}
                </p>
                {!isSignPhase && dailySigners > 0 && (
                  <p
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: "#A8A29E" }}
                  >
                    {claimedCount}/{dailySigners} claimed
                  </p>
                )}
              </div>

              <div
                className="rounded-2xl p-4"
                style={{ backgroundColor: "#fff", border: "1px solid #ECEAE4" }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: "#A8A29E" }}
                >
                  {isSignPhase ? "Daily Vault" : "Epoch Snapshot"}
                </p>
                <p
                  className="text-base sm:text-2xl font-extrabold tabular-nums whitespace-nowrap"
                  style={{ color: "#141414" }}
                >
                  Ξ{fmtEth(dailyVault)}
                </p>
                {toUsd(dailyVault) && (
                  <p
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: "#A8A29E" }}
                  >
                    {toUsd(dailyVault)}
                  </p>
                )}
                {queuedNextEpochWei > BigInt(0) && (
                  <p className="text-[11px] font-bold text-emerald-700 mt-1">
                    +Ξ{fmtEth(queuedNextEpochEth)} next
                  </p>
                )}
              </div>

              <div
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "#F0FDF4",
                  border: "1px solid #BBF7D0",
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: "#15803D" }}
                >
                  Yield / NFT
                </p>
                <p
                  className="text-base sm:text-2xl font-extrabold tabular-nums whitespace-nowrap"
                  style={{ color: "#15803D" }}
                >
                  Ξ{fmtEth(yieldPerNFT)}
                </p>
                {toUsd(yieldPerNFT) && (
                  <p
                    className="text-xs font-bold mt-0.5"
                    style={{ color: "#16A34A" }}
                  >
                    {toUsd(yieldPerNFT)}
                  </p>
                )}
              </div>
            </div>

            {/* Wallet NFTs + Built-In Multi-NFT Transfer Helper */}
            {address && (
              <div
                className="rounded-3xl p-6 space-y-4"
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid #ECEAE4",
                }}
              >
                <div className="flex items-center justify-between">
                  <p
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: "#A8A29E" }}
                  >
                    Your VRNouns ({userNFTs.length})
                  </p>
                  {isCheckingApproval && (
                    <div
                      className="flex items-center gap-2 text-xs font-semibold"
                      style={{ color: "#A8A29E" }}
                    >
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400" />
                      Checking approvals...
                    </div>
                  )}
                </div>

                {userNFTs.length > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-4">
                      {userNFTs.map((tokenId) => {
                        const tokenIdStr = tokenId.toString();
                        const isApproved = nftApprovalStatus[tokenIdStr] === true;
                        const isBusy = nftLoadingStatus[tokenIdStr] === true;

                        return (
                          <div
                            key={tokenIdStr}
                            className="flex flex-col items-center gap-1.5"
                          >
                            <button
                              type="button"
                              onClick={() => handleSellNFT(tokenId)}
                              disabled={pendingAction !== null}
                              className="relative w-24 h-24 rounded-2xl overflow-hidden group transition-all hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-black/20 disabled:opacity-60"
                              style={{
                                border: "1px solid #E8E5DF",
                                boxShadow:
                                  "0 10px 24px -14px rgba(0,0,0,0.25)",
                              }}
                              title={`Sell VRNoun #${tokenIdStr} into highest bid`}
                            >
                              {nftImages[tokenIdStr] ? (
                                <Image
                                  src={nftImages[tokenIdStr]}
                                  alt={`VRNoun #${tokenIdStr}`}
                                  width={96}
                                  height={96}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center"
                                  style={{ backgroundColor: "#F1EFE9" }}
                                >
                                  <span
                                    className="text-sm font-bold"
                                    style={{ color: "#6B6862" }}
                                  >
                                    #{tokenIdStr}
                                  </span>
                                </div>
                              )}

                              {isBusy && (
                                <div className="absolute inset-0 bg-blue-600/80 flex items-center justify-center">
                                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                                </div>
                              )}

                              {!isApproved && !isBusy && (
                                <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center px-1">
                                  <span className="text-white text-xs font-bold">
                                    Approve & Sell
                                  </span>
                                </div>
                              )}

                              {isApproved && !isBusy && (
                                <div className="absolute inset-0 bg-emerald-600/0 group-hover:bg-emerald-600/50 transition-all flex items-center justify-center">
                                  <span className="text-white text-sm font-extrabold opacity-0 group-hover:opacity-100 transition-opacity">
                                    Sell Now
                                  </span>
                                </div>
                              )}

                              <div className="absolute bottom-1 left-1 bg-black/75 text-white text-[10px] px-1.5 py-0.5 rounded-md font-bold">
                                #{tokenIdStr}
                              </div>
                            </button>

                            <p
                              className="text-[11px] font-bold"
                              style={{
                                color: isApproved ? "#16A34A" : "#D97706",
                              }}
                            >
                              {isApproved ? "Ready to sell" : "Click to sell"}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Multi-NFT Helper: Direct transfer UI when holding > 1 NFT */}
                    {userNFTs.length > 1 && (
                      <form
                        onSubmit={onSubmitTransfer}
                        className="rounded-2xl p-4 space-y-3"
                        style={{
                          backgroundColor: "#FFFBEB",
                          border: "1px solid #FDE68A",
                        }}
                      >
                        <div className="text-xs leading-relaxed text-amber-900">
                          <span className="font-extrabold">
                            1-Wallet = 1-VRNoun Rule:
                          </span>{" "}
                          The live v1 smart contract requires holding{" "}
                          <strong>exactly 1 VRNoun</strong> in your active wallet
                          to Daily Sign or Sell. Transfer extra VRNouns to a
                          secondary wallet below:
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            aria-label="Select VRNoun to transfer"
                            value={
                              selectedTransferToken ||
                              userNFTs[userNFTs.length - 1]?.toString() ||
                              ""
                            }
                            onChange={(e) =>
                              setSelectedTransferToken(e.target.value)
                            }
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-amber-300 text-gray-900 focus:outline-none"
                          >
                            {userNFTs.map((id) => (
                              <option key={id.toString()} value={id.toString()}>
                                VRNoun #{id.toString()}
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            placeholder="Recipient 0x wallet address..."
                            value={transferRecipient}
                            onChange={(e) =>
                              setTransferRecipient(e.target.value)
                            }
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-amber-300 text-gray-900 focus:outline-none"
                          />

                          <button
                            type="submit"
                            disabled={pendingAction !== null}
                            className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-900 text-white hover:bg-black transition-colors disabled:opacity-50"
                          >
                            Transfer
                          </button>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <p
                    className="text-sm font-medium"
                    style={{ color: "#9C968E" }}
                  >
                    No VRNouns in wallet yet — place the top bid above to acquire
                    the next floor VRNoun with zero marketplace listings.
                  </p>
                )}
              </div>
            )}

            {/* Live On-Chain Activity Feed */}
            <div
              className="rounded-3xl p-6"
              style={{
                backgroundColor: "#fff",
                border: "1px solid #ECEAE4",
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: "#A8A29E" }}
                >
                  Recent On-Chain Activity
                </p>
                {isLoadingActivity && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "#A8A29E" }}
                  >
                    Loading events...
                  </span>
                )}
              </div>

              {activities.length > 0 ? (
                <ul className="divide-y" style={{ borderColor: "#F1EFE9" }}>
                  {activities.map((item) => (
                    <li
                      key={item.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BlockieAvatar address={item.actor} size={22} />
                        <div className="truncate">
                          <span className="font-bold text-gray-900">
                            {item.actorLabel}
                          </span>{" "}
                          <span style={{ color: "#6B6862" }}>
                            {item.type === "bid" && "placed a pool bid"}
                            {item.type === "sale" &&
                              `sold VRNoun #${item.tokenId ?? "—"}`}
                            {item.type === "sign" &&
                              `signed with VRNoun #${item.tokenId ?? "—"}`}
                            {item.type === "claim" && "claimed daily royalties"}
                          </span>
                        </div>
                      </div>

                      <a
                        href={`https://basescan.org/tx/${item.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 font-bold text-xs px-2.5 py-1 rounded-full hover:underline"
                        style={{
                          backgroundColor: "#FAF9F6",
                          color: "#141414",
                          border: "1px solid #ECEAE4",
                        }}
                      >
                        {item.amountEth
                          ? `Ξ ${fmtEth(item.amountEth)} ↗`
                          : "Basescan ↗"}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className="text-xs font-medium"
                  style={{ color: "#A8A29E" }}
                >
                  No events in the latest Base blocks — view full history on{" "}
                  <a
                    href={`https://basescan.org/address/${CONTRACT_ADDR}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-bold text-gray-700"
                  >
                    Basescan ↗
                  </a>
                  .
                </p>
              )}
            </div>

            {/* External Mini App Links */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:bg-white"
                style={{
                  backgroundColor: "#F1EFE9",
                  color: "#6B6862",
                  border: "1px solid #E8E5DF",
                }}
              >
                Farcaster Mini App ↗
              </a>
              <a
                href="https://base.app/app/flooor.fun"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:bg-white"
                style={{
                  backgroundColor: "#F1EFE9",
                  color: "#6B6862",
                  border: "1px solid #E8E5DF",
                }}
              >
                Base App ↗
              </a>
            </div>
          </div>
        </div>

        {/* Game-Theory Value Proposition Section */}
        <section
          className="mt-24 pt-16"
          style={{ borderTop: "1px solid #ECEAE4" }}
        >
          <h2
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-3"
            style={{ color: "#141414" }}
          >
            Royalties to the community.
          </h2>
          <p
            className="text-center text-base font-medium mb-12 max-w-xl mx-auto"
            style={{ color: "#8C867E" }}
          >
            Instant floor liquidity without listings — every sale feeds active
            holders on Base.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div
              className="rounded-3xl p-8 min-h-48 transition-transform hover:-translate-y-1"
              style={{
                backgroundColor: "#63A0F9",
                boxShadow: "0 24px 50px -30px rgba(99,160,249,0.8)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: "rgba(20,20,20,0.65)" }}
              >
                Sign & Earn · 4.5% Vault
              </p>
              <p
                className="text-lg font-bold leading-snug"
                style={{ color: "#141414" }}
              >
                Light-stake (sign) daily without locking your NFT. 4.5% of every
                sale goes straight to daily signers (0.5% protocol).
              </p>
            </div>

            <div
              className="rounded-3xl p-8 min-h-48 transition-transform hover:-translate-y-1"
              style={{
                backgroundColor: "#FFC110",
                boxShadow: "0 24px 50px -30px rgba(255,193,16,0.8)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: "rgba(20,20,20,0.65)" }}
              >
                Bid or Sell Instantly
              </p>
              <p
                className="text-lg font-bold leading-snug"
                style={{ color: "#141414" }}
              >
                No floor undercutting or stale listings. One continuous on-chain
                bid — outbid auto-refunds in ETH/WETH, holders sell in one click.
              </p>
            </div>

            <div
              className="rounded-3xl p-8 min-h-48 transition-transform hover:-translate-y-1"
              style={{
                backgroundColor: "#FE500C",
                boxShadow: "0 24px 50px -30px rgba(254,80,12,0.7)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-3"
                style={{ color: "rgba(255,255,255,0.8)" }}
              >
                Collective Game Theory
              </p>
              <p
                className="text-lg font-bold leading-snug"
                style={{ color: "#fff" }}
              >
                1-wallet = 1-NFT participation aligns the community so active
                members capture real daily yield together.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #ECEAE4",
          backgroundColor: "#FDFDFB",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-auto" />
            <span className="font-bold text-sm" style={{ color: "#8C867E" }}>
              flooor.fun
            </span>
          </div>

          <div
            className="flex flex-wrap items-center gap-6 text-sm font-semibold"
            style={{ color: "#8C867E" }}
          >
            <a
              href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Docs
            </a>
            <a
              href="https://github.com/omgbbqhaxx/flooor"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://x.com/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              X
            </a>
            <a
              href={`https://basescan.org/address/${COLLECTION_ADDR}#readContract`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              VRNouns
            </a>
            <a
              href={`https://basescan.org/address/${CONTRACT_ADDR}#readContract`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Flooor Contract
            </a>
            <a
              href="https://snapshot.org/#/s:vrnouns.eth"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Snapshot
            </a>
          </div>
        </div>

        <div
          className="border-t py-4 text-center text-xs font-medium"
          style={{ borderColor: "#ECEAE4", color: "#A8A29E" }}
        >
          © 2026 flooor.fun · CC0 Licensed · Front-end v1.2.0
        </div>
      </footer>
    </div>
  );
}
