"""
全局配置。所有可调参数集中管理。
"""
import os

# 加载 .env 文件（优先级低于系统环境变量）
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))
except Exception:
    pass


class Config:
    # 服务
    HOST = '127.0.0.1'
    PORT = 7860
    DEBUG = True

    # 路径 —— 相对于项目根目录
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    STATIC_DIR = os.path.join(BASE_DIR, 'static')
    TEMPLATE_DIR = os.path.join(BASE_DIR, 'templates')
    UPLOAD_DIR = os.path.join(STATIC_DIR, 'uploads')
    RESULT_DIR = os.path.join(STATIC_DIR, 'results')

    # 上传限制
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB

    # CORS
    CORS_ORIGINS = ['*']
