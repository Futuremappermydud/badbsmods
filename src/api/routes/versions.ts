import { Express } from 'express';
import { DatabaseHelper, GameVersion, SupportedGames, UserRoles } from '../../shared/Database';
import { HTTPTools } from '../../shared/HTTPTools';
import { validateSession } from '../../shared/AuthHelper';
import { Logger } from '../../shared/Logger';

export class VersionsRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.get(`/api/games`, async (req, res) => {
            // #swagger.tags = ['Versions']
            const deduplicatedArray = Array.from(new Set(DatabaseHelper.cache.gameVersions.map(a => a.gameName)));
            let games = [];
            for (let gameName of deduplicatedArray) {
                games.push({ gameName, default: DatabaseHelper.cache.gameVersions.find(v => v.gameName === gameName && v.defaultVersion === true) });
            }
            return res.status(200).send({ games });
        });

        this.app.get(`/api/versions`, async (req, res) => {
            // #swagger.tags = ['Versions']
            let gameName = req.query.gameName && HTTPTools.validateStringParameter(req.query.gameName) && DatabaseHelper.isValidGameName(req.query.gameName) ? req.query.gameName : undefined;
            
            let versions;
            if (gameName) {
                versions = DatabaseHelper.cache.gameVersions.filter(v => v.gameName === gameName);
            } else {
                versions = DatabaseHelper.cache.gameVersions;
            }

            return res.status(200).send({ versions });
        });

        this.app.post(`/api/versions`, async (req, res) => {
            // #swagger.tags = ['Versions']
            let version = req.body.version;
            let gameName = req.body.gameName;
        
            if (!version || !gameName || version.length === 0 || !DatabaseHelper.isValidGameName(gameName)) {
                return res.status(400).send({ message: `Missing version and gameName.` });
            }
        
            let session = await validateSession(req, res, UserRoles.Admin, gameName);
            if (!session.approved) {
                return;
            }
        
            let versions = await DatabaseHelper.database.GameVersions.findAll({ where: { version: version, gameName: gameName } });
            if (versions.length > 0) {
                return res.status(409).send({ message: `Version already exists.` });
            }
        
            DatabaseHelper.database.GameVersions.create({
                gameName: gameName,
                version: version
            }).then((version) => {
                Logger.log(`Version ${version} added by ${session.user.username}.`);
                return res.status(200).send({ version });
            }).catch((error) => {
                Logger.error(`Error creating version: ${error}`);
                return res.status(500).send({ message: `Error creating version: ${error}` });
            });
        });

        this.app.get(`/api/versions/default`, async (req, res) => {
            // #swagger.tags = ['Versions']
            let gameName = req.query.gameName && HTTPTools.validateStringParameter(req.query.gameName) && DatabaseHelper.isValidGameName(req.query.gameName) ? req.query.gameName : SupportedGames.BeatSaber;
            
            let defaultVersion = await GameVersion.getDefaultVersionObject(gameName);

            return res.status(200).send({ defaultVersion });
        });

        this.app.post(`/api/versions/default`, async (req, res) => {
            // #swagger.tags = ['Versions']
            // #swagger.parameters['gameVersionId'] = { description: 'The ID of the version to set as default', type: 'number' }
            let gameVersionId = req.body.gameVersionId;

            if (!gameVersionId || !HTTPTools.validateNumberParameter(gameVersionId)) {
                return res.status(400).send({ message: `Invalid gameVersionId` });
            }

            let gameVersion = await DatabaseHelper.database.GameVersions.findOne({ where: { id: gameVersionId } });
            if (!gameVersion) {
                return res.status(404).send({ message: `GameVersion not found` });
            }

            let session = validateSession(req, res, UserRoles.Admin, gameVersion.gameName);
            if (!session) {
                return;
            }

            let previousDefault = await GameVersion.getDefaultVersionObject(gameVersion.gameName);

            previousDefault.defaultVersion = false;
            await previousDefault.save();
            gameVersion.defaultVersion = true;
            await gameVersion.save();
            DatabaseHelper.refreshCache(`gameVersions`);
            return res.status(200).send({ message: `Default version set`, gameVersion, previousDefault });
        });
    }
}