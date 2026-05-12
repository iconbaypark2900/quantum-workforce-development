# 🌌 Quantum Hybrid Portfolio Dashboard

An interactive dashboard for visualizing quantum-inspired portfolio optimization using Quantum Stochastic Walk (QSW) algorithms.

## 🚀 Features

- **Real-time Portfolio Optimization**: Visualize quantum-inspired portfolio optimization
- **Interactive Controls**: Adjust parameters and see results instantly
- **Multiple Visualizations**:
  - Portfolio allocation pie charts
  - Risk vs return scatter plots
  - Asset performance bar charts
  - Network visualization of asset relationships
- **Market Regime Simulation**: Test different market conditions (bull, bear, volatile, normal)
- **Performance Metrics**: Sharpe ratio, expected return, volatility, and turnover tracking

## 📊 Dashboard Sections

### 1. Configuration Panel
- Adjust number of assets to optimize
- Select market regime (affects correlation thresholds)
- Tune quantum mixing parameter (omega)
- Run optimization button

### 2. Key Metrics
- Sharpe Ratio: Risk-adjusted return metric
- Expected Return: Portfolio's projected annual return
- Risk (Volatility): Portfolio's annualized volatility
- Turnover: Level of trading activity

### 3. Visualization Panels
- **Allocation Chart**: Shows weight distribution across assets
- **Performance Chart**: Expected returns for each asset
- **Risk-Return Chart**: Scatter plot of risk vs return with bubble sizing
- **Graph Visualization**: Network representation of asset relationships

## 🛠️ Installation

Make sure you have the Quantum Hybrid Portfolio system installed:

```bash
# Navigate to the project directory
cd quantum-hybrid-portfolio

# Activate the virtual environment
source .venv/bin/activate

# Install dependencies (if not already installed)
pip install -r deps/requirements.txt
```

## ▶️ Running the Dashboard

The main dashboard is the React application. Start it with:

```bash
cd frontend
npm install
npm start
```

Or use the combined launcher (starts both API and frontend):

```bash
./scripts/run_dashboard.sh
```

### Access the Dashboard
Open your browser and navigate to:
- [http://localhost:3000](http://localhost:3000)

## 🎛️ Controls Guide

1. **Number of Assets Slider**: Choose how many assets to include (5-30 assets)
2. **Market Regime Dropdown**: Select market condition:
   - Bull Market: Optimistic growth conditions
   - Bear Market: Downturn conditions
   - Volatile: High uncertainty environment
   - Normal: Standard market conditions
3. **Omega Parameter**: Adjust quantum mixing parameter (0.1-0.5)
4. **Run Optimization Button**: Execute the quantum-inspired optimization

## 📈 Interpreting Results

- **High Sharpe Ratio**: Better risk-adjusted returns
- **Balanced Allocation**: Proper diversification across assets
- **Low Turnover**: Reduced trading costs and stability
- **Clustered Network**: Highly connected assets may indicate sector similarities

## 🔬 Technical Details

The dashboard integrates with the core QSW optimizer:
- Uses the same quantum evolution mathematics
- Simulates the same graph construction algorithms
- Applies identical stability enhancement techniques
- Maintains real-time connection to the optimization pipeline

## 🐞 Troubleshooting

If the dashboard doesn't start:
1. Ensure you're in the correct directory
2. Verify the virtual environment is activated
3. Check that all dependencies are installed

For visualization issues:
- Ensure your browser supports modern JavaScript
- Clear browser cache if charts don't load properly

## 📁 File Structure
```
frontend/             # React dashboard (main UI)
scripts/run_dashboard.sh   # Launches API + React dashboard (repo root: ./scripts/run_dashboard.sh)
deps/requirements.txt      # Python dependencies
```

## 🤝 Contributing

Feel free to enhance the dashboard by:
- Adding new visualization types
- Including more performance metrics
- Improving UI/UX design
- Adding export capabilities

---

**Ready to explore quantum-inspired portfolio optimization? Start the dashboard and begin experimenting with different parameters to see how quantum algorithms can optimize investment portfolios!**