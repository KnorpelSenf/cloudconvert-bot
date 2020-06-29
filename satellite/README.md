# Satellite of bot

This part of the project acts as a relay server between Telegram and cloudconvert.
It contains a flask server that exposes two endpoints: one for transferring a file from Telegram to cloudconvert and one to do the opposite.
As this server can be run independently, it can be hostet on a platform where data egress and ingress are cheap.
