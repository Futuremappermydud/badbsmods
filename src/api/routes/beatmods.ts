import { Express, Request, Response } from 'express';
import { Categories, DatabaseHelper, GameVersion, Mod, ModVersion, Platform, SupportedGames, Status } from '../../shared/Database';
import { Logger } from '../../shared/Logger';

export class BeatModsRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    // Yes, I am aware that this is a mess. You can thank swagger-autogen for that. I'm not going to clean it up because it's not really necessary for deprecated endpoints.
    private async loadRoutes() {
        this.app.get(`/api/beatmods/mod`, async (req, res) => {
            // #swagger.tags = ['BeatMods']
            // #swagger.summary = 'Legacy BeatMods API endpoint.'
            // #swagger.description = 'Legacy BeatMods API endpoint. This is available for mod downloaders that have not been updated to use the new API.<br><br>This endpoint does not work the same way as the old BeatMods API, but it should be close enough to work with most mod downloaders.'
            // #swagger.responses[200] = { description: 'Returns all mods.' }
            // #swagger.responses[400] = { description: 'Missing Game Version.' }
            // #swagger.parameters['gameVersion'] = { description: 'The game version as a string (ex. \'1.29.1\', \'1.40.0\').', type: 'string' }
            // #swagger.parameters['status'] = { in: 'query', description: 'The statuses to return. Available statuses are: \`approved\` & \`all\`', format: 'string' }
            // #swagger.deprecated = true
            await this.Api_Beatmods_Mod(req, res);
        });

        this.app.get(`/api/v1/mod`, async (req, res) => {
            // #swagger.tags = ['BeatMods']
            // #swagger.summary = 'Legacy BeatMods API endpoint.'
            // #swagger.description = 'Legacy BeatMods API endpoint. This is available for mod downloaders that have not been updated to use the new API.<br><br>This endpoint does not work the same way as the old BeatMods API, but it should be close enough to work with most mod downloaders.'
            // #swagger.responses[200] = { description: 'Returns all mods.' }
            // #swagger.responses[400] = { description: 'Missing Game Version.' }
            // #swagger.parameters['gameVersion'] = { description: 'The game version as a string (ex. \'1.29.1\', \'1.40.0\').', type: 'string' }
            // #swagger.parameters['status'] = { in: 'query', description: 'The statuses to return. Available statuses are: \`approved\` & \`all\`', format: 'string' }
            // #swagger.deprecated = true
            await this.Api_Beatmods_Mod(req, res);
        });

        this.app.get(`/api/beatmods/versions`, async (req, res) => {
            // #swagger.tags = ['BeatMods']
            // #swagger.summary = 'Legacy BeatMods API Version endpoint.'
            // #swagger.description = 'Legacy BeatMods API endpoint. This is available for mod downloaders that have not been updated to use the new API.<br><br>This endpoint does not work the same way as the old BeatMods API, but it should be close enough to work with most mod downloaders.'
            // #swagger.deprecated = true
            // #swagger.responses[200] = { description: 'Returns all versions.' }
            let versions = DatabaseHelper.cache.gameVersions.filter(gV => gV.gameName == SupportedGames.BeatSaber).flatMap((gameVersion) => gameVersion.version);
            return res.status(200).send(versions);
        });

        this.app.get(`/versions.json`, async (req, res) => {
            // #swagger.tags = ['BeatMods']
            // #swagger.summary = 'Legacy BeatMods API Version endpoint.'
            // #swagger.description = 'Legacy BeatMods API endpoint. This is available for mod downloaders that have not been updated to use the new API.<br><br>This endpoint does not work the same way as the old BeatMods API, but it should be close enough to work with most mod downloaders.'
            // #swagger.deprecated = true
            // #swagger.responses[200] = { description: 'Returns all versions.' }
            let versions = DatabaseHelper.cache.gameVersions.filter(gV => gV.gameName == SupportedGames.BeatSaber).flatMap((gameVersion) => gameVersion.version);
            return res.status(200).send(versions);
        });

        this.app.get(`/api/beatmods/aliases`, async (req, res) => {
            // #swagger.tags = ['BeatMods']
            // #swagger.produces = ['application/json']
            // #swagger.consumes = ['application/json']
            // #swagger.summary = 'Legacy BeatMods API Aliases endpoint.'
            // #swagger.description = 'Legacy BeatMods API endpoint. This is available for mod downloaders that have not been updated to use the new API.<br><br>This endpoint does not work the same way as the old BeatMods API, but it should be close enough to work with most mod downloaders.'
            // #swagger.responses[200] = { description: 'Returns all aliases.' }
            // #swagger.deprecated = true
            let aliases: any = {};
            let versions = DatabaseHelper.cache.gameVersions.filter(gV => gV.gameName == SupportedGames.BeatSaber);
            for (let version of versions) {
                aliases[version.version] = [];
            }
            return res.status(200).send(aliases);
        });

        this.app.get(`/aliases.json`, async (req, res) => {
            // #swagger.tags = ['BeatMods']
            // #swagger.produces = ['application/json']
            // #swagger.consumes = ['application/json']
            // #swagger.summary = 'Legacy BeatMods API Aliases endpoint.'
            // #swagger.description = 'Legacy BeatMods API endpoint. This is available for mod downloaders that have not been updated to use the new API.<br><br>This endpoint does not work the same way as the old BeatMods API, but it should be close enough to work with most mod downloaders.'
            // #swagger.responses[200] = { description: 'Returns all aliases.' }
            // #swagger.deprecated = true
            let aliases: any = {};
            let versions = DatabaseHelper.cache.gameVersions.filter(gV => gV.gameName == SupportedGames.BeatSaber);
            for (let version of versions) {
                aliases[version.version] = [];
            }
            return res.status(200).send(aliases);
        });
    }
    private async Api_Beatmods_Mod(req: Request, res: Response) {
        let version = req.query.gameVersion;
        let status = req.query.status;

        let modArray: BeatModsMod[] = [];

        if (!version || typeof version !== `string`) {
            version = await GameVersion.getDefaultVersion(SupportedGames.BeatSaber);
        }

        let gameVersion = DatabaseHelper.cache.gameVersions.find((gameVersion) => gameVersion.version === version && gameVersion.gameName === SupportedGames.BeatSaber);
        if (!gameVersion) {
            return res.status(400).send({ message: `No valid game version.` });
        }

        let mods = DatabaseHelper.cache.mods.filter((mod) => mod.gameName === SupportedGames.BeatSaber);
        for (let mod of mods) {
            //if (mod.id === 194) {
            //    console.log(mod);
            //}
            if (mod.status !== Status.Verified && (mod.status !== Status.Unverified || status === `approved`)) {
                continue;
            }
            // hardcoded to universal for now, need to fix this
            let modVersion = await mod.getLatestVersion(gameVersion.id, Platform.Universal, status === `approved`);
            if (!modVersion) {
                continue;
            }
            if (modVersion.status !== Status.Verified && (modVersion.status !== Status.Unverified || status === `approved`)) {
                continue;
            }

            modArray.push(await this.convertToBeatmodsMod(mod, modVersion, gameVersion));
        }

        return res.status(200).send(modArray);
    }

    private async convertToBeatmodsMod(mod: Mod, modVersion: ModVersion, gameVersion: GameVersion, doResolution: boolean = true): Promise<BeatModsMod> {
        let dependencies: (BeatModsMod | string)[] = [];

        if (modVersion.dependencies.length !== 0) {
            // fix this eventually
            for (let dependancy of (await modVersion.getDependencies(gameVersion.id, Platform.Universal))) {
                if (doResolution) {
                    let dependancyMod = DatabaseHelper.cache.mods.find((mod) => mod.id === dependancy.modId);
                    if (dependancyMod) {
                        dependencies.push(await this.convertToBeatmodsMod(dependancyMod, dependancy, gameVersion, false));
                    } else {
                        Logger.warn(`Dependancy ${dependancy.id} for mod ${mod.name} v${modVersion.modVersion.raw} was unable to be resolved`, `getMod`); // in theory this should never happen, but i wanna know when it does lol
                    }
                } else {
                    dependencies.push(dependancy.id.toString());
                }
            }
        }

        let author = DatabaseHelper.cache.users.find((user) => user.id === modVersion.authorId);
        let platform = `universal`;
        let status = `private`;
        switch (modVersion.status) {
            case Status.Private:
                status = `declined`;
                break;
            case Status.Unverified:
                status = `pending`;
                break;
            case Status.Verified:
                status = `approved`;
                break;
            case Status.Removed:
                status = `declined`;
                break;
            default:
                status = `declined`;
                break;
        }
        switch (modVersion.platform) {
            case Platform.Universal:
                platform = `universal`;
                break;
            case Platform.Oculus:
                platform = `oculus`;
                break;
            case Platform.Steam:
                platform = `steam`;
                break;
            default:
                platform = `universal`;
                break;
        }

        return {
            _id: modVersion.id.toString(),
            name: mod.name.toString(),
            version: modVersion.modVersion.raw,
            gameVersion: gameVersion.version,
            authorId: author.id.toString(),
            updatedDate: modVersion.updatedAt.toUTCString(),
            uploadDate: modVersion.createdAt.toUTCString(),
            author: doResolution ? {
                _id: author.id.toString(),
                username: author.username.toString(),
                lastLogin: author.createdAt.toString(),
            } : undefined,
            status: status,
            description: mod.description,
            link: mod.gitUrl,
            category: mod.category.charAt(0).toUpperCase() + mod.category.slice(1),
            downloads: [{
                type: platform,
                url: `/cdn/mod/${modVersion.zipHash}.zip`, //tbd
                hashMd5: modVersion.contentHashes.map((hash) => {
                    return {
                        hash: hash.hash,
                        file: hash.path
                    };
                })
            }],
            dependencies: doResolution ? dependencies as BeatModsMod[] : dependencies as string[],
            required: (mod.category === Categories.Core),
        };
    }
}

export type BeatModsMod = {
    name: string,
    version: string,
    gameVersion: string,
    authorId: string,
    author: {
        _id: string,
        username: string,
        lastLogin: string,
    } | undefined,
    uploadDate: string,
    updatedDate: string,
    status: string,
    description: string,
    link: string,
    category: string,
    required: boolean,
    downloads: {
        type: string,
        url: string,
        hashMd5: {
            hash: string,
            file: string,
        }[],
    }[],
    dependencies: BeatModsMod[] | string[],
    _id: string,
}