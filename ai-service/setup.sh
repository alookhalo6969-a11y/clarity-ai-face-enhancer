#!/bin/bash
set -e

echo "Setting up AI Service..."

# 1. Create venv if not exists
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate

# 2. Install pip requirements
pip install -r requirements.txt

# 3. Clone CodeFormer
if [ ! -d "CodeFormer" ]; then
    git clone https://github.com/sczhou/CodeFormer.git
    cd CodeFormer
    pip install -r requirements.txt
    # Install basicsr
    python basicsr/setup.py develop
    
    # Download weights
    python scripts/download_pretrained_models.py facelib
    python scripts/download_pretrained_models.py CodeFormer
    cd ..
fi

echo "Setup complete. To run the AI service:"
echo "source venv/bin/activate"
echo "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
