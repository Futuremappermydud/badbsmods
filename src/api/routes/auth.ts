import { Express } from 'express';
import { DiscordAuthHelper, GitHubAuthHelper, validateSession } from '../../shared/AuthHelper';
import { HTTPTools } from '../../shared/HTTPTools';
import { DatabaseHelper } from '../../shared/Database';
import { Logger } from '../../shared/Logger';
import { Config } from '../../shared/Config';

export class AuthRoutes {
    private app: Express;
    private validStates: string[] = [];

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.get(`/api/auth`, async (req, res) => {
            // #swagger.tags = ['Auth']
            let session = await validateSession(req, res, false);
            if (!session.approved) {
                return;
            }
            return res.status(200).send({ message: `Hello, ${session.user.username}!`, username: session.user.username, userId: session.user.id, roles: session.user.roles });
        });

        this.app.get(`/api/auth/logout`, async (req, res) => {
            // #swagger.tags = ['Auth']
            req.session.destroy((err) => {
                if (err) {
                    return res.status(500).send({ error: `Internal server error.` });
                }
                return res.status(200).send(`<head><meta http-equiv="refresh" content="0; url=${Config.server.url}" /></head><body style="background-color: black;"><a style="color:white;" href="${Config.server.url}">Click here if you are not redirected...</a></body>`);
            });
        });

        this.app.get(`/api/auth/github`, async (req, res) => {
            // #swagger.tags = ['Auth']
            let state = HTTPTools.createRandomString(16);
            this.validStates.push(state + req.ip);
            setTimeout(() => {
                this.validStates = this.validStates.filter((s) => s !== state + req.ip);
            }, 1000 * 60 * 3);

            return res.redirect(302, GitHubAuthHelper.getUrl(state));
        });

        this.app.get(`/api/auth/github/callback`, async (req, res) => {
            // #swagger.tags = ['Auth']
            const code = req.query[`code`];
            const state = req.query[`state`];

            if (!code || !state) {
                return res.status(400).send({ error: `Invalid parameters.` });
            }

            if (!this.validStates.includes(state + req.ip)) {
                return res.status(400).send({ error: `Invalid state.` });
            }

            this.validStates = this.validStates.filter((s) => s !== state + req.ip);

            let token = await GitHubAuthHelper.getToken(code.toString());
            if (!token) { return res.status(400).send({ error: `Invalid code.` }); }
            let user = await GitHubAuthHelper.getUser(token.access_token);
            if (!user) { return res.status(500).send({ error: `Internal server error.` }); }

            let userDb = await DatabaseHelper.database.Users.findOne({ where: { githubId: user.id } });
            if (!userDb) {
                userDb = await DatabaseHelper.database.Users.create({
                    username: user.login,
                    githubId: user.id.toString(),
                    roles: {
                        sitewide: [],
                        perGame: {},
                    },
                });

                Logger.log(`User ${user.login} signed up.`, `Auth`);
            }

            req.session.userId = userDb.id;
            req.session.save();

            Logger.log(`User ${userDb.username} logged in.`, `Auth`);
            return res.status(200).send(`<head><meta http-equiv="refresh" content="0; url=${Config.server.url}" /></head><body style="background-color: black;"><a style="color:white;" href="${Config.server.url}">Click here if you are not redirected...</a></body>`); // i need to double check that this is the correct way to redirect
        });

        this.app.get(`/api/link/discord`, async (req, res) => {
            // #swagger.tags = ['Auth']
            let session = await validateSession(req, res, false);
            if (!session.approved) {
                return;
            }

            let state = HTTPTools.createRandomString(16);
            this.validStates.push(state + req.ip);
            setTimeout(() => {
                this.validStates = this.validStates.filter((s) => s !== state + req.ip);
            }, 1000 * 60 * 3);

            return res.redirect(302, DiscordAuthHelper.getUrl(state));
        });

        this.app.get(`/api/link/discord/callback`, async (req, res) => {
            // #swagger.tags = ['Auth']
            let session = await validateSession(req, res, false); // this probably won't work, double check it tho...
            if (!session.approved) {
                return;
            }
            
            const code = req.query[`code`];
            const state = req.query[`state`];

            if (!code || !state) {
                return res.status(400).send({ error: `Invalid parameters.` });
            }
            if (!this.validStates.includes(state + req.ip)) {
                return res.status(400).send({ error: `Invalid state.` });
            }

            this.validStates = this.validStates.filter((s) => s !== state + req.ip);
            let token = await DiscordAuthHelper.getToken(code.toString());
            if (!token) { return res.status(400).send({ error: `Invalid code.` }); }
            let user = await DiscordAuthHelper.getUser(token.access_token);
            if (!user) { return res.status(500).send({ error: `Internal server error.` }); }

            let userDb = await DatabaseHelper.database.Users.findOne({ where: { githubId: session.user.id } });

            if (!userDb) {
                res.status(400).send({ error: `Discord auth suscessfull, however user is not signed in.` });
            } else {
                userDb.discordId = user.id;
                userDb.save();
            }

            Logger.log(`User ${userDb.username} linked their discord.`, `Auth`);
            return res.status(200).send(`<head><meta http-equiv="refresh" content="0; url=${Config.server.url}" /></head><body style="background-color: black;"><a style="color:white;" href="${Config.server.url}">Click here if you are not redirected...</a></body>`); // i need to double check that this is the correct way to redirect
        });
    }
}