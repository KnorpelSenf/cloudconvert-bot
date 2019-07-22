module.exports.helpmsgPrivate = '<b>Hi there!</b>\nI can help you with file conversions!\n\
<b>TL;DR</b>: Just send me your file to convert. /help\n\n\
I support 218 different file formats and I know how to handle media of any kind (<i>audio \
files, documents, photos, stickers, videos, voice notes and video notes</i>).\n\n\
<b>I will do all of this for free.</b> However, I cannot provide an unlimited number of \
conversions every day without anyone being charged for that.\nIf you just need to convert that one \
file, you do not need to worry about this, that should work right out of the box. If you \
need to convert A LOT OF files, please consider <i>setting up an account</i> \
(see /the_more_the_merrier). It is very important, otherwise this bot would not work. Also, send \
/limitations to find out about the limitations this bot has.\n\n\
You can add this bot to a group chat, too! I support automatic file conversions! However, you \
should definitely set up an account before you do <i>that</i>, that\'d be great!';

module.exports.helpmsgStartGroups = '<b>Hi there!</b>\nMy name is Cloud Convert Bot and I can help \
you with file conversions! Type /help for a quick intro. Don\'t forget to set up your account: \
/the_more_the_merrier';

module.exports.helpmsgGroups = '<b>Hi there!</b>\nMy name is Cloud Convert Bot and I can help \
you with file conversions!\nI will not spam you with any messages or any converted \
files (unless you ask nicely). There is two ways to tell me that I should convert a \
file for you:\n  1) <i>Reply</i> to a file someone sends. Reply with the target format \
directly (e. g. /mp4) or send /convert to see possible formats. I will use the most \
recent file if you do not hit reply for any message.\n  2) <i>Send a caption</i> when \
you send the file, e. g. /mp4 to convert to MP4.\n\nOnce the conversion is completed, \
you can enable <b>auto-conversions</b>. If you enable auto-conversions for a file type, \
I will automatically repeat this conversion for all files of the same type.\n\n\
<b>The most awesome feature</b> is that you can set up your own account. This bot can \
work for some time without an account, but if you use the bot regularly, setting up an \
account <i>is really important</i> because you can get waaay more free conversions like \
that. Set it up with /the_more_the_merrier. This way, you can avoid some /limitations.';

module.exports.helpmsgLimitations = 'Currently there is <b>two limitations</b>. First: you can only convert \
a few files a day. Second: you can only convert files up a certain size.\n\nBecause all users \
of this bot share a common pool of 25 conversions per day (check the balance with /balance), you \
cannot convert more than 25 files per day. <b>The good thing</b> is: you simply need to set up \
an account and BOOM this limit is gone! See /the_more_the_merrier for that!\n\nTelegram does not \
allow bots (like me) to download files with more than 20 MB in size or upload files with more \
than 50 MB in size. This limit cannot be changed. If you need to convert larger files, you could \
visit cloudconvert.com. Sorry!';

module.exports.helpmsgSetUpAccount = 'All users of this bot share a common pool of 25 conversions per day. \
You can check the balance with /balance.\n\n\
Why restrict yourself? You can <b>claim your own extra 25 free conversions per day</b>! \
No one else will be able to impact this counter. You will not have to pay anything for this \
and it works entirely without witchcraft. All you need to do is to follow these three steps:\n\
<b>1)</b> Create your own Cloud Convert account <a href="https://cloudconvert.com/register">here</a>.\n\
<b>2)</b> Visit the <a href="https://cloudconvert.com/dashboard/api/v1/keys">dashboard</a> and copy the API key.\n\
<b>3)</b> Get back to this chat and send /apikey. Paste the API key into this chat.\n\
Now every single operation of this bot will work based on your new Cloud Convert account! \
Resetting the bot with /start clears the API key from the database. This will return you to \
the account shared among all bot users.\n\nBy providing an API key, you help contributing to the \
bot by taking load off the shared account. That\'s why you will receive an extra gift (like \
getting more free conversions wasn\'t enough!). Once you provided your API key, I will tell \
you the name of a secret bot command to find out even more about the files you send me.\n\n\
Please note that this bot or its dev is in no way associated with cloudconvert.com. They just \
offer free file conversions and they have a neat way to connect bots to that service. They\'re \
based in Munich and you do not need to worry about privacy concerns or ads or "we miss you" \
bullshit. Remeber that connecting your own account to this bot is very important for this bot \
to function.';

