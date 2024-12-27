import { randomInt } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// This is a simple config loader that reads from a JSON file and maps the values to a static class. It's a little excessive but this way the config is clearly communicated, and is available without a refrence to the file itself.
const DEFAULT_CONFIG = {
    auth: {
        discord: {
            clientId: `DISCORD_CLIENT_ID`,
            clientSecret: `DISCORD_CLIENT_SECRET`
        },
        github: {
            clientId: `GITHUB_CLIENT_ID`,
            clientSecret: `GITHUB_CLIENT_SECRET`
        }
    },
    database: {
        dialect: `sqlite`,
        url: `./storage/database.sqlite`,
        username: `user`,
        password: `password`,
        alter: false
    },
    storage: {
        modsDir: `./storage/uploads`,
        iconsDir: `./storage/icons`
    },
    devmode: false,
    authBypass: false,
    server: {
        port: 5001,
        url: `http://localhost:5001`,
        sessionSecret: `supersecret`,
        iHateSecurity: false,
        corsOrigins: `*`
    },
    webhooks: {
        enableWebhooks: false,
        enablePublicWebhook: true,
        loggingUrl: `http://localhost:5001/webhooks/logging`,
        modLogUrl: `http://localhost:5001/webhooks/modlog`,
        publicUrl: `http://localhost:5001/webhooks/public`
    },
    bot: {
        enabled: false,
        clientId: `BOT_CLIENT_ID`,
        token: `BOT_TOKEN`
    }
};


export class Config {
    // #region Private Static Properties
    private static _auth: {
        discord: AuthServiceConfig;
        github: AuthServiceConfig;
    } = DEFAULT_CONFIG.auth;
    private static _database: {
        dialect: string;
        url: string;
        username: string;
        password: string;
        alter: boolean;
    } = DEFAULT_CONFIG.database;
    private static _storage: {
        modsDir: string;
        iconsDir: string;
    } = DEFAULT_CONFIG.storage;
    private static _server: {
        port: number;
        url: string;
        sessionSecret: string;
        iHateSecurity: boolean;
        corsOrigins: string | string[];
    } = DEFAULT_CONFIG.server;
    private static _devmode: boolean = DEFAULT_CONFIG.devmode;
    private static _authBypass: boolean = DEFAULT_CONFIG.authBypass;
    private static _webhooks: {
        enableWebhooks: boolean;
        enablePublicWebhook: boolean;
        loggingUrl: string;
        modLogUrl: string;
        publicUrl: string;
    } = DEFAULT_CONFIG.webhooks;
    private static _bot: {
        enabled: boolean;
        clientId: string;
        token: string;
    } = DEFAULT_CONFIG.bot;
    // #endregion
    // #region Public Static Properties
    public static get auth() {
        return this._auth;
    }
    public static get database() {
        return this._database;
    }
    public static get storage() {
        return this._storage;
    }
    public static get server() {
        return this._server;
    }
    public static get devmode() {
        return this._devmode;
    }
    public static get authBypass() {
        return this._authBypass;
    }
    public static get webhooks() {
        return this._webhooks;
    }
    public static get bot() {
        return this._bot;
    }
    // #endregion
    constructor() {
        let success = Config.loadConfig();
        if (!success) {
            if (!fs.existsSync(path.resolve(`./storage`))) {
                fs.mkdirSync(path.resolve(`./storage`));
            }

            if (fs.existsSync(path.resolve(`./storage/config.json`))) {
                let generateedId = randomInt(100000, 999999);
                if (fs.existsSync(path.resolve(`./storage/config.json-${generateedId}.bak`))) {
                    generateedId = randomInt(100000, 999999);
                    if (fs.existsSync(path.resolve(`./storage/config.json-${generateedId}.bak`))) {
                        fs.unlinkSync(path.resolve(`./storage/config.json-${generateedId}.bak`));
                    }
                }
                fs.renameSync(path.resolve(`./storage/config.json`), path.resolve(`./storage/config.json-${generateedId}.bak`));
                console.warn(`Config file was invalid. A new one has been created. The old one has been backed up.`);
                fs.writeFileSync(path.resolve(`./storage/config.json`), JSON.stringify(DEFAULT_CONFIG, null, 2));
            } else {
                console.warn(`Config file not found. A new one has been created.`);
                fs.writeFileSync(path.resolve(`./storage/config.json`), JSON.stringify(DEFAULT_CONFIG, null, 2));
            }

            let successpart2 = Config.loadConfig();
            if (!successpart2) {
                console.error(`Config file is invalid. Please check the config file and try again.`);
                process.exit(1);
            }
        }

        if (!fs.existsSync(path.resolve(Config.storage.modsDir))) {
            fs.mkdirSync(path.resolve(Config.storage.modsDir));
        }

        if (!fs.existsSync(path.resolve(Config.storage.iconsDir))) {
            fs.mkdirSync(path.resolve(Config.storage.iconsDir));
        }
    }

    private static loadConfig() {
        console.log(`Loading config file from ${path.resolve(`./storage/config.json`)}`);
        if (fs.existsSync(path.resolve(`./storage/config.json`))) {
            let file = fs.readFileSync(path.resolve(`./storage/config.json`), `utf8`);
            let cf = JSON.parse(file);
            let success = true;
            try {
                if (`auth` in cf) {
                    Config._auth = cf.auth;
                } else {
                    success = false;
                }

                if (`database` in cf) {
                    Config._database = cf.database;
                } else {
                    success = false;
                }

                if (`storage` in cf) {
                    Config._storage = cf.storage;
                } else {
                    success = false;
                }

                if (`server` in cf) {
                    Config._server = cf.server;
                } else {
                    success = false;
                }

                if (`devmode` in cf) {
                    Config._devmode = cf.devmode;
                } else {
                    success = false;
                }

                if (`authBypass` in cf) {
                    Config._authBypass = cf.authBypass;
                } else {
                    success = false;
                }

                if (`webhooks` in cf) {
                    Config._webhooks = cf.webhooks;
                } else {
                    success = false;
                }

                if (`bot` in cf) {
                    Config._bot = cf.bot;
                } else {
                    success = false;
                }
                return success;
            } catch (e) {
                console.error(`Error parsing config file: ${e}`);
                return false;
            }
        } else {
            console.warn(`Config file not found.`);
            return false;
        }
    }
}

interface AuthServiceConfig {
    clientId: string;
    clientSecret: string;
}