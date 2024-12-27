import { Express } from 'express';
import path from 'node:path';
import { DatabaseHelper, ContentHash, Status } from '../../shared/Database';
import JSZip, { file } from 'jszip';
import crypto from 'crypto';
import { validateSession } from '../../shared/AuthHelper';
import { Config } from '../../shared/Config';
import { HTTPTools } from '../../shared/HTTPTools';
import { Logger } from '../../shared/Logger';
import { SemVer } from 'semver';
import { Op } from 'sequelize';
import { Validator } from '../../shared/Validator';

export class CreateModRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.post(`/api/mods/create`, async (req, res) => {
            // #swagger.tags = ['Mods']
            let session = await validateSession(req, res, true);
            if (!session.approved) {
                return;
            }

            let reqBody = Validator.zCreateMod.safeParse(req.body);
            let icon = req.files?.icon;

            if (!reqBody.success) {
                return res.status(400).send({ message: `Invalid parameters.`, errors: reqBody.error.issues });
            }

            if (!icon || Array.isArray(icon) || icon.size > 8 * 1024 * 1024) {
                return res.status(413).send({ error: `Invalid file (Might be too large, 8MB max.)` });
            }
            
            let isAcceptableImage = (icon.mimetype === `image/png` && icon.name.endsWith(`.png`)) || (icon.mimetype === `image/jpeg` && (icon.name.endsWith(`.jpeg`) || icon.name.endsWith(`.jpg`)) || (icon.mimetype === `image/webp` && icon.name.endsWith(`.webp`)));

            if (!isAcceptableImage) {
                return res.status(400).send({ error: `Invalid file type.` });
            }
            //#endregion

            DatabaseHelper.database.Mods.create({
                name: reqBody.data.name,
                summary: reqBody.data.summary,
                description: reqBody.data.description,
                authorIds: [session.user.id],
                gitUrl: reqBody.data.gitUrl,
                category: reqBody.data.category,
                gameName: reqBody.data.gameName,
                iconFileName: `${icon.md5}${path.extname(icon.name)}`,
                lastUpdatedById: session.user.id,
                status: Status.Private,
            }).then((mod) => {
                let filePath = `${path.resolve(Config.storage.iconsDir)}/${icon.md5}${path.extname(icon.name)}`;
                if (filePath.startsWith(`${path.resolve(Config.storage.iconsDir)}/`) == false) {
                    mod.update({ iconFileName: `default.png` });
                    res.status(200).send({ mod });
                } else {
                    icon.mv(filePath);
                    return res.status(200).send({ mod });
                }
            }).catch((error) => {
                return res.status(500).send({ message: `Error creating mod: ${error}` });
            });
        });

        this.app.post(`/api/mods/:modIdParam/upload`, async (req, res) => {
            // #swagger.tags = ['Mods']
            let session = await validateSession(req, res, true);
            if (!session.approved) {
                return;
            }
            
            let modId = Validator.zDBID.safeParse(req.params.modIdParam);
            let reqBody = Validator.zUploadModVersion.safeParse(req.body);
            let file = req.files?.file;

            //#region Request Validation
            if (!modId.success) {
                return res.status(400).send({ message: `Invalid modId.` });
            }

            if (!reqBody.success) {
                return res.status(400).send({ message: `Invalid parameters.`, errors: reqBody.error.issues });
            }

            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modId.data } });
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (!mod.authorIds.includes(session.user.id)) {
                return res.status(401).send({ message: `You cannot upload to this mod.` });
            }

            
            for (let dependancy of reqBody.data.dependencies) {
                let dependancyMod = await DatabaseHelper.database.Mods.findOne({ where: { id: dependancy, [Op.or]: [{status: Status.Verified}, {status: Status.Unverified}, {status: Status.Private}] } });
                if (!dependancyMod) {
                    return res.status(404).send({ message: `Dependancy mod (${dependancy}) not found.` });
                }
            }
            for (let version of reqBody.data.supportedGameVersionIds) {
                let gameVersionDB = await DatabaseHelper.database.GameVersions.findOne({ where: { id: version } });
                if (!gameVersionDB) {
                    return res.status(404).send({ message: `Game version (${version}) not found.` });
                }
            }

            if (!file || Array.isArray(file) || file.size > 75 * 1024 * 1024) {
                return res.status(413).send({ message: `File missing or too large.` });
            }
            //#endregion
            let isZip = file.mimetype === `application/zip` && file.name.endsWith(`.zip`);
            let hashs: ContentHash[] = [];
            if (isZip) {
                await JSZip.loadAsync(file.data).then(async (zip) => {
                    let files = zip.files;
                    for (let file in files) {
                        if (file.endsWith(`/`)) {
                            continue;
                        }

                        let fileData = await files[file].async(`nodebuffer`);
                        const md5 = crypto.createHash(`md5`);
                        let result = md5.update(fileData).digest(`hex`);
                        hashs.push({ path: file, hash: result });
                    }
                }).catch((error) => {
                    Logger.error(`Error reading zip file: ${error}`);
                    return res.status(500).send({ message: `Error reading zip file.` });
                });
            } else {
                return res.status(400).send({ message: `File must be a zip archive.` });
            }

            let filePath = `${path.resolve(Config.storage.iconsDir)}/${file.md5}${path.extname(file.name)}`;
            if (filePath.startsWith(`${path.resolve(Config.storage.iconsDir)}/`) == false) {
                return res.status(400).send({ message: `Invalid zip file.` });
            } else {
                file.mv(filePath);
            }

            DatabaseHelper.database.ModVersions.create({
                modId: modId.data,
                authorId: session.user.id,
                status: Status.Private,
                supportedGameVersionIds: reqBody.data.supportedGameVersionIds,
                modVersion: new SemVer(reqBody.data.modVersion),
                dependencies: reqBody.data.dependencies,
                platform: reqBody.data.platform,
                contentHashes: hashs,
                zipHash: file.md5,
                lastUpdatedById: session.user.id,
            }).then((modVersion) => {
                res.status(200).send({ modVersion });
            }).catch((error) => {
                res.status(500).send({ message: `Error creating mod version: ${error}` });
            });
        });
    }
}