# Solana Multi Sender

Static frontend prototype for a Solana multi sender flow.

## Features

- Phantom wallet connection detection
- Wallet balance display for the selected SOL / SPL token
- SOL / SPL token mode selector
- SPL token address input, shown as the token mint address used on Solana
- USDC preset for Solana mainnet
- `address,amount` recipient input
- Local validation for invalid addresses, invalid amounts, and duplicates
- Batch count and estimated fee preview
- Batch size up to 20 recipients per transaction attempt
- Max recipients per transaction calculator using serialized transaction size
- Automatic execution-time repacking under the 1232-byte Solana transaction limit
- Phantom signing and transaction broadcast
- Solscan transaction links after each sent batch
- Background confirmation after each submitted batch
- SOL transfer batching
- SPL token transfer batching with associated token account creation for recipients

## 金額の検証

送金金額は、SOL では lamports、SPL ではトークンの最小単位に変換して、
1 以上かつ `2^64 - 1` 以下であることを署名要求前に確認します。
小数から整数への変換には `BigInt` を使用し、SOL の転送命令にもそのまま渡します。
上限超過や小数桁数の超過がある場合はバッチ全体を停止します。
この検証は残高・手数料・ネットワーク上での成功を保証するものではありません。

Node.js 22 で、外部依存のインストールなしに回帰テストを実行できます。

```sh
node --test tests/*.test.mjs
```

テストは両方の HTML の実際のスクリプトを読み込み、DOM・RPC・ウォレットを
副作用のないテスト用実装に置き換えます。外部通信・実際の署名・送信は行いません。
GitHub Actions では PR と `main` への push で実行します。

## Deploy

This is a static site. Vercel can deploy it directly from the repository root.

```sh
vercel --prod
```
