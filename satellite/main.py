import os
from concurrent.futures.thread import ThreadPoolExecutor

from flask import Flask, request

from bot import export_file, import_file

CONTEXT_PATH = (os.environ['CONTEXT_PATH']
                if 'CONTEXT_PATH' in os.environ
                else os.environ['BOT_TOKEN'])
MAX_WORKERS = (os.environ['MAX_WORKERS']
               if 'MAX_WORKERS' in os.environ
               else 8)

app = Flask(__name__)

executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)


@app.route('/' + CONTEXT_PATH + '/export', methods=['POST'])
def exp():
    data = request.get_json()
    api_key = data['api_key']
    task_id = data['task_id']
    chat_id = data['chat_id']
    executor.submit(export_file, api_key, task_id, chat_id)
    return ('', 202)


@app.route('/' + CONTEXT_PATH + '/import', methods=['POST'])
def imp():
    data = request.get_json()
    api_key = data['api_key']
    task_id = data['task_id']
    chat_id = data['chat_id']
    message_id = data['message_id']
    executor.submit(import_file, api_key, task_id, chat_id, message_id)
    return ('', 202)
