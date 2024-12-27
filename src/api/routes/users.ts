import { Express } from 'express';
import { DatabaseHelper, GameVersion, ModAPIResponse, Status, User } from '../../shared/Database';
import { HTTPTools } from '../../shared/HTTPTools';
import { validateSession } from '../../shared/AuthHelper';
import { Validator } from '../../shared/Validator';

export class UserRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.get(`/api/user`, async (req, res) => {
            // #swagger.tags = ['User']
            // #swagger.summary = 'Get user information.'
            // #swagger.description = 'Get user information.'
            // #swagger.responses[200] = { description: 'Returns user information.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[500] = { description: 'Internal server error.' }
            let session = await validateSession(req, res, false);
            if (session.approved === false) {
                return res.status(401).send({ error: `Unauthorized.` });
            } else {
                return res.status(200).send({ message: `Hello, ${session.user.username}!`, username: session.user.username, userId: session.user.id, roles: session.user.roles });
            }
        });

        this.app.get(`/api/user/:id`, async (req, res) => {
            // #swagger.tags = ['User']
            // #swagger.summary = 'Get user information.'
            // #swagger.description = 'Get user information.'
            // #swagger.parameters['id'] = { description: 'User ID.', type: 'number' }
            // #swagger.responses[200] = { description: 'Returns user information.' }
            // #swagger.responses[404] = { description: 'User not found.' }
            // #swagger.responses[400] = { description: 'Invalid parameters.' }
            if (!HTTPTools.validateNumberParameter(req.params.id)) {
                return res.status(400).send({ error: `Invalid parameters.` });
            }

            let id = HTTPTools.parseNumberParameter(req.params.id);
            let user = DatabaseHelper.cache.users.find((u) => u.id === id);
            if (user) {
                return res.status(200).send({ user: user.toAPIResponse() });
            } else {
                return res.status(404).send({ error: `User not found.` });
            }
        });

        this.app.get(`/api/user/:id/mods`, async (req, res) => {
            // #swagger.tags = ['User']
            // #swagger.summary = 'Get user information.'
            // #swagger.description = 'Get user information.'
            // #swagger.parameters['id'] = { description: 'User ID.', type: 'number' }
            // #swagger.parameters['status'] = { description: 'Status of the mod.', type: 'string' }
            // #swagger.parameters['platform'] = { description: 'Platform of the mod.', type: 'string' }
            // #swagger.responses[200] = { description: 'Returns mods.' }
            // #swagger.responses[404] = { description: 'User not found.' }
            // #swagger.responses[400] = { description: 'Invalid parameters.' }
            let status = Validator.zStatus.default(Status.Verified).safeParse(req.query.status);
            let platform = req.query.platform;
            let filteredPlatform = (platform && HTTPTools.validateStringParameter(platform) && DatabaseHelper.isValidPlatform(platform)) ? platform : undefined;
            if (!HTTPTools.validateNumberParameter(req.params.id)) {
                return res.status(400).send({ error: `Invalid parameters.` });
            }

            if (!status.success) {
                return res.status(400).send({ error: `Invalid parameters.` });
            }

            let onlyApproved = status.data === Status.Verified;

            let id = HTTPTools.parseNumberParameter(req.params.id);
            let user = DatabaseHelper.cache.users.find((u) => u.id === id);
            if (user) {
                let mods: {mod: ModAPIResponse, latest: any }[] = [];
                for (let mod of DatabaseHelper.cache.mods) {
                    if (mod.status !== status.data) {
                        continue;
                    }
                    if (!mod.authorIds.includes(id)) {
                        continue;
                    }
                    let latest = await mod.getLatestVersion((await GameVersion.getDefaultVersionObject(mod.gameName)).id, filteredPlatform, onlyApproved);
                    if (latest) {
                        mods.push({mod: mod.toAPIResponse(), latest: latest});
                    } else {
                        mods.push({mod: mod.toAPIResponse(), latest: null});
                    }
                }
                return res.status(200).send({ mods: mods });
            } else {
                return res.status(404).send({ error: `User not found.` });
            }
        });

        this.app.patch(`/api/user/:id/`, async (req, res) => {
            // #swagger.tags = ['User']
            // #swagger.summary = 'Get user information.'
            // #swagger.description = 'Get user information.'
            // #swagger.responses[200] = { description: 'Returns user information.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[500] = { description: 'Internal server error.' }
            let displayName = req.body.displayName;
            let sponsorUrl = req.body.sponsorUrl;
            let bio = req.body.bio;
            const session = await validateSession(req, res, true);
            if (!session) {
                return;
            }

            if (!HTTPTools.validateNumberParameter(req.params.id)) {
                return res.status(400).send({ error: `Invalid parameters.` });
            }
            let id = HTTPTools.parseNumberParameter(req.params.id);
            let user = await editUser(id, displayName, sponsorUrl, bio);
            if (user === `usererror`) {
                return res.status(400).send({ error: `Invalid parameters.` });
            }
            return res.status(200).send({ user: user.toAPIResponse() });
        });
    }
}

async function editUser(userId: number, displayName: any, sponsorUrl:any, bio:any): Promise<User|`usererror`> {
    if (userId === undefined || (displayName === undefined && sponsorUrl === undefined && bio === undefined)) {
        return `usererror`;
    }

    let user = await DatabaseHelper.database.Users.findByPk(userId);

    if (!user) {
        return `usererror`;
    }

    if (displayName && HTTPTools.validateStringParameter(displayName, 3, 32)) {
        user.displayName = displayName;
    }

    if (sponsorUrl && HTTPTools.validateStringParameter(sponsorUrl, 3, 256)) {
        user.sponsorUrl = sponsorUrl;
    }

    if (bio && HTTPTools.validateStringParameter(bio, 0, 2048)) {
        user.bio = bio;
    }

    await user.save();
    return user;
}