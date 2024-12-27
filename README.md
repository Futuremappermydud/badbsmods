![BadBSMods](https://github.com/Saeraphinx/badbsmods/blob/main/assets/banner.png)
A game-agnostic BeatMods replacement.

## Running the Server
Running the server is (mostly) easy to do:
1. Clone the Repo.
2. Create a folder called `storage` in the same folder as the `src` folder.
3. Create a `config.json` file (using the config below) in the `storage` directory and fill in the values.
4. Create the directories for mod uploads & mod icons. The defaults are assuming a `storage/uploads` and an `storage/icons` folder exist.
5. Run `npm i` to install packages.
6. Run `npm run start` to start the server.

## Config: 
```json
{
    "auth": {
        "discord": {
            "clientId": "id",
            "clientSecret": "secret"
        },
        "github": {
            "clientId": "idfk",
            "clientSecret": "idfk"
        }
    },
    "database": {
        "dialect": "sqlite",
        "url": "./storage/database.sqlite",
        "username": "user",
        "password": "password",
        "alter": true
    },
    "storage" : {
        "modsDir" : "./storage/uploads",
        "iconsDir" : "./storage/icons"
    },
    "devmode" : true,
    "authBypass" : true,
    "server" : {
        "port" : 5001,
        "url" : "http://localhost:5001",
        "sessionSecret" : "supersecret",
        "iHateSecurity" : false,
        "corsOrigins": "*"
    },
    "webhooks": {
        "enableWebhooks": true,
        "enablePublicWebhook": false,
        "loggingUrl": "url",
        "modLogUrl": "url",
        "publicUrl" : "url"
    },
    "bot": {
        "enabled": true,
        "clientId": "clientid",
        "token": "token"
    }
}
```

Auth: OAuth2 Info  
Database: Supports `sqlite` and `postgres`. URL can be replaced with a postgres URL.  
Storage: Paths for user uploads  
devmode: Enables additional logging  
authBypass: Authenticates every request as the built in Server Admin  
Server: Hosting info. URL is a url without the `/` at the end. Used for Swagger and OAuth2 redirects.  
Webooks: For logging & approval webhook  
Bot: Discord bot for looking up mods and other mayybe fun things
