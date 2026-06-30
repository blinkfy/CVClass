"""
Flask 应用工厂。
负责创建 app 实例、注册 Blueprint、配置 CORS、确保目录存在。
"""
from flask import Flask
from flask_cors import CORS
from config import Config
from app.modules import MODULE_REGISTRY
import os


def create_app():
    app = Flask(__name__, static_folder=Config.STATIC_DIR, template_folder=Config.TEMPLATE_DIR)
    app.config.from_object(Config)
    CORS(app, origins=Config.CORS_ORIGINS)

    # 确保运行时目录存在
    for d in [Config.UPLOAD_DIR, Config.RESULT_DIR]:
        os.makedirs(d, exist_ok=True)

    # 注册路由 Blueprint
    from app.routes import main_bp
    app.register_blueprint(main_bp)

    # 让模块注册表在请求上下文中可用
    app.config['MODULE_REGISTRY'] = MODULE_REGISTRY

    return app
