from fastapi import FastAPI, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import base64
from enhancer import FaceEnhancer

app = FastAPI(title="Face Enhancement AI Service")

# Allow CORS for the Node.js backend or frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

enhancer = None

@app.get("/")
async def root():
    return {"status": "AI Service is running", "endpoint": "/enhance"}

@app.on_event("startup")
async def startup_event():
    global enhancer
    print("Loading FaceEnhancer model...")
    enhancer = FaceEnhancer()
    print("Model loaded successfully.")

@app.post("/enhance")
async def enhance_image(
    file: UploadFile = File(...),
    fidelity_weight: float = Form(0.5)
):
    print(f"Received enhancement request for file: {file.filename}, fidelity: {fidelity_weight}")
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image file"})
            
        enhanced_img = enhancer.enhance(img, fidelity_weight=fidelity_weight)
        
        # Encode image to jpg at maximum quality
        _, encoded_img = cv2.imencode('.jpg', enhanced_img, [int(cv2.IMWRITE_JPEG_QUALITY), 100])
        
        return Response(content=encoded_img.tobytes(), media_type="image/jpeg")
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.websocket("/ws/enhance")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive base64 string from client
            data = await websocket.receive_text()
            
            # Decode base64
            encoded_data = data.split(',')[1] if ',' in data else data
            nparr = np.frombuffer(base64.b64decode(encoded_data), np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is not None:
                # Enhance image with balanced fidelity (skip beautify for speed in live stream)
                enhanced_img = enhancer.enhance(img, fidelity_weight=0.5, skip_beautify=True)
                
                # Encode back to base64 at high quality
                _, buffer = cv2.imencode('.jpg', enhanced_img, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                b64_str = base64.b64encode(buffer).decode('utf-8')
                
                await websocket.send_text(f"data:image/jpeg;base64,{b64_str}")
    except WebSocketDisconnect:
        print("Client disconnected from WebSocket.")
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await websocket.close()
        except:
            pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
