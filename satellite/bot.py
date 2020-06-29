
import tempfile

import cloudconvert

from transfers import download, upload


def export_file(task_id, chat_id):
    with tempfile.NamedTemporaryFile() as f:
        # get cloudconvert task
        export_task = cloudconvert.Task.find(id=task_id)
        # get file in task
        file = export_task.get('result').get('files')[0]
        # download file from cloudconvert
        cloudconvert.download(filename=f, url=file['url'])
        # upload again to Telegram
        upload(chat_id, file)


def import_file(task_id, chat_id, message_id):
    with tempfile.NamedTemporaryFile() as f:
        # download file from Telegram
        download(chat_id, message_id, f)
        # get cloudconvert task
        upload_task = cloudconvert.Task.find(id=task_id)
        # upload again to cloudconvert
        cloudconvert.Task.upload(file_name=f, task=upload_task)
