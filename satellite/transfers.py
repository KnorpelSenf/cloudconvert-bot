# -*- coding: UTF-8 -*-
import asyncio
import os
from threading import Thread

from telethon import TelegramClient, utils

from fasttelethon import download_file, upload_file

BOT_TOKEN = os.environ['BOT_TOKEN']
APP_ID = os.environ['APP_ID']
APP_TOKEN = os.environ['APP_TOKEN']


def execute_on_new_session(operation):
    # execute each file transfer on a new session so that they interfer less
    client = TelegramClient(None, APP_ID, APP_TOKEN,
                            loop=asyncio.new_event_loop())

    client.loop.run_until_complete(client.connect())
    client.loop.run_until_complete(client.sign_in(bot_token=BOT_TOKEN))

    async def task():
        try:
            await operation(client)
        finally:
            try:
                await client.log_out()
            finally:
                await client.disconnect()

    client.loop.run_until_complete(task())


def upload(chat_id, file, progress_callback=None):
    async def operation(client):
        media = await upload_file(client,
                                  open(file, 'rb'),
                                  progress_callback=progress_callback)
        media.name = file
        await client.send_file(chat_id, file=media)
    execute_on_new_session(operation)


def download(chat_id, message_id, file, progress_callback=None):
    async def operation(client):
        msg = await client.get_messages(chat_id, ids=message_id)
        await download_file(client, msg.document,
                            open(file, 'wb'),
                            progress_callback=progress_callback)
    execute_on_new_session(operation)
