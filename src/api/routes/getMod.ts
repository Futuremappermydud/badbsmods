import { Express } from 'express';
import { DatabaseHelper, SupportedGames, Status, ModAPIResponse } from '../../shared/Database';
import { HTTPTools } from '../../shared/HTTPTools';

export class GetModRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.get(`/api/mods`, async (req, res) => {
            // #swagger.tags = ['Mods']
            // #swagger.summary = 'Get all mods for a specified version.'
            // #swagger.description = 'Get all mods.<br><br>If gameName is not provided, it will default to Beat Saber.<br>If gameVersion is not provided, it will default to whatever is set as the lastest version for the selected game.'
            // #swagger.responses[200] = { description: 'Returns all mods.' }
            // #swagger.responses[400] = { description: 'Invalid gameVersion.' }
            // #swagger.parameters['gameName'] = { description: 'The game name.', type: 'string' }
            // #swagger.parameters['gameVersion'] = { description: 'The game version (ex. \'1.29.1\', \'1.40.0\').', type: 'string' }
            // #swagger.parameters['status'] = { description: 'The status of the mod. Available status are: \'verified\'. Typing anything other than that will show you unverified mods too.', type: 'string' }
            // #swagger.parameters['platform'] = { description: 'The platform of the mod. Available platforms are: \'oculuspc\', \'universalpc\', \'steampc\'', type: 'string' }
            let gameName = req.query.gameName;
            let gameVersion = req.query.gameVersion;
            let status = req.query.status;
            let platform = req.query.platform;

            let filteredGameName = (gameName && HTTPTools.validateStringParameter(gameName) && DatabaseHelper.isValidGameName(gameName)) ? gameName : SupportedGames.BeatSaber;
            let filteredGameVersion = gameVersion && HTTPTools.validateStringParameter(gameVersion) && DatabaseHelper.isValidGameVersion(filteredGameName, gameVersion) ? gameVersion : null;
            if (filteredGameVersion === null) {
                return res.status(400).send({ message: `Invalid gameVersion.` });
            }
            let filteredPlatform = (platform && HTTPTools.validateStringParameter(platform) && DatabaseHelper.isValidPlatform(platform)) ? platform : undefined;
            let onlyApproved = status === `verified`;

            if (gameVersion && HTTPTools.validateStringParameter(gameVersion) && !DatabaseHelper.isValidGameVersion(filteredGameName, gameVersion)) {
                return res.status(400).send({ message: `Invalid gameVersion.` });
            }
            
            let mods:{mod: ModAPIResponse, latest: any}[] = [];
            for (let mod of DatabaseHelper.cache.mods) {
                //if (mod.id === 96) {
                //    console.log(mod);
                //}
                if (mod.gameName !== filteredGameName) {
                    continue;
                }

                // uses the same check as the old beatmods api down below
                if (mod.status != Status.Verified && (mod.status != Status.Unverified || onlyApproved)) {
                    continue;
                }

                let gameVersion = DatabaseHelper.cache.gameVersions.find((gameVersion) => gameVersion.version === filteredGameVersion && gameVersion.gameName === filteredGameName);
                if (!gameVersion) {
                    return res.status(400).send({ message: `Invalid game version.` });
                }
                let latest = await mod.getLatestVersion(gameVersion.id, filteredPlatform, onlyApproved);
                if (latest) {
                    // if the modVersion isn't verified or unverified, don't show it
                    if (latest.status != Status.Unverified && latest.status != Status.Verified) {
                        continue;
                    }
                    mods.push({ mod: mod.toAPIResponse(), latest: await latest.toAPIResonse(gameVersion.id, filteredPlatform, onlyApproved)});
                }
            }

            return res.status(200).send({ mods });
        });

        this.app.get(`/api/mods/:modIdParam`, async (req, res) => {
            // #swagger.tags = ['Mods']
            // #swagger.summary = 'Get a specific mod by ID.'
            // #swagger.description = 'Get a specific mod by ID. This will also return every version of the mod.'
            // #swagger.responses[200] = { description: 'Returns the mod.' }
            // #swagger.responses[400] = { description: 'Invalid mod id.' }
            // #swagger.responses[404] = { description: 'Mod not found.' }
            // #swagger.parameters['modIdParam'] = { in: 'path', description: 'The mod ID.', type: 'number', required: true }
            // #swagger.parameters['raw'] = { description: 'Return the raw mod info.', type: 'boolean' }
            let modId = parseInt(req.params.modIdParam);
            let raw = req.query.raw === `true` ? true : false;
            if (!modId) {
                return res.status(400).send({ message: `Invalid mod id.` });
            }

            let mod = DatabaseHelper.cache.mods.find((mod) => mod.id === modId);
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (mod.status != Status.Unverified && mod.status != Status.Verified) {
                return res.status(404).send({ message: `Mod not found.` });
            }
            let modVersions = DatabaseHelper.cache.modVersions.filter((modVersion) => modVersion.modId === mod.id);
            let returnVal: any[] = [];

            for (let version of (modVersions)) {
                if (version.status != Status.Unverified && version.status != Status.Verified) {
                    continue;
                }
                if (raw) {
                    returnVal.push(await version.toRawAPIResonse());
                } else {
                    returnVal.push(await version.toAPIResonse());
                }
            }

            return res.status(200).send({ mod: { info: raw ? mod : mod.toAPIResponse(), versions: returnVal } });
        });

        this.app.get(`/api/modversions/:modVersionIdParam`, async (req, res) => {
            // #swagger.tags = ['Mods']
            // #swagger.summary = 'Get a specific mod version by ID.'
            // #swagger.description = 'Get a specific mod version by ID.'
            // #swagger.responses[200] = { description: 'Returns the mod version.' }
            // #swagger.responses[400] = { description: 'Invalid mod version id.' }
            // #swagger.responses[404] = { description: 'Mod version not found.' }
            // #swagger.parameters['modVersionIdParam'] = { in: 'path', description: 'The mod version ID.', type: 'number', required: true }
            // #swagger.parameters['raw'] = { description: 'Return the raw mod depedendcies without attempting to resolve them.', type: 'boolean' }
            let modVersionId = parseInt(req.params.modVersionIdParam);
            let raw = req.query.raw;
            if (!modVersionId) {
                return res.status(400).send({ message: `Invalid mod version id.` });
            }

            let modVersion = DatabaseHelper.cache.modVersions.find((modVersion) => modVersion.id === modVersionId);
            if (!modVersion) {
                return res.status(404).send({ message: `Mod version not found.` });
            }

            if (modVersion.status != Status.Unverified && modVersion.status != Status.Verified) {
                return res.status(404).send({ message: `Mod version not found.` });
            }

            if (raw === `true`) {
                return res.status(200).send({ modVersion: await modVersion.toRawAPIResonse() });
            } else {
                return res.status(200).send({ modVersion: await modVersion.toAPIResonse() });
            }
        });

        this.app.get(`/api/hashlookup`, async (req, res) => {
            // #swagger.tags = ['Mods']
            // #swagger.summary = 'Show a mod that has a file with the specified hash.'
            // #swagger.description = 'Show a mod that has a file with the specified hash. This is useful for finding the mod that a file belongs to.'
            // #swagger.responses[200] = { description: 'Returns the mod.' }
            // #swagger.responses[400] = { description: 'Missing hash.' }
            // #swagger.responses[404] = { description: 'Hash not found.' }
            // #swagger.parameters['hash'] = { description: 'The hash to look up.', type: 'string', required: true }
            let hash = req.query.hash;
            if (!hash) {
                return res.status(400).send({ message: `Missing hash.` });
            }

            for (let version of DatabaseHelper.cache.modVersions) {
                if (version.zipHash === hash) {
                    return res.status(200).send({ mod: version.modId });
                }
                for (let fileHash of version.contentHashes) {
                    if (fileHash.hash === hash) {
                        return res.status(200).send({ mod: version.modId });
                    }
                }
            }
            return res.status(404).send({ message: `Hash not founds.` });
        });
    }
}