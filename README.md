# cloudconvert-bot

This Telegram bot ([@cloud_convert_bot](https://t.me/cloud_convert_bot)) mediates between the Telegram servers and those of cloudconvert.com to provide file conversions in Telegram.
It also relies on a Cloud Firestore database.
The code runs on GAE.

## Translations

The bot can be translated on the website [POEditor](https://poeditor.com/join/project/rBNUMw67kZ).
All contributions are welcome.
Feel free to add your own language if you like.

## How are files processed

Assume we know a chat ID, a message ID (for the message containing the file) and a target format (e.g. mp4).
We can now perform a file conversion by converting the file to the target format using the user's API key (or the default one if not applicable).
We use this API key for all following communication with cloudconvert.com.

The conversion works as follows:

1) Create a cloudconvert job with the correct configuration.
1) Send the ID of the import task to the satellite, along with chat ID and message ID.
1) The satellite downloads the file from the given message in the given chat and uploads it again to the task as identified by the given ID.
1) Once our webhook is invoked, we can transfer the file back by sending the export task ID along with a chat ID to our satellite.
1) The satellite can then download the file from cloudconvert and upload it again to the chat with the given ID.
1) Delete the file from the servers at cloudconvert.com so they don't pollute the dashboard.
(This would be done automatically after 24 hours if we didn't take action.)

## What else is there to say

There's not too much documentation, but the project is not too complicated anyway IMO.
If you have questions regarding anything, contact [me](https://t.me/KnorpelSenf) or join the [discussion group](https://t.me/cloud_convert_bot_lounge).
There's also a [news channel](https://t.me/cloud_convert_bot_news).