module.exports.helpmsgBalanceWithApiKey = 'Yay! You have connected your personal Cloud Convert account with \
this bot! Thank you! You can check its balance with /balance.\n\n\
You connected this bot by providing the following API key (thanks!):';

module.exports.validatingApiKey = 'Validating ...';

module.exports.cannotSetApiKey = 'This API key does not seem to be valid! Did you follow the steps under \
/the_more_the_merrier?';

module.exports.helpmsgBuyMinutes = 'If you need to perform even more conversions, you can buy conversion minutes \
at www.cloudconvert.com. This bot will automatically use them if available. However, please remember \
that this project was created by a single student at Kiel University. Even though I did my best \
to keep this piece of software free of errors and as reliable as possible, I cannot guarantee that \
this bot is <i>not accidentally consuming all of your conversion minutes</i>, killing your kitten or \
the like. It has never happened so far and I consider it highly unlikely, but it is still software, \
so you never know. If you know JavaScript, you can check out the \
<a href="https://github.com/KnorpelSenf/cloudconvert-bot">source code</a> \
to verify that something as bad as this won\'t ever happen.';

module.exports.helpmsgAddedToGroup = '<b>Hi!</b>\nHit /help for a quick intro. Contact @KnorpelSenf for \
questions. And don\'t forget to set up an account! /the_more_the_merrier';

module.exports.autoConversionSaved = 'Saved.';

module.exports.remainingConversions = 'Remaining conversions';

module.exports.customApiKeyInstruction = 'Need to perform more conversions? /the_more_the_merrier';

module.exports.helpmsgFeedback = 'Like this bot? Hit this link and rate it!\n\
https://telegram.me/storebot?start=cloud_convert_bot';

module.exports.sendApiKey = 'Perfect! Now send me the API key!';

module.exports.helpmsgInfo = 'Use this command in reply to a file! \
I will then tell you all file information (meta data) I know.';

module.exports.helpmsgConvert = 'Use this command in reply to a file! \
I will then list all possible conversions for that.';

module.exports.helpmsgFile = 'Alright, now send me a file to be converted to ';

module.exports.cancelOperation = 'Cancel operation';

module.exports.operationCancelled = 'Operation cancelled.';

module.exports.helpmsgText = 'Send me a file to convert it!';

module.exports.apiKeyProvided = 'Thank you for providing the API key! Your own account is now ready \
and set up. By no longer relying on the default account, you help making the bot more useful \
for everyone out there!\n\nI promised to unveil a hidden bot command, and I like to keep \
promises! Here we go: whenever you provided a file, send /info to get detailed information \
about your files. Beware, a lot of things are pretty technical there, but there\'s also a \
bunch of cool facts you probably didn\'t know. How awesome is that?! Check it out!';

module.exports.unsupportedConversion = 'This conversion is not supported!';
module.exports.conversionError = 'The conversion could not be performed. See the details below.';
module.exports.unknownError = 'Something went wrong. Sorry for that. You may contact \
@KnorpelSenf because of this.';
module.exports.unknownErrorPerhaps = 'Internal error. Did your conversion go well? If not, do not hesitate to contact @KnorpelSenf.'

module.exports.invalidApiKey = 'Your API key is invalid! Use /apikey to set a new key. Restarting \
the bot with /start clears the API key and returns you to using the account shared among \
all bot users.\n\nThis is the invalid API key you provided:\n';

module.exports.noMoreConversionMinutes = 'It looks like there is no free conversions remaining! \
Check /balance!\n\nYou will automatically be provided with 25 more free conversions \
within the next 24 hours. If you don\'t want to wait, can convert your file right now. \
You just need to follow the steps under /the_more_the_merrier.';