# cloudconvert-bot

This Telegram bot ([@cloud_convert_bot](https://t.me/cloud_convert_bot)) mediates between the Telegram servers and those of cloudconvert.com to provide file conversions in Telegram.
It also relies on a Cloud Firestore database.
The code runs on GAE.

## Translations

The bot can be translated on the website [POEditor](https://poeditor.com/join/project/rBNUMw67kZ).
All contributions are welcome.
Feel free to add your own language if you like.

## Installation

Make sure you have [Node.js](https://nodejs.org) installed. The package manager `npm` comes with it.

Then open a terminal in the root directory of this repository and run

```bash
npm install
```

to install all necessary dependencies for this project.

## Building

The [TypeScript](https://typescriptlang.org) compiler is used to build this project.
It can be invoked using

```bash
npm run build
```

## Lint

This project enforces linting rules using [ESLint](https://eslint.org/).
Simply run

```bash
npm run lint
```

to make sure everything in the code looks pretty.

## Running in production

The command

```bash
npm start
```

runs the project after it was built.
Only a few logs are emitted, among them are error logs.

This is the command GAE will run when you deploy the project later on.

## Running with all logs

Execute

```bash
npm run debug
```

to run the built project with all logs.
This is nice for debugging.

## Deployment

### Initial setup

#### App Engine

This project runs on GCP, the [Google Cloud Platform](https://cloud.google.com).
It (ab)uses an App Engine Frontend instance with autoscaling fixed to 1 because that's included in the free plan.
As stated above, all data is stored in a Cloud Firestore database.

First, you need to

1) [create a GCP project](https://cloud.google.com/resource-manager/docs/creating-managing-projects),
1) [set up your development environment](https://cloud.google.com/appengine/docs/standard/nodejs/setting-up-environment), and
1) [prepare your project for App Engine usage](https://cloud.google.com/appengine/docs/standard/nodejs/console).

The last step includes enabling your project for billing.
Note that the deployment of this bot is completely free as long as the bot's traffic stays within the [free quota](https://cloud.google.com/free) of GCP.

#### Database

You need to create a Firestore database, obtain a keyfile containing credentials and save that file in the root folder of this repository.
The name of the keyfile should be `firestore-keyfile.json` because that name is excluded in `.gitignore`.

You can just follow two sections from the a tutorial page, namely those:

1) [Creating a Cloud Firestore database](https://cloud.google.com/firestore/docs/quickstart-servers#create_a_in_native_mode_database)
1) [Setting up authentication](https://cloud.google.com/firestore/docs/quickstart-servers#set_up_authentication)

#### Tokens and environment variables

Create a file called `.env` in the root directory of this repository.
It will contain all of the variables that the bot will pick up automatically when it starts.

Use the format

```bash
VARIABLE_NAME=variable-value
```

inside the `.env` file.

Three environment variables need to be set for this bot to work.

1) You need to create a bot using [@BotFather](https://telegram.me/BotFather) and write its token to a variable named `BOT_API_TOKEN`
1) You need to supply your personal CloudConvert account as a backup account for the bot.
All users of your bot will share the conversion minutes from that account until they submit their own API key.
Add the API key of your personal account to a variable called `CLOUD_CONVERT_API_TOKEN`.
1) **Optional.**
The bot is able to send error logs to a chat on Telegram, for example a private channel that contains the debug log.
Set the ID of this chat in a variable with the name `ADMIN_ID`.

It usually makes sense to create two bots using [@BotFather](https://t.me/BotFather), one for production and one for development.

This bot runs with webhooks but it will automatically switch to long polling mode if 'dev' is contained in the bot name.
(E. g. the primary test bot is [@cloud_convert_dev_bot](https://t.me/cloud_convert_dev_bot).)
This way, you can host the bot efficiently (webhooks) and still use it locally (long polling).

As of today, you need to change the bot token in the `.env` file in order to switch between different bots.
I know it would be much nicer to control this via environment variable … hopefully this will be improved in the future.

Note that the `.gitignore` file contains not only the `.env` file name but also an entry for `.env.production`.
This naming is a bit misleading, but again, it might be improved in the future.
As of today, the `.env.production` file will be completely ignored in all cases by the bot.
However, you can use it to store a second set of credentials.
You can now exchange the files to switch between the bots.
In other words, have your development bot token (and everything else) in one `.env` file and have your production bot token in `.env.production`.
Once you want to deploy, exchange both files.

### Roll out new version

After performing the initial setup, you can easily deploy a new production version of the currently checked out source code by running

```bash
gcloud app deploy
```

## Software architecture

The bots uses [Telegraf.js](https://telegraf.js.org) as the framework for the bot.
Make sure you understand how the framework is used, including how middleware works.

Basically, in `src/app.ts`, we start the bot which is in `src/bot/bot.ts`.
It loads all sorts of middleware from the controllers in `src/bot/controllers` to handle the various different kinds of messages.
The controllers do IO (database and replying) and control models in `src/bot/models`.
The models do the actual file conversions and generally the communication with cloudconvert.com.
The packages `src/bot/{helpers,middlewares}` are of supportive nature and only provide various utilities.

## What else is there to say

There's not too much documentation, but the project is not too complicated anyway IMO.
If you have questions regarding anything, contact [me](https://t.me/KnorpelSenf) or join the [discussion group](https://t.me/cloud_convert_bot_lounge).
There's also a [news channel](https://t.me/cloud_convert_bot_news).
