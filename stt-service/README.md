# setup
python3 -m venv whisper-env
pip install faster-whisper fastapi uvicorn python-multipart

# run 
uvicorn main:app --host 0.0.0.0 --port 9000