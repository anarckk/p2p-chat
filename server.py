#!/usr/bin/env python3
"""
简易静态文件服务器
用于发布 index.html 和 js 文件
"""

import http.server
import socketserver
import os
from pathlib import Path

# 配置
PORT = 13883
DIRECTORY = Path(__file__).parent / "src"

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """自定义请求处理器"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        """添加 CORS 头（如果需要跨域访问）"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def log_message(self, format, *args):
        """自定义日志输出"""
        print(f"[请求] {self.address_string()} - {format % args}")


def start_server():
    """启动静态服务器"""
    with socketserver.TCPServer(("", PORT), MyHTTPRequestHandler) as httpd:
        print(f"=" * 60)
        print(f"静态服务器已启动")
        print(f"=" * 60)
        print(f"访问地址: http://localhost:{PORT}")
        print(f"访问地址: http://127.0.0.1:{PORT}")
        print(f"工作目录: {DIRECTORY}")
        print(f"按 Ctrl+C 停止服务器")
        print(f"=" * 60)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n服务器已停止")
            httpd.shutdown()


if __name__ == "__main__":
    start_server()
