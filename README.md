# flooor.fun

Game-theory floor liquidity & daily community royalty sharing on **Base** (`VRNouns`).

## Features
- **Instant Floor Liquidity:** Continuous on-chain pool bidding (`placeBid`) with automatic outbid ETH/WETH refunds and one-click selling (`sellToHighest`).
- **Daily Light-Staking (`signOrClaim`):** Hold 1 VRNoun, sign during the 16-hour Sign window without locking your NFT, and claim your equal share of the 4.5% community vault during the 8-hour Claim window.
- **Multicall3 Batched Reads:** All market, epoch snapshot (`poolSnap` + `poolAccrued`), and owned NFT SVG reads are batched into minimal Multicall requests.
- **Basename & ENS Support:** Resolves `*.base.eth` via Base ENSIP-19 L2 Resolver with Ethereum Mainnet ENS fallback.
- **Farcaster Mini App Ready:** Embedded frame metadata & `sdk.actions.ready()` lifecycle support.

## Getting Started

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Build & Static Export (GitHub Pages)

```bash
npm run lint
npm run typecheck
npm run build
```

Static production files are generated in `./out`.
