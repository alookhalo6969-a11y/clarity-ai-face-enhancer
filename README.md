# Clarity AI: Real-Time Facial Enhancement & Synthesis

A powerful web application built with **Node.js (Express)**, **Python (FastAPI)**, and **React (Vanilla JS)** that enhances facial photos in real-time using **CodeFormer**.

## 🚀 Features
- **Batch Processing**: Upload 3-10 images and enhance them all at once.
- **Live Stream**: Real-time facial enhancement from your webcam using WebSockets.
- **AI-Powered Clarity**: Uses CodeFormer for face restoration and a custom beautification pipeline for stunning results.
- **Interactive UI**: Premium glassmorphic design with an enhancement strength slider.
- **Downloadable Results**: One-click download for your enhanced high-definition photos.

## 🛠 Tech Stack
- **Backend**: Node.js, Express.js
- **AI Service**: Python, FastAPI, PyTorch (MPS support for Apple Silicon)
- **AI Model**: CodeFormer (Face Restoration)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (No complex build steps)

## 📦 Installation & Setup

### 1. AI Service (Python)
Ensure you have Python 3.9+ installed.
```bash
cd ai-service
chmod +x setup.sh
./setup.sh
```
The setup script will create a virtual environment, install dependencies, and download required AI model weights.

### 2. Backend (Node.js)
```bash
cd backend
npm install
npm start
```
The server will start on `http://localhost:5001`.

### 3. Usage
- Open `http://localhost:5001` in your browser.
- Use the **Batch Process** tab to upload and enhance photos.
- Use the **Live Stream** tab for real-time webcam enhancement.

## ⚖️ License
MIT
# clarity-ai-face-enhancer
