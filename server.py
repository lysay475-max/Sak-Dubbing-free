#!/usr/bin/env python3
"""
MT Dubber AI - Local Companion Server
Serves the web application, provides local Edge TTS fallback, and optional FFmpeg dubbing.
"""

import sys
import os
import re
import json
import asyncio
import tempfile
import shutil
import subprocess
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Check if edge-tts is available
HAS_EDGE_TTS = False
try:
    import edge_tts
    HAS_EDGE_TTS = True
except ImportError:
    pass

# Check if ffmpeg is available
HAS_FFMPEG = False
try:
    res = subprocess.run(["ffmpeg", "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode == 0:
        HAS_FFMPEG = True
except Exception:
    pass


class MTDubberHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Content-Disposition')
        self.end_headers()

    def do_POST(self):
        if self.path == '/tts':
            self.handle_tts()
        elif self.path == '/export_video':
            self.handle_export_video()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_tts(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        try:
            req_json = json.loads(post_data.decode('utf-8'))
            text = req_json.get('text', '')
            voice = req_json.get('voice', 'km-KH-PisethNeural')
            rate = req_json.get('rate', '+0%')

            if not text:
                self.send_error(400, "Missing text parameter")
                return

            audio_bytes = None

            # 1. Use local edge-tts package if installed
            if HAS_EDGE_TTS:
                try:
                    async def synth():
                        communicate = edge_tts.Communicate(text, voice, rate=rate)
                        out = bytearray()
                        async for chunk in communicate.stream():
                            if chunk["type"] == "audio":
                                out.extend(chunk["data"])
                        return bytes(out)
                    audio_bytes = asyncio.run(synth())
                except Exception as e:
                    print(f"[Local TTS Error]: {e}, falling back to remote endpoint...")

            # 2. If edge-tts not installed or failed, proxy to high-speed cloud endpoint
            if not audio_bytes:
                upstream_url = "https://khmer-voice-1.onrender.com/tts"
                req = urllib.request.Request(
                    upstream_url,
                    data=json.dumps({"text": text, "voice": voice, "rate": rate}).encode('utf-8'),
                    headers={'Content-Type': 'application/json', 'User-Agent': 'MTDubberAI/1.0'}
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    audio_bytes = resp.read()

            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(audio_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(audio_bytes)

        except Exception as e:
            err_msg = str(e).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(err_msg)

    def handle_export_video(self):
        content_type = self.headers.get('Content-Type', '')
        if 'boundary=' not in content_type:
            self.send_error(400, "Expected multipart/form-data with boundary")
            return

        boundary = content_type.split('boundary=')[1].strip()
        if ';' in boundary:
            boundary = boundary.split(';')[0].strip()
        boundary = boundary.strip('"\'').encode('utf-8')

        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)

        fields = {}
        files = {}
        delimiter = b'--' + boundary
        parts = post_data.split(delimiter)
        for p in parts:
            p = p.strip(b'\r\n')
            if not p or p == b'--':
                continue
            if b'\r\n\r\n' in p:
                header_chunk, content = p.split(b'\r\n\r\n', 1)
            elif b'\n\n' in p:
                header_chunk, content = p.split(b'\n\n', 1)
            else:
                continue
            header_text = header_chunk.decode('utf-8', errors='replace')
            name_m = re.search(r'name="([^"]+)"', header_text)
            fn_m = re.search(r'filename="([^"]+)"', header_text)
            if name_m:
                field_name = name_m.group(1)
                if fn_m:
                    files[field_name] = (fn_m.group(1), content)
                else:
                    fields[field_name] = content.decode('utf-8', errors='replace').strip()

        video_data = files.get('video')
        audio_data = files.get('audio')
        logo_data = files.get('logo')

        if not video_data or not audio_data:
            self.send_error(400, "Missing video or audio file")
            return

        pos = fields.get('pos', 'top-right')
        try:
            size_pct = float(fields.get('size_pct', 18)) / 100.0
        except ValueError:
            size_pct = 0.18
        try:
            opacity = float(fields.get('opacity', 90)) / 100.0
        except ValueError:
            opacity = 0.90

        temp_dir = tempfile.mkdtemp(prefix="mtd_export_")
        try:
            video_ext = os.path.splitext(video_data[0])[1] or '.mp4'
            v_path = os.path.join(temp_dir, f"input_video{video_ext}")
            with open(v_path, 'wb') as f:
                f.write(video_data[1])

            a_path = os.path.join(temp_dir, "input_audio.wav")
            with open(a_path, 'wb') as f:
                f.write(audio_data[1])

            out_path = os.path.join(temp_dir, "output.mp4")

            margin = 24
            if pos == 'top-left':
                overlay_xy = f"{margin}:{margin}"
            elif pos == 'bottom-right':
                overlay_xy = f"W-w-{margin}:H-h-{margin}"
            elif pos == 'bottom-left':
                overlay_xy = f"{margin}:H-h-{margin}"
            elif pos == 'center':
                overlay_xy = "(W-w)/2:(H-h)/2"
            else:  # top-right
                overlay_xy = f"W-w-{margin}:{margin}"

            if logo_data and len(logo_data[1]) > 50:
                l_ext = os.path.splitext(logo_data[0])[1] or '.png'
                l_path = os.path.join(temp_dir, f"logo{l_ext}")
                with open(l_path, 'wb') as f:
                    f.write(logo_data[1])

                filter_complex = (
                    f"[1:v]format=rgba,colorchannelmixer=aa={opacity:.2f},"
                    f"scale=main_w*{size_pct:.3f}:-1[logo];"
                    f"[0:v][logo]overlay={overlay_xy}:format=auto[outv]"
                )
                cmd = [
                    "ffmpeg", "-y",
                    "-i", v_path,
                    "-i", l_path,
                    "-i", a_path,
                    "-filter_complex", filter_complex,
                    "-map", "[outv]",
                    "-map", "2:a",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-crf", "21",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    "-movflags", "+faststart",
                    out_path
                ]
            else:
                cmd = [
                    "ffmpeg", "-y",
                    "-i", v_path,
                    "-i", a_path,
                    "-map", "0:v:0",
                    "-map", "1:a:0",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    "-movflags", "+faststart",
                    out_path
                ]

            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode != 0 or not os.path.exists(out_path):
                err = res.stderr.decode('utf-8', errors='replace')
                print(f"[FFmpeg Export Error]: {err[-300:]}")
                self.send_error(500, f"FFmpeg failed: {err[-100:]}")
                return

            with open(out_path, 'rb') as f:
                output_bytes = f.read()

            self.send_response(200)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Content-Length', str(len(output_bytes)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Disposition', 'attachment; filename="dubbed_video_with_logo.mp4"')
            self.end_headers()
            self.wfile.write(output_bytes)
        except Exception as e:
            err_msg = str(e).encode('utf-8')
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(err_msg)
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)


def run():
    print("=" * 60)
    print("  MT Dubber AI - Local Web Server & Khmer TTS Engine")
    print("=" * 60)
    print(f"  • Local Web App:     http://localhost:{PORT}")
    print(f"  • Edge TTS Engine:   {'Enabled (edge-tts Python)' if HAS_EDGE_TTS else 'Cloud Proxy (onrender)'}")
    print(f"  • FFmpeg Acceleration: {'Available' if HAS_FFMPEG else 'Not installed (Browser remux active)'}")
    print("=" * 60)
    print("Open http://localhost:8000 in your browser to start dubbing!\n")

    server_address = ('', PORT)
    httpd = HTTPServer(server_address, MTDubberHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == '__main__':
    run()
