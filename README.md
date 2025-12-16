# NUKE Token Reward System

A complete Solana Token-2022 reward distribution system with Express backend and React frontend dashboard.

## Project Structure

```
reward-project/
├── backend/          # Express + TypeScript backend
├── frontend/         # React + TypeScript dashboard
├── admin.json        # Admin wallet keypair (for SOL payouts)
└── createTaxToken.ts # Token creation script
```

## Quick Start

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm or yarn
- Solana Devnet access (via Helius RPC)

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Helius RPC URL and token mint

# Start backend (development)
npm run dev
```

Backend will run on `http://localhost:3000`

**Important**: Ensure `admin.json` exists in the project root with sufficient SOL for payouts.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Optional: Configure API URL (defaults to http://localhost:3000)
# Create .env file:
# VITE_API_BASE_URL=http://localhost:3000

# Start frontend (development)
npm run dev
```

Frontend will run on `http://localhost:5173` (Vite default)

### 3. Access Dashboard

Open your browser to: **http://localhost:5173**

The dashboard will automatically:
- Connect to backend API at `http://localhost:3000`
- Fetch real-time data every 60 seconds
- Display holders, rewards, and payouts

## Running Both Services

### Option 1: Separate Terminals

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Option 2: Background Processes

**Start Backend:**
```bash
cd backend
npm run dev &
```

**Start Frontend:**
```bash
cd frontend
npm run dev &
```

## API Endpoints

### Backend (http://localhost:3000)

- `GET /health` - Health check
- `GET /solana/status` - Solana connection status
- `GET /reward/status` - Reward scheduler status
- `GET /dashboard/holders` - Token holders list
- `GET /dashboard/rewards` - Reward cycle summary
- `GET /dashboard/payouts` - Pending payouts

### Frontend (http://localhost:5173)

- Main dashboard page with three sections:
  - Reward Summary
  - Holders Table
  - Payouts Table

## Environment Variables

### Backend (.env)

```env
PORT=3000
NODE_ENV=development
SOLANA_NETWORK=devnet
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
TOKEN_MINT=CzPWFT9ezPy53mQUj48T17Jm4ep7sPcKwjpWw9tACTyq
ADMIN_WALLET_PATH=../admin.json
```

### Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:3000
```

## Features

### Backend
- ✅ Real SOL transfers on Devnet
- ✅ USD price fetching (Jupiter API)
- ✅ Eligibility filtering ($5 minimum)
- ✅ Blacklist support
- ✅ Retry mechanism (3x max)
- ✅ State persistence (JSON)
- ✅ Scheduler (every 5+ minutes)
- ✅ Dashboard API endpoints

### Frontend
- ✅ Real-time data (60s refresh)
- ✅ Holders table with filters
- ✅ Reward statistics
- ✅ Payout tracking
- ✅ Responsive design
- ✅ Error handling
- ✅ Loading states

## Troubleshooting

### Frontend can't connect to backend

1. **Check backend is running:**
   ```bash
   curl http://localhost:3000/health
   ```
   Should return: `{"status":"ok"}`

2. **Check CORS:** Backend has CORS enabled by default

3. **Check API URL:** Verify `VITE_API_BASE_URL` in frontend `.env`

### Backend errors

1. **Admin wallet not found:**
   - Ensure `admin.json` exists in project root
   - Check `ADMIN_WALLET_PATH` in `.env`

2. **Insufficient SOL:**
   - Fund admin wallet on Devnet
   - Check balance via Solana explorer

3. **RPC connection issues:**
   - Verify Helius RPC URL is correct
   - Check network connectivity

### Port conflicts

- **Backend (3000):** Change `PORT` in `backend/.env`
- **Frontend (5173):** Vite will auto-select next available port

## Development

### Backend Scripts

```bash
cd backend
npm run dev      # Development with hot reload
npm run build    # Build TypeScript
npm run start    # Production mode
```

### Frontend Scripts

```bash
cd frontend
npm run dev      # Development server
npm run build    # Production build
npm run preview  # Preview production build
```

## Production Deployment

### Backend

1. Build:
   ```bash
   cd backend
   npm run build
   ```

2. Start:
   ```bash
   npm run start
   ```

### Frontend

1. Build:
   ```bash
   cd frontend
   npm run build
   ```

2. Serve `dist/` folder with any static file server (nginx, Apache, etc.)

## Security Notes

- ⚠️ **Never commit `admin.json` or `.env` files**
- ⚠️ **Use environment variables for sensitive data**
- ⚠️ **Backend is configured for Devnet only**
- ⚠️ **Frontend is read-only (no wallet connection)**

## Support

For issues or questions:
1. Check logs in backend console
2. Check browser console for frontend errors
3. Verify API endpoints are accessible
4. Ensure both services are running
