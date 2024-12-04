import { Express } from 'express';
import { DatabaseHelper, UserRoles, Visibility } from '../../shared/Database';
import { validateSession } from '../../shared/AuthHelper';
import { Logger } from '../../shared/Logger';
import { SemVer } from 'semver';

export class ApprovalRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.get(`/api/approval/new`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);

            let newMods = await DatabaseHelper.database.Mods.findAll({ where: { visibility: `unverified` } });
            let newModVersions = await DatabaseHelper.database.ModVersions.findAll({ where: { visibility: `unverified` } });

            res.status(200).send({ mods: newMods, modVersions: newModVersions });
        });

        this.app.get(`/api/approval/edits`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);

            let editQueue = await DatabaseHelper.database.EditApprovalQueue.findAll({where: { approved: false }});

            res.status(200).send({ edits: editQueue });
        });

        // #region Accept/Reject Approvals
        this.app.post(`/api/approval/mod/:modIdParam`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);
            let modId = parseInt(req.params.modIdParam, 10);
            let status = req.body.status;

            if (!status || !DatabaseHelper.isValidVisibility(status)) {
                return res.status(400).send({ message: `Missing status.` });
            }

            if (!modId || isNaN(modId)) {
                return res.status(400).send({ message: `Invalid mod id.` });
            }

            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modId } });
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (mod.authorIds.includes(session.user.id)) {
                return res.status(401).send({ message: `You cannot approve your own mod.` });
            }

            mod.update({ visibility: status }).then(() => {
                Logger.log(`Mod ${modId} set to status ${status} by ${session.user.username}.`);
                return res.status(200).send({ message: `Mod ${status}.` });
            }).catch((error) => {
                Logger.error(`Error ${status} mod: ${error}`);
                return res.status(500).send({ message: `Error ${status} mod:  ${error}` });
            });
        });

        this.app.post(`/api/approval/modversion/:modVersionIdParam`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);
            let modVersionId = parseInt(req.params.modVersionIdParam, 10);
            let status = req.body.status;

            if (!status || !DatabaseHelper.isValidVisibility(status)) {
                return res.status(400).send({ message: `Missing status.` });
            }

            if (!modVersionId || isNaN(modVersionId)) {
                return res.status(400).send({ message: `Invalid mod version id.` });
            }

            let modVersion = await DatabaseHelper.database.ModVersions.findOne({ where: { id: modVersionId } });
            if (!modVersion) {
                return res.status(404).send({ message: `Mod version not found.` });
            }

            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modVersion.modId } });
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (mod.authorIds.includes(session.user.id)) {
                return res.status(401).send({ message: `You cannot approve your own mod.` });
            }

            mod.update({ visibility: status }).then(() => {
                Logger.log(`Mod ${modVersion.id} set to status ${status} by ${session.user.username}.`);
                return res.status(200).send({ message: `Mod ${status}.` });
            }).catch((error) => {
                Logger.error(`Error ${status} mod: ${error}`);
                return res.status(500).send({ message: `Error ${status} mod:  ${error}` });
            });
        });

        this.app.post(`/api/approval/edit/:editIdParam`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);
            let editId = parseInt(req.params.editIdParam, 10);
            let status = req.body.status;

            if (!status || !DatabaseHelper.isValidVisibility(status)) {
                return res.status(400).send({ message: `Missing status.` });
            }

            if (!editId || isNaN(editId)) {
                return res.status(400).send({ message: `Invalid edit id.` });
            }

            let edit = await DatabaseHelper.database.EditApprovalQueue.findOne({ where: { id: editId } });
            if (!edit) {
                return res.status(404).send({ message: `Edit not found.` });
            }

            let isMod = `name` in edit.obj;
            let modId = isMod ? edit.objId : await DatabaseHelper.database.ModVersions.findOne({ where: { id: edit.objId } }).then((modVersion) => modVersion.modId);

            if (!modId) {
                return res.status(404).send({ message: `Mod not found.` });
            }
            
            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modId } });
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (mod.authorIds.includes(session.user.id)) {
                return res.status(401).send({ message: `You cannot approve your own mod.` });
            }

            if (status === Visibility.Verified) {
                edit.approve(session.user).then(() => {
                    Logger.log(`Edit ${editId} set to status ${status} by ${session.user.username}.`);
                    return res.status(200).send({ message: `Edit ${status}.` });
                }).catch((error) => {
                    Logger.error(`Error ${status} edit: ${error}`);
                    return res.status(500).send({ message: `Error ${status} edit:  ${error}` });
                });
            } else if (status === Visibility.Unverified) {
                edit.destroy().then(() => {
                    Logger.log(`Edit ${editId} set to status ${status} by ${session.user.username}.`);
                    return res.status(200).send({ message: `Edit ${status}.` });
                }).catch((error) => {
                    Logger.error(`Error ${status} edit: ${error}`);
                    return res.status(500).send({ message: `Error ${status} edit:  ${error}` });
                });
            }
        // #endregion
        });
        // #endregion

        // #region Edit Approvals
        this.app.patch(`/api/approval/mod/:modIdParam`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);
            let modId = parseInt(req.params.modIdParam, 10);
            let name = req.body.name;
            let description = req.body.description;
            let gitUrl = req.body.gitUrl;
            let category = req.body.category;

            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modId, visibility: Visibility.Unverified } });
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (mod.authorIds.includes(session.user.id)) {
                return res.status(401).send({ message: `You cannot approve your own mod.` });
            }

            if (name && typeof name === `string` && name.length > 0) {
                mod.name = name;
            }

            if (description && typeof description === `string` && description.length > 0) {
                mod.description = description;
            }

            if (gitUrl && typeof gitUrl === `string` && gitUrl.length > 0) {
                mod.gitUrl = gitUrl;
            }

            if (category && typeof category === `string` && DatabaseHelper.isValidCategory(category)) {
                mod.category = category;
            }

            mod.save().then(() => {
                Logger.log(`Mod ${modId} updated by ${session.user.username}.`);
                return res.status(200).send({ message: `Mod updated.` });
            }).catch((error) => {
                Logger.error(`Error updating mod: ${error}`);
                return res.status(500).send({ message: `Error updating mod: ${error}` });
            });
        });

        this.app.patch(`/api/approval/modversion/:modVersionIdParam`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);
            let modVersionId = parseInt(req.params.modVersionIdParam, 10);
            let gameVersions = req.body.gameVersions;
            let modVersion = req.body.modVersion;
            let dependancies = req.body.dependancies;
            let platform = req.body.platform;

            let modVersionDB = await DatabaseHelper.database.ModVersions.findOne({ where: { id: modVersionId, visibility: Visibility.Unverified } });
            if (!modVersionDB) {
                return res.status(404).send({ message: `Mod version not found.` });
            }

            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modVersionDB.modId } });
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (mod.authorIds.includes(session.user.id)) {
                return res.status(401).send({ message: `You cannot approve your own mod.` });
            }

            if (dependancies && Array.isArray(dependancies)) {
                for (let dependancy of dependancies) {
                    if (typeof dependancy !== `number`) {
                        return res.status(400).send({ message: `Invalid dependancy. (Reading ${dependancy})` });
                    }
                    let dependancyMod = await DatabaseHelper.database.Mods.findOne({ where: { id: dependancy } });
                    if (!dependancyMod) {
                        return res.status(404).send({ message: `Dependancy mod (${dependancy}) not found.` });
                    }
                }
            }

            if (gameVersions && Array.isArray(gameVersions)) {
                let versionsToPush = [];
                for (let version of gameVersions) {
                    if (typeof version !== `number`) {
                        return res.status(400).send({ message: `Invalid game version. (Reading ${version})` });
                    }
                    let gameVersionDB = await DatabaseHelper.database.Mods.findOne({ where: { id: version } });
                    if (!gameVersionDB) {
                        return res.status(404).send({ message: `Game version (${version}) not found.` });
                    }
                    versionsToPush.push(gameVersionDB.id);
                }
                modVersionDB.supportedGameVersionIds = versionsToPush;
            }

            if (modVersion && typeof modVersion === `string`) {
                modVersionDB.modVersion = new SemVer(modVersion);
            }

            if (platform && DatabaseHelper.isValidPlatform(platform)) {
                modVersionDB.platform = platform;
            }

            modVersionDB.save().then(() => {
                Logger.log(`Mod version ${modVersionId} updated by ${session.user.username}.`);
                return res.status(200).send({ message: `Mod version updated.` });
            }).catch((error) => {
                Logger.error(`Error updating mod version: ${error}`);
                return res.status(500).send({ message: `Error updating mod version: ${error}` });
            });
        });

        this.app.patch(`/api/approval/edit/:editIdParam`, async (req, res) => {
            let session = await validateSession(req, res, UserRoles.Approver);
            let editId = parseInt(req.params.editIdParam, 10);
            
            let edit = await DatabaseHelper.database.EditApprovalQueue.findOne({ where: { id: editId, approved: false } });

            if (!edit) {
                return res.status(404).send({ message: `Edit not found.` });
            }

            if (edit.submitterId === session.user.id) {
                return res.status(401).send({ message: `You cannot approve your own edit.` });
            }

            let modId = `name` in edit.obj ? edit.objId : await DatabaseHelper.database.ModVersions.findOne({ where: { id: edit.objId } }).then((modVersion) => modVersion.modId);
            
            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modId } });

            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (mod.authorIds.includes(session.user.id)) {
                return res.status(401).send({ message: `You cannot approve your own mod.` });
            }

            switch (edit.objTableName) {
                case `mods`:
                    if (!(`name` in edit.obj)) {
                        Logger.error(`Edit ${editId} is not a mod edit, despite the table name being "mods".`);
                        return res.status(400).send({ message: `Invalid edit.` });
                    }

                    let name = req.body.name;
                    let description = req.body.description;
                    let gitUrl = req.body.gitUrl;
                    let category = req.body.category;
                    let authorIds = req.body.authorIds;

                    if (name && typeof name === `string` && name.length > 0) {
                        edit.obj.name = name;
                    }

                    if (description && typeof description === `string` && description.length > 0) {
                        edit.obj.description = description;
                    }

                    if (gitUrl && typeof gitUrl === `string` && gitUrl.length > 0) {
                        edit.obj.gitUrl = gitUrl;
                    }

                    if (category && typeof category === `string` && DatabaseHelper.isValidCategory(category)) {
                        edit.obj.category = category;
                    }

                    if (authorIds && Array.isArray(authorIds)) {
                        let authors = [];
                        for (let authorId of authorIds) {
                            if (typeof authorId !== `number`) {
                                return res.status(400).send({ message: `Invalid author id. (Reading ${authorId})` });
                            }
                            let author = await DatabaseHelper.database.Users.findOne({ where: { id: authorId } });
                            if (!author) {
                                return res.status(404).send({ message: `Author (${authorId}) not found.` });
                            }
                            authors.push(author.id);
                        }
                        edit.obj.authorIds = authors;
                    }

                    edit.save();
                    break;
                case `modVersions`:
                    if (!(`modVersion` in edit.obj)) {
                        Logger.error(`Edit ${editId} is not a mod version edit, despite the table name being "modVersions".`);
                        return res.status(400).send({ message: `Invalid edit.` });
                    }
                    
                    let gameVersions = req.body.gameVersions;
                    let modVersion = req.body.modVersion;
                    let dependancies = req.body.dependancies;
                    let platform = req.body.platform;

                    if (dependancies && Array.isArray(dependancies)) {
                        for (let dependancy of dependancies) {
                            if (typeof dependancy !== `number`) {
                                return res.status(400).send({ message: `Invalid dependancy. (Reading ${dependancy})` });
                            }
                            let dependancyMod = await DatabaseHelper.database.Mods.findOne({ where: { id: dependancy } });
                            if (!dependancyMod) {
                                return res.status(404).send({ message: `Dependancy mod (${dependancy}) not found.` });
                            }
                        }
                    }

                    if (gameVersions && Array.isArray(gameVersions)) {
                        let versionsToPush = [];
                        for (let version of gameVersions) {
                            if (typeof version !== `number`) {
                                return res.status(400).send({ message: `Invalid game version. (Reading ${version})` });
                            }
                            let gameVersionDB = await DatabaseHelper.database.Mods.findOne({ where: { id: version } });
                            if (!gameVersionDB) {
                                return res.status(404).send({ message: `Game version (${version}) not found.` });
                            }
                            versionsToPush.push(gameVersionDB.id);
                        }
                        edit.obj.supportedGameVersionIds = versionsToPush;
                    }

                    if (modVersion && typeof modVersion === `string`) {
                        edit.obj.modVersion = new SemVer(modVersion);
                    }

                    if (platform && DatabaseHelper.isValidPlatform(platform)) {
                        edit.obj.platform = platform;
                    }

                    edit.save();
                    break;
            }

            res.status(200).send({ message: `Edit updated.`, edit: edit });
        });
    }
}