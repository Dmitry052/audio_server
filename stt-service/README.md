# STT Service

## Setup

```bash
python3 -m venv whisper-env
source whisper-env/bin/activate
pip install faster-whisper fastapi uvicorn python-multipart
```

## Install CUDA / cuBLAS (`libcublas.so.12`)

These commands are for `Ubuntu 22.04 x86_64`. If you use another distro, keep the checks below the same but swap the NVIDIA repo URL for your OS.

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update

# Full CUDA toolkit
sudo apt-get install -y cuda-toolkit

# If you only need cuBLAS runtime, this is the narrower option
sudo apt-get install -y libcublas-12-8 libcublas-dev-12-8
```

## Check GPU / CUDA / cuBLAS

```bash
# GPU is visible to the driver
nvidia-smi

# cuBLAS library can be found by the dynamic linker
ldconfig -p | grep libcublas.so.12

# Search the filesystem if ldconfig shows nothing
find /usr -name 'libcublas.so*' 2>/dev/null
find /usr/local -name 'libcublas.so*' 2>/dev/null

# Try loading the exact runtime from Python
python3 -c "import ctypes; ctypes.CDLL('libcublas.so.12'); print('libcublas.so.12: OK')"
```

## If `libcublas.so.12` is installed but not found

```bash
export LD_LIBRARY_PATH=/usr/local/lib/ollama/cuda_v12:$LD_LIBRARY_PATH
python3 -c 'import ctypes; ctypes.CDLL("libcublas.so.12"); print("libcublas.so.12: OK")'

# To make the path permanent for the dynamic linker
echo '/usr/local/lib/ollama/cuda_v12' | sudo tee /etc/ld.so.conf.d/ollama-cuda-v12.conf
sudo ldconfig

ldconfig -p | grep libcublas.so.12
python3 -c 'import ctypes; ctypes.CDLL("libcublas.so.12"); print("libcublas.so.12: OK")'
```

## Run

```bash
source whisper-env/bin/activate
uvicorn main:app --host 0.0.0.0 --port 9000
```

## Verify

```bash
curl -X POST http://localhost:9000/transcribe \
  -F "file=@/path/to/audio.wav"
```

Expected response shape:

```json
{"language":"en","text":"...","device":"cuda","compute_type":"float16"}
```

If CUDA runtime still cannot be loaded, the service now falls back to CPU and you will typically see:

```json
{"language":"en","text":"...","device":"cpu","compute_type":"int8"}
```
