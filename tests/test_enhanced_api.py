"""
Test script to verify the enhanced API endpoints
"""
import requests
import json

def test_api_endpoints():
    base_url = "http://localhost:5000"
    
    print("Testing Enhanced Quantum Portfolio API...")
    print("="*50)
    
    # Test health endpoint
    print("1. Testing health endpoint...")
    try:
        response = requests.get(f"{base_url}/api/health")
        if response.status_code == 200:
            health_data = response.json()
            print(f"   ✓ Health check: {health_data['status']} - {health_data['message']}")
        else:
            print(f"   ✗ Health check failed with status {response.status_code}")
    except Exception as e:
        print(f"   ✗ Health check error: {e}")
    
    # Test scenarios endpoint
    print("\n2. Testing scenarios endpoint...")
    try:
        response = requests.get(f"{base_url}/api/scenarios")
        if response.status_code == 200:
            scenarios_data = response.json()
            if scenarios_data.get('success'):
                print(f"   ✓ Retrieved {len(scenarios_data['scenarios'])} market scenarios")
                for scenario in scenarios_data['scenarios']:
                    print(f"     - {scenario['name']}: {scenario['description']}")
            else:
                print(f"   ✗ Scenarios endpoint returned success=false")
        else:
            print(f"   ✗ Scenarios endpoint failed with status {response.status_code}")
    except Exception as e:
        print(f"   ✗ Scenarios endpoint error: {e}")
    
    # Test ticker metadata endpoint
    print("\n3. Testing ticker metadata endpoint...")
    try:
        response = requests.post(f"{base_url}/api/ticker-metadata", 
                                json={"tickers": ["AAPL", "MSFT", "GOOGL"]})
        if response.status_code == 200:
            metadata_data = response.json()
            if metadata_data.get('success'):
                print(f"   ✓ Retrieved metadata for {len(metadata_data['valid_tickers'])} tickers")
                for ticker, meta in list(metadata_data['metadata'].items())[:3]:  # Show first 3
                    print(f"     - {ticker}: {meta.get('name', 'N/A')}, Sector: {meta.get('sector', 'N/A')}")
            else:
                print(f"   ✗ Ticker metadata endpoint returned success=false")
        else:
            print(f"   ✗ Ticker metadata endpoint failed with status {response.status_code}")
    except Exception as e:
        print(f"   ✗ Ticker metadata endpoint error: {e}")
    
    # Test optimization endpoint with sample data
    print("\n4. Testing optimization endpoint...")
    try:
        optimization_payload = {
            "tickers": ["AAPL", "MSFT", "GOOGL", "AMZN", "TSLA"],
            "start_date": "2023-01-01",
            "end_date": "2023-12-31",
            "regime": "normal",
            "omega": 0.3,
            "evolution_time": 10,
            "max_weight": 0.3,
            "turnover_limit": 0.2,
            "evolution_method": "continuous",
            "objective": "balanced"
        }
        
        response = requests.post(f"{base_url}/api/optimize", json=optimization_payload)
        if response.status_code == 200:
            opt_data = response.json()
            if opt_data.get('success'):
                print(f"   ✓ Optimization completed successfully")
                print(f"     - Sharpe Ratio: {opt_data['qsw_result']['sharpe_ratio']:.3f}")
                print(f"     - Expected Return: {opt_data['qsw_result']['expected_return']:.3f}")
                print(f"     - Volatility: {opt_data['qsw_result']['volatility']:.3f}")
                print(f"     - Assets in portfolio: {len(opt_data['holdings'])}")
            else:
                print(f"   ⚠ Optimization returned success=false: {opt_data.get('error', 'Unknown error')}")
        else:
            print(f"   ✗ Optimization endpoint failed with status {response.status_code}")
            print(f"     Response: {response.text}")
    except Exception as e:
        print(f"   ✗ Optimization endpoint error: {e}")
    
    print("\n" + "="*50)
    print("API testing completed!")

if __name__ == "__main__":
    test_api_endpoints()