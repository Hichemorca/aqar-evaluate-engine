"""
AQAR Learning Engine v2.0 — Target Encoding + Unified Cleaning + Model Persistence
"""
import json
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_percentage_error, r2_score
from sklearn.preprocessing import LabelEncoder
import xgboost as xgb
import pickle
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
MODEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
INPUT_FILE = os.path.join(DATA_DIR, 'dld-transactions.json')
MODEL_FILE = os.path.join(MODEL_DIR, 'aqar_xgboost_v2.pkl')
ENCODER_FILE = os.path.join(MODEL_DIR, 'aqar_encoders_v2.pkl')
METRICS_FILE = os.path.join(MODEL_DIR, 'model_metrics.json')

def load_and_clean_data():
    """Load and apply same 9-stage cleaning as evaluate-and-save.js"""
    if not os.path.exists(INPUT_FILE):
        print("❌ No DLD data found")
        return None
    
    with open(INPUT_FILE, 'r') as f:
        data = json.load(f)
    
    df = pd.DataFrame(data)
    print(f"📋 Loaded {len(df):,} transactions")
    
    # Same cleaning as evaluate-and-save.js
    # Exclude non-market procedures
    non_market = ['development registration', 'sell development', 'lease to own registration']
    df = df[~df['procedure'].fillna('').str.lower().apply(
        lambda x: any(p in x for p in non_market)
    )]
    
    # Basic filters
    df = df[df['actualSalePrice'] > 0]
    df = df[df['area'] > 0]
    df = df[df['district'].notna() & (df['district'] != 'Unknown')]
    df = df[df['propertyType'].notna() & (df['propertyType'] != 'Unknown')]
    
    # Calculate target
    df['pricePerSqm'] = df['actualSalePrice'] / df['area']
    
    # IQR on log-scale (same as fixed evaluate-and-save.js)
    for (district, ptype), group in df.groupby(['district', 'propertyType']):
        if len(group) < 5:
            continue
        log_prices = np.log(group['pricePerSqm'])
        Q1 = log_prices.quantile(0.25)
        Q3 = log_prices.quantile(0.75)
        IQR = Q3 - Q1
        lo = np.exp(Q1 - 1.5 * IQR)
        hi = np.exp(Q3 + 1.5 * IQR)
        mask = (df['pricePerSqm'] >= lo) & (df['pricePerSqm'] <= hi)
        # Only apply to this group
        group_idx = group.index
        bad_idx = group_idx[~mask[group_idx]]
        df.loc[bad_idx, 'pricePerSqm'] = np.nan
    
    df = df.dropna(subset=['pricePerSqm'])
    
    # Remove off-plan
    if 'isOffPlan' in df.columns:
        df = df[df['isOffPlan'] != True]
    
    print(f"📊 After cleaning: {len(df):,} transactions")
    return df

def prepare_features(df):
    """Prepare features with Target Encoding for categorical variables"""
    
    # Target Encoding for project (strongest signal)
    if 'project' in df.columns and df['project'].notna().sum() > 0:
        project_means = df.groupby('project')['pricePerSqm'].mean()
        global_mean = df['pricePerSqm'].mean()
        project_counts = df.groupby('project').size()
        # Smoothing: blend project mean with global mean based on sample size
        alpha = 10  # smoothing factor
        df['project_te'] = df['project'].map(
            lambda x: (project_means.get(x, global_mean) * project_counts.get(x, 0) + global_mean * alpha) / 
                      (project_counts.get(x, 0) + alpha)
        )
    else:
        df['project_te'] = df['pricePerSqm'].mean()
    
    # Target Encoding for district
    district_means = df.groupby('district')['pricePerSqm'].mean()
    district_counts = df.groupby('district').size()
    alpha = 20
    df['district_te'] = df['district'].map(
        lambda x: (district_means.get(x, global_mean) * district_counts.get(x, 0) + global_mean * alpha) / 
                  (district_counts.get(x, 0) + alpha)
    ) if 'district' in df.columns else df['pricePerSqm'].mean()
    
    # Target Encoding for propertyType
    type_means = df.groupby('propertyType')['pricePerSqm'].mean()
    df['type_te'] = df['propertyType'].map(type_means) if 'propertyType' in df.columns else df['pricePerSqm'].mean()
    
    # Numerical features
    df['rooms'] = df['rooms'].fillna(0)
    df['parking'] = df['parking'].fillna(0)
    
    # Binary features
    df['hasMetro'] = df['nearestMetro'].apply(
        lambda x: 1 if x and str(x).lower() not in ['no', 'none', 'n/a', ''] and len(str(x)) > 2 else 0
    ) if 'nearestMetro' in df.columns else 0
    
    df['hasMall'] = df['nearestMall'].apply(
        lambda x: 1 if x and str(x).lower() not in ['no', 'none', 'n/a', ''] and len(str(x)) > 2 else 0
    ) if 'nearestMall' in df.columns else 0
    
    # Time feature: days since start of dataset
    if 'saleDate' in df.columns:
        df['saleDate'] = pd.to_datetime(df['saleDate'], errors='coerce')
        min_date = df['saleDate'].min()
        df['daysSinceStart'] = (df['saleDate'] - min_date).dt.days.fillna(0)
    else:
        df['daysSinceStart'] = 0
    
    # Feature list
    feature_cols = ['area', 'rooms', 'parking', 'project_te', 'district_te', 'type_te', 'hasMetro', 'hasMall', 'daysSinceStart']
    
    df_clean = df.dropna(subset=feature_cols + ['pricePerSqm'])
    
    X = df_clean[feature_cols].values
    y = df_clean['pricePerSqm'].values
    
    return X, y, feature_cols, df_clean

