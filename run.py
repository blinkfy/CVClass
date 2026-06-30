"""
Cvtoolkits 启动入口。
直接 python run.py 即可在 http://127.0.0.1:7860 访问。
"""
from app import create_app

app = create_app()

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=7860, debug=True)
