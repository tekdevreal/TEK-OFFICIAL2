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

## Step 3: Git Push

```bash
# Navigate to project root
cd ~/reward-project

# Check status
git status

# Add all changes
git add .

# Commit
git commit -m "Switch back to Helius RPC provider

- Update ENV_TEMPLATE.txt to default to Helius
- Add documentation for Helius migration
- Code already supports Helius via generic SOLANA_RPC_URL
- Helius free tier supports getProgramAccounts (required feature)
- Alchemy free tier does not support getProgramAccounts"

# Push to GitHub
git push origin main
```

## Important: API Key Issue

You're using the **Key ID** instead of the **API Key**. 

The Key ID `1419cfe1-04ce-4fa4-a6d6-badda6902f4e` is just an identifier.

You need to get the actual API key from Helius dashboard:
1. Go to https://dashboard.helius.dev/
2. Login
3. Navigate to API Keys section
4. Click on the key named "Cubgranite"
5. Copy the **API Key** value (it will look different from the Key ID)
6. Update Render environment variable with the actual API key

The API key format is usually different - it might be a long alphanumeric string or UUID format, but it's NOT the Key ID.

