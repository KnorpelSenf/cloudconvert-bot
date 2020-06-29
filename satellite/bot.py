
import os
import tempfile

import cloudconvert

from transfers import download, upload


def export_file(api_key, task_id, chat_id):
    cloudconvert.configure(api_key=api_key)
    with tempfile.NamedTemporaryFile() as f:
        # get cloudconvert task
        export_task = cloudconvert.Task.find(id=task_id)
        # get file in task
        file = export_task.get('result').get('files')[0]
        # download file from cloudconvert
        cloudconvert.download(filename=f.name, url=file['url'])
        # upload again to Telegram
        upload(chat_id, f.name, display_name=file['filename'])


def import_file(api_key, task_id, chat_id, message_id):
    cloudconvert.configure(api_key=api_key)
    with tempfile.NamedTemporaryFile() as f:
        # download file from Telegram
        download(chat_id, message_id, f.name)
        # get cloudconvert task
        upload_task = cloudconvert.Task.find(id=task_id)
        # upload again to cloudconvert
        cloudconvert.Task.upload(file_name=f.name, task=upload_task)
