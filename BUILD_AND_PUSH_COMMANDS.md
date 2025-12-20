# Build and Push Commands

## Step 1: Build Backend

```bash
cd ~/reward-project/backend
npm run build
```

## Step 2: Build Frontend

```bash
cd ~/reward-project/frontend
npm run build
```

## Step 3: Git Commands to Push

```bash
# Navigate to project root
cd ~/reward-project

# Check status
git status

# Add all changed files
git add .

# Commit with descriptive message
git commit -m "Migrate from Helius to Alchemy RPC provider

- Update RPC configuration to use SOLANA_RPC_URL (generic, supports any provider)
- Add backward compatibility with HELIUS_RPC_URL
- Remove Helius-specific validation (no longer requires ?api-key= query param)
- Add provider detection (Alchemy/Helius/Custom) in logs
- Update ENV_TEMPLATE.txt with Alchemy URL examples
- Add comprehensive migration documentation

Alchemy URLs:
- Devnet: https://solana-devnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2
- Mainnet: https://solana-mainnet.g.alchemy.com/v2/z83FlbBXfg6Poywg-iYz2"

# Push to GitHub
git push origin main
```

## Or Shorter Commit Message

If you prefer a shorter commit message:

```bash
git commit -m "Migrate from Helius to Alchemy RPC provider with backward compatibility"
```

