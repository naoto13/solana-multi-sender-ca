# Solana Multi Sender

Static frontend prototype for a Solana multi sender flow.

## Features

- Phantom wallet connection detection
- SOL / SPL token mode selector
- SPL token address input, shown as the token mint address used on Solana
- USDC preset for Solana mainnet
- `address,amount` recipient input
- Local validation for invalid addresses, invalid amounts, and duplicates
- Batch count and estimated fee preview
- No signing or transaction broadcast

## Deploy

This is a static site. Vercel can deploy it directly from the repository root.

```sh
vercel --prod
```
