# Quantum Portfolio Dashboard - Comprehensive Feature Guide

## Dashboard Overview

The Quantum Portfolio Dashboard is the React application at http://localhost:3000.

## React Dashboard Features (http://localhost:3000)

### 1. Advanced Customization Features

#### Dashboard Personalization
- **Editable Titles**: Click on the main dashboard title "Quantum Portfolio Lab" or section headers to rename them
- **Dynamic Sections**: Rename sections like "Portfolio Holdings", "Sector Breakdown", etc.
- **Custom Labels**: Each section can be renamed to match your specific needs

#### Preset Management
- **Built-in Presets**: 
  - Conservative: Lower risk, stable allocation
  - Aggressive: Higher risk, growth-focused
  - Balanced: Moderate risk-return profile
- **Custom Presets**: Save your own parameter combinations with the "Save Current Settings as Preset" button
- **One-click Application**: Apply presets with a single click

#### Theme Customization
- **Multiple Themes**:
  - Dark: Default dark theme
  - Light: High contrast light theme
  - Ocean: Blue-toned theme
  - Forest: Green-toned theme
  - Sunset: Warm-toned theme
- **Visual Consistency**: Color schemes applied consistently across all elements

#### Interactive Controls
- **Real-time Updates**: Changes reflect immediately in all visualizations
- **Draggable Metrics**: Rearrange metric cards by dragging them
- **Hover Effects**: Visual feedback on interactive elements
- **Smooth Transitions**: Animated transitions between states

### 2. Quantum Parameter Controls

#### Quantum Parameters
- **Omega (ω)**: Mixing parameter controlling quantum potential vs. graph coupling
  - Range: 0.05 to 0.60
  - Default: 0.30
  - Higher values emphasize graph coupling over quantum potential

- **Evolution Time**: Controls smoothing vs. differentiation
  - Range: 1 to 50
  - Default: 10
  - Higher values = more smoothing, lower differentiation

#### Evolution Methods
- **Continuous**: Standard quantum stochastic walk
- **Discrete**: Discrete-time quantum walk simulation
- **Decoherent**: Includes decoherence effects
- **Annealing**: Quantum annealing optimization approach

#### Market Regime Selection
- **Normal**: Standard market conditions
- **Bull**: Optimistic growth conditions
- **Bear**: Downturn conditions
- **Volatile**: High uncertainty environment

#### Portfolio Constraints
- **Max Weight**: Maximum allocation per position (3% to 30%)
- **Max Turnover**: Maximum portfolio turnover per rebalance (5% to 50%)
- **Universe Size**: Number of assets in investable universe (5 to 30)

### 3. Advanced Features

#### Custom Ticker Override
- Input custom ticker symbols in the "Custom Tickers" field
- Format: AAPL, MSFT, GOOGL (comma-separated)
- Leave empty to use default tickers
- Count must match Universe Size or first N will be used

#### Strategy Selection
Toggle which strategies appear in comparison charts:
- QSW (Quantum Stochastic Walk)
- QSW-Discrete
- QSW-Decoherent
- Quantum Annealing
- Equal Weight
- Min Variance
- Risk Parity
- Max Sharpe

#### Export Capabilities
- **Multiple Formats**: Export charts in PNG, SVG, and CSV formats
- **Data Export**: Download portfolio data for external analysis

### 4. Dashboard Tabs

#### Portfolio Tab
- **Holdings**: Shows top positions and their allocations
- **Sector Breakdown**: Pie chart of allocation by sector
- **Risk-Return Map**: Scatter plot showing risk vs return characteristics

#### Performance Tab
- **Equity Curves**: Cumulative performance vs. benchmarks
- **Strategy Comparison**: Side-by-side comparison of all strategies

#### Risk Tab
- **Value at Risk**: Historical simulation with 95% confidence
- **Factor Risk Decomposition**: Radar chart of factor exposures
- **Stress Test Scenarios**: Impact under historical crisis scenarios

#### Sensitivity Tab
- **Quantum Method Comparison**: Performance comparison of different quantum methods
- **Omega Sensitivity**: How Sharpe ratio varies with Omega parameter
- **Parameter Impact Analysis**: How different parameters affect performance

## How to Use the Dashboard

### Getting Started
1. Open your browser and navigate to http://localhost:3000
2. Adjust quantum parameters using the sliders in the left panel
3. Select different evolution methods to compare approaches
4. Change market regime to see how it affects allocations

### Customization Workflow
1. **Rename Dashboard**: Click on the main title to customize it
2. **Select Theme**: Choose from the theme selector to match your preference
3. **Apply Preset**: Use built-in presets or create your own
4. **Adjust Parameters**: Fine-tune quantum parameters for your strategy
5. **Select Strategies**: Choose which approaches to compare
6. **Save Configuration**: Create custom presets for future use

### Advanced Usage
1. **Custom Tickers**: Override default assets with your own symbols
2. **Method Comparison**: Compare all four quantum methods simultaneously
3. **Sensitivity Analysis**: Use the Sensitivity tab to understand parameter impacts
4. **Export Data**: Download charts and data for presentations

## Key Metrics Explained

- **Sharpe Ratio**: Risk-adjusted return (higher is better)
- **Expected Return**: Annualized projected return
- **Volatility**: Annualized risk measure
- **Active Positions**: Number of holdings above 0.5% weight
- **Daily VaR (95%)**: Maximum expected daily loss at 95% confidence

## Troubleshooting

If you encounter issues:
1. Refresh the page to reset any temporary glitches
2. Use the "Reset All Parameters" button to return to defaults
3. Check that the React app (port 3000) and API (port 5000) are running
4. Clear browser cache if visual elements don't load properly

## Tips for Best Experience

- Start with the "Balanced" preset to see baseline performance
- Experiment with different evolution methods to understand their characteristics
- Use the Omega sensitivity chart to find optimal parameter ranges
- Compare quantum methods against traditional benchmarks
- Adjust market regime to simulate different economic conditions