# 🌌 Quantum Hybrid Portfolio Dashboard

A sophisticated React-based dashboard for the Quantum Hybrid Portfolio system, featuring real-time quantum-inspired portfolio optimization with interactive visualizations.

## 🚀 Architecture

The dashboard consists of two main components:
1. **Backend API** (Python/Flask) - Powers the quantum portfolio optimization
2. **Frontend Dashboard** (React/Recharts) - Provides interactive UI and visualizations

## 🛠️ Prerequisites

- Python 3.9+
- Node.js and npm
- Git

## 📦 Installation

### Backend (Python API)
The backend is already integrated with the Quantum Hybrid Portfolio system:

1. Ensure you're in the main project directory:
   ```bash
   cd /home/roc/quantumGlobalGroup/quantum-hybrid-portfolio
   ```

2. Activate the virtual environment:
   ```bash
   source .venv/bin/activate
   ```

3. Install/update dependencies:
   ```bash
   pip install -r deps/requirements.txt
   ```

### Frontend (React Dashboard)
1. Navigate to the frontend directory:
   ```bash
   cd /home/roc/quantumGlobalGroup/quantum-hybrid-portfolio/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## ▶️ Running the Dashboard

### Method 1: Automatic Launcher (Recommended)
From the main project directory, run:
```bash
./scripts/run_dashboard.sh
```

This will:
- Start the Python backend API on port 5000
- Start the React frontend on port 3000
- Automatically install dependencies if needed

### Method 2: Manual Start

1. **Start the backend API** (in a new terminal):
   ```bash
   cd /home/roc/quantumGlobalGroup/quantum-hybrid-portfolio
   source .venv/bin/activate
   python api.py
   ```
   The API will run on http://localhost:5000

2. **Start the frontend** (in another terminal):
   ```bash
   cd /home/roc/quantumGlobalGroup/quantum-hybrid-portfolio/frontend
   npm start
   ```
   The dashboard will open on http://localhost:3000

## 🖥️ Accessing the Dashboard

Once both services are running, open your browser to:
- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
  - Health check: http://localhost:5000/api/health
  - Optimize endpoint: POST http://localhost:5000/api/portfolio/optimize

## 🎛️ Dashboard Features

### Quantum Parameters
- **Omega (ω)**: Mixing parameter balancing quantum potential and graph coupling
- **Evolution Time**: Controls smoothing vs. differentiation in optimization
- **Max Weight**: Upper bound for individual asset allocation
- **Max Turnover**: Limits portfolio churn for stability
- **Universe Size**: Number of assets to consider in optimization

### Market Regimes
- **Normal**: Standard market conditions
- **Bull**: Growth-oriented market
- **Bear**: Declining market conditions
- **Volatile**: High uncertainty environment

### Visualization Tabs
1. **Portfolio**: Holdings, sector allocation, risk-return profile
2. **Performance**: Benchmark comparisons, risk-return analysis
3. **Risk**: VaR analysis, concentration risk visualization
4. **Sensitivity**: Parameter sensitivity analysis (coming soon)

### Key Metrics
- Sharpe Ratio: Risk-adjusted return metric
- Expected Return: Annualized projected return
- Volatility: Annualized portfolio risk
- Active Positions: Number of meaningful holdings
- Daily VaR: Value at Risk at 95% confidence

## 🔬 Technology Stack

### Backend
- Python 3.12+
- Flask/FastAPI for web services
- NumPy/SciPy for numerical computation
- NetworkX for graph operations
- Pandas for data manipulation
- Quantum Hybrid Portfolio core algorithms

### Frontend
- React 18 for UI framework
- Recharts for data visualization
- Axios for API communication
- CSS Grid/Flexbox for layouts
- Modern JavaScript/ES6+

## 📊 API Endpoints

### POST /api/portfolio/optimize
Request body:
```json
{
  "nAssets": 10,
  "regime": "normal",
  "omega": 0.3,
  "evolutionTime": 10,
  "maxWeight": 0.1,
  "turnoverLimit": 0.2
}
```

Response includes portfolio weights, metrics, and benchmark comparisons.

### GET /api/health
Returns system health status.

## 🚨 Troubleshooting

If the dashboard fails to load:
1. Verify the backend API is running: `curl http://localhost:5000/api/health`
2. Check browser console for CORS errors
3. Verify all dependencies are properly installed
4. Ensure the virtual environment is activated for the backend

For API errors, check the Python backend logs for specific error messages.

## 🤝 Contributing

1. Backend API: Modify `/api.py` for business logic
2. Frontend: Components are located in `/frontend/src/components/`
3. Styling: Color scheme and fonts defined in `/frontend/src/App.js`
4. Visualization: Charts implemented with Recharts in `/frontend/src/App.js`

---

The Quantum Hybrid Portfolio Dashboard provides an intuitive interface to explore how quantum-inspired algorithms can optimize investment portfolios. The system integrates advanced optimization techniques with real-time visualization and benchmark comparisons.