def train_model(X, y, df):
    """Train with time-based split for realistic evaluation"""
    
    # Sort by date for time-based split
    if 'daysSinceStart' in df.columns:
        idx = np.argsort(df['daysSinceStart'].values)
        X = X[idx]
        y = y[idx]
    
    # Time-based split: last 20% for testing
    split_idx = int(len(X) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    print(f"📊 Training: {len(X_train):,} | Testing: {len(X_test):,} (time-based split)")
    
    model = xgb.XGBRegressor(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
        n_jobs=-1
    )
    
    print("🧠 Training XGBoost v2 (Target Encoding)...")
    model.fit(X_train, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test)
    mape = mean_absolute_percentage_error(y_test, y_pred) * 100
    r2 = r2_score(y_test, y_pred)
    accuracy = 100 - mape
    
    print(f"📊 Test MAPE: {mape:.1f}%")
    print(f"📊 Test R²: {r2:.3f}")
    print(f"📊 Accuracy: {accuracy:.1f}%")
    
    # Feature importance
    importance = model.feature_importances_
    print("\n📊 Feature Importance:")
    for i, imp in enumerate(importance):
        print(f"   Feature {i}: {imp:.4f}")
    
    return model, accuracy, r2

def save_model(model, feature_cols, metrics):
    """Save trained model and metadata"""
    if not os.path.exists(MODEL_DIR):
        os.makedirs(MODEL_DIR)
    
    with open(MODEL_FILE, 'wb') as f:
        pickle.dump(model, f)
    
    with open(ENCODER_FILE, 'wb') as f:
        pickle.dump({'feature_cols': feature_cols}, f)
    
    metrics['trainedAt'] = datetime.now().isoformat()
    metrics['modelVersion'] = '2.0.0'
    with open(METRICS_FILE, 'w') as f:
        json.dump(metrics, f, indent=2)
    
    print(f"\n✅ Model saved to {MODEL_FILE}")

def main():
    print("🚀 AQAR Learning Engine v2.0 (Target Encoding)\n")
    print("=" * 50)
    
    df = load_and_clean_data()
    if df is None or len(df) < 100:
        print("❌ Insufficient data")
        return
    
    X, y, feature_cols, df_clean = prepare_features(df)
    print(f"\n📊 Features: {X.shape[1]} | Samples: {X.shape[0]:,}")
    
    model, accuracy, r2 = train_model(X, y, df_clean)
    
    # Compare with current median method
    accuracy_file = os.path.join(DATA_DIR, 'accuracy-data.json')
    current_accuracy = 0
    if os.path.exists(accuracy_file):
        with open(accuracy_file, 'r') as f:
            data = json.load(f)
        current_accuracy = data.get('metrics', {}).get('avgAccuracy', 0)
    
    print(f"\n📊 Performance Comparison (Time-Based Split):")
    print(f"   Current (Median): {current_accuracy:.1f}%")
    print(f"   XGBoost v2:       {accuracy:.1f}%")
    
    metrics = {
        'modelAccuracy': round(accuracy, 1),
        'mape': round(100 - accuracy, 1),
        'r2': round(r2, 3),
        'trainingSamples': X.shape[0],
        'features': feature_cols,
        'previousAccuracy': current_accuracy
    }
    save_model(model, feature_cols, metrics)
    
    print("\n" + "=" * 50)
    print("✅ Learning cycle complete")

if __name__ == '__main__':
    main()