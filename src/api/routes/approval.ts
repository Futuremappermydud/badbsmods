import { Express } from 'express';
import { DatabaseHelper, UserRoles, Status, ModVersionApproval, ModVersion } from '../../shared/Database';
import { validateAdditionalGamePermissions, validateSession } from '../../shared/AuthHelper';
import { Logger } from '../../shared/Logger';
import { coerce, SemVer, valid } from 'semver';
import { HTTPTools } from '../../shared/HTTPTools';
import { Op } from 'sequelize';
import { Validator } from '../../shared/Validator';

export class ApprovalRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        // #region Get Approvals
        this.app.get(`/api/approval/new`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Get new mods & modVersions pending approval.'
            // #swagger.description = 'Get a list of mods & modVersions pending their first approval.'
            // #swagger.parameters['gameName'] = { description: 'The name of the game to get new mods for.', type: 'string' }
            // #swagger.responses[200] = { description: 'List of mods pending first approval', schema: { mods: [] } }
            // #swagger.responses[400] = { description: 'Missing game name.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'No mods found.' }
            let gameName = req.query.gameName;
            if (typeof gameName !== `string` || !DatabaseHelper.isValidGameName(gameName)) {
                return res.status(400).send({ message: `Missing game name.` });
            }
            let session = await validateSession(req, res, UserRoles.Approver, gameName);
            if (!session.approved) {
                return;
            }

            let newMods = (await DatabaseHelper.database.Mods.findAll({ where: { status: `unverified`, gameName: gameName } })).map((mod) => mod.toAPIResponse());
            let newModVersions = await DatabaseHelper.database.ModVersions.findAll({ where: { status: `unverified` } });
            if (!newMods || !newModVersions) {
                return res.status(404).send({ message: `No mods found.` });
            }

            let modVersions = newModVersions.filter((modVersion) => {
                for (let gameVersionId of modVersion.supportedGameVersionIds) {
                    let gV = DatabaseHelper.cache.gameVersions.find((gameVersion) => gameVersion.id === gameVersionId);
                    if (!gV || gV.gameName !== gameName) {
                        return false;
                    } else {
                        return true;
                    }
                }
            });

            res.status(200).send({ mods: newMods, modVersions: modVersions });
        });

        this.app.get(`/api/approval/edits`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Get edits pending approval.'
            // #swagger.description = 'Get a list of already existing mod & modVersions that are pending approval.'
            // #swagger.parameters['gameName'] = { description: 'The name of the game to get edits for.', type: 'string' }
            // #swagger.responses[200] = { description: 'List of edits pending approval', schema: { edits: [] } }
            // #swagger.responses[400] = { description: 'Missing game name.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'No edits found.' }
            let gameName = req.query.gameName;
            if (typeof gameName !== `string` || !DatabaseHelper.isValidGameName(gameName)) {
                return res.status(400).send({ message: `Missing game name.` });
            }
            let session = await validateSession(req, res, UserRoles.Approver, gameName);
            if (!session.approved) {
                return;
            }

            let editQueue = await DatabaseHelper.database.EditApprovalQueue.findAll({where: { approved: null }});
            if (!editQueue) {
                return res.status(404).send({ message: `No edits found.` });
            }

            editQueue = editQueue.filter((edit) => {
                if (`name` in edit.object) {
                    return edit.object.gameName === gameName;
                } else {
                    return edit.object.supportedGameVersionIds.filter((gameVersionId) => {
                        let gV = DatabaseHelper.cache.gameVersions.find((gameVersion) => gameVersion.id === gameVersionId);
                        if (!gV) {
                            return false;
                        }
                        return gV.gameName === gameName;
                    }).length > 0;
                }
            });

            res.status(200).send({ edits: editQueue });
        });
        // #endregion
        // #region Accept/Reject Approvals
        this.app.post(`/api/approval/mod/:modIdParam/approve`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Approve a mod.'
            // #swagger.description = 'Approve a mod for public visibility.'
            // #swagger.parameters['modIdParam'] = { description: 'The id of the mod to approve.', type: 'integer' }
            // #swagger.parameters['status'] = { description: 'The status to set the mod to.', type: 'string' }
            // #swagger.responses[200] = { description: 'Mod status updated.' }
            // #swagger.responses[400] = { description: 'Missing status.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'Mod not found.' }
            // #swagger.responses[500] = { description: 'Error approving mod.' }
            let modId = parseInt(req.params.modIdParam, 10);
            let status = req.body.status;
            let session = await validateSession(req, res, UserRoles.Approver, DatabaseHelper.getGameNameFromModId(modId));
            if (!session.approved) {
                return;
            }

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

            mod.setStatus(status, session.user).then(() => {
                Logger.log(`Mod ${modId} set to status ${status} by ${session.user.username}.`);
                return res.status(200).send({ message: `Mod ${status}.` });
            }).catch((error) => {
                Logger.error(`Error ${status} mod: ${error}`);
                return res.status(500).send({ message: `Error ${status} mod:  ${error}` });
            });
        });

        this.app.post(`/api/approval/modversion/:modVersionIdParam/approve`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Approve a modVersion.'
            // #swagger.description = 'Approve a modVersion for public visibility.'
            // #swagger.parameters['modVersionIdParam'] = { description: 'The id of the modVersion to approve.', type: 'integer' }
            // #swagger.parameters['status'] = { description: 'The status to set the modVersion to.', type: 'string' }
            // #swagger.responses[200] = { description: 'ModVersion status updated.' }
            // #swagger.responses[400] = { description: 'Missing status.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'ModVersion not found.' }
            // #swagger.responses[500] = { description: 'Error approving modVersion.' }
            let modVersionId = parseInt(req.params.modVersionIdParam, 10);
            let status = req.body.status;
            let session = await validateSession(req, res, UserRoles.Approver, DatabaseHelper.getGameNameFromModVersionId(modVersionId));
            if (!session.approved) {
                return;
            }

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

            modVersion.setStatus(status, session.user).then(() => {
                Logger.log(`ModVersion ${modVersion.id} set to status ${status} by ${session.user.username}.`);
                return res.status(200).send({ message: `Mod ${status}.` });
            }).catch((error) => {
                Logger.error(`Error ${status} mod: ${error}`);
                return res.status(500).send({ message: `Error ${status} mod:  ${error}` });
            });
        });

        this.app.post(`/api/approval/edit/:editIdParam/approve`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Approve an edit.'
            // #swagger.description = 'Approve an edit for public visibility.'
            // #swagger.parameters['editIdParam'] = { description: 'The id of the edit to approve.', type: 'integer' }
            // #swagger.parameters['status'] = { description: 'The status to set the edit to.', type: 'string' }
            // #swagger.responses[200] = { description: 'Edit status updated.' }
            // #swagger.responses[400] = { description: 'Missing status.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'Edit not found.' }
            // #swagger.responses[500] = { description: 'Error approving edit.' }
            let editId = parseInt(req.params.editIdParam, 10);
            let accepted = req.body.accepted;
            let session = await validateSession(req, res, UserRoles.Approver, DatabaseHelper.getGameNameFromEditApprovalQueueId(editId));
            if (!session.approved) {
                return;
            }

            if (accepted === null || accepted === undefined || typeof accepted !== `boolean`) {
                return res.status(400).send({ message: `Missing status.` });
            }

            if (!editId || isNaN(editId)) {
                return res.status(400).send({ message: `Invalid edit id.` });
            }

            let edit = await DatabaseHelper.database.EditApprovalQueue.findOne({ where: { id: editId } });
            if (!edit) {
                return res.status(404).send({ message: `Edit not found.` });
            }

            let isMod = `name` in edit.object;
            let modId = isMod ? edit.objectId : await DatabaseHelper.database.ModVersions.findOne({ where: { id: edit.objectId } }).then((modVersion) => modVersion.modId);

            if (!modId) {
                return res.status(404).send({ message: `Mod not found.` });
            }
            
            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modId } });
            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            if (accepted) {
                edit.approve(session.user).then((record) => {
                    Logger.log(`Edit ${editId} accepted by ${session.user.username}.`);
                    return res.status(200).send({ message: `Edit accepted.`, record: record });
                }).catch((error) => {
                    Logger.error(`Error approving edit ${editId}: ${error}`);
                    return res.status(500).send({ message: `Error approving edit:  ${error}` });
                });
            } else {
                edit.deny(session.user).then(() => {
                    Logger.log(`Edit ${editId} rejected by ${session.user.username}.`);
                    return res.status(200).send({ message: `Edit rejected.` });
                }).catch((error) => {
                    Logger.error(`Error rejecting edit ${editId}: ${error}`);
                    return res.status(500).send({ message: `Error rejecting edit:  ${error}` });
                });
            }
        });
        // #endregion
        // #region Edit Approvals
        this.app.patch(`/api/approval/mod/:modIdParam`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Edit a mod in the approval queue.'
            // #swagger.description = 'Edit a mod in the approval queue.'
            // #swagger.parameters['modIdParam'] = { description: 'The id of the mod to edit.', type: 'integer', required: true }
            // #swagger.parameters['name'] = { description: 'The new name of the mod.', type: 'string' }
            // #swagger.parameters['summary'] = { description: 'The new summary of the mod.', type: 'string' }
            // #swagger.parameters['description'] = { description: 'The new description of the mod.', type: 'string' }
            // #swagger.parameters['gitUrl'] = { description: 'The new gitUrl of the mod.', type: 'string' }
            // #swagger.parameters['category'] = { description: 'The new category of the mod.', type: 'string' }
            // #swagger.parameters['gameName'] = { description: 'The new gameName of the mod.', type: 'string' }
            // #swagger.responses[200] = { description: 'Mod updated.', schema: { mod: {} } }
            // #swagger.responses[400] = { description: 'No changes provided.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'Mod not found.' }
            // #swagger.responses[500] = { description: 'Error updating mod.' }
            let modId = Validator.zDBID.safeParse(req.params.modIdParam);
            if (!modId.success) {
                return res.status(400).send({ message: `Invalid mod id.` });
            }
            let reqBody = Validator.zUpdateMod.safeParse(req.body);
            if (!reqBody.success) {
                return res.status(400).send({ message: `Invalid parameters.`, errors: reqBody.error.issues });
            }
            let session = await validateSession(req, res, UserRoles.Approver, DatabaseHelper.getGameNameFromModId(modId.data));
            if (!session.approved) {
                return;
            }

            if (validateAdditionalGamePermissions(session, reqBody.data.gameName, UserRoles.Approver) == false) {
                return res.status(401).send({ message: `You cannot edit this mod.` });
            }

            if (!reqBody.data.name && !reqBody.data.summary && !reqBody.data.description && !reqBody.data.gitUrl && !reqBody.data.category && !reqBody.data.gameName && !reqBody.data.authorIds) {
                return res.status(400).send({ message: `No changes provided.` });
            }

            let mod = await DatabaseHelper.database.Mods.findByPk(modId.data);

            if (!mod) {
                return res.status(404).send({ message: `Mod not found.` });
            }

            mod.name = reqBody.data.name || mod.name;
            mod.summary = reqBody.data.summary || mod.summary;
            mod.description = reqBody.data.description || mod.description;
            mod.gitUrl = reqBody.data.gitUrl || mod.gitUrl;
            mod.category = reqBody.data.category || mod.category;
            mod.gameName = reqBody.data.gameName || mod.gameName;
            mod.lastUpdatedById = session.user.id;
            mod.save().then(() => {
                Logger.log(`Mod ${modId} updated by ${session.user.username}.`);
                return res.status(200).send({ message: `Mod updated.`, mod: mod });
            }).catch((error) => {
                Logger.error(`Error updating mod ${modId}: ${error}`);
                return res.status(500).send({ message: `Error updating mod: ${error}` });
            });
        });

        this.app.patch(`/api/approval/modversion/:modVersionIdParam`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Edit a modVersion in the approval queue.'
            // #swagger.description = 'Edit a modVersion in the approval queue.'
            // #swagger.parameters['modVersionIdParam'] = { description: 'The id of the modVersion to edit.', type: 'integer', required: true }
            // #swagger.parameters['gameVersionIds'] = { description: 'The new gameVersionIds of the modVersion.', type: 'array', items: { type: 'integer' } }
            // #swagger.parameters['modVersion'] = { description: 'The new modVersion of the modVersion.', type: 'string' }
            // #swagger.parameters['dependencyIds'] = { description: 'The new dependencyIds of the modVersion.', type: 'array', items: { type: 'integer' } }
            // #swagger.parameters['platform'] = { description: 'The new platform of the modVersion.', type: 'string' }
            // #swagger.responses[200] = { description: 'ModVersion updated.', schema: { modVersion: {} } }
            // #swagger.responses[400] = { description: 'No changes provided.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'ModVersion not found.' }
            // #swagger.responses[500] = { description: 'Error updating modVersion.' }
            let modVersionId = Validator.zDBID.safeParse(req.params.modVersionIdParam);
            if (!modVersionId.success) {
                return res.status(400).send({ message: `Invalid mod version id.` });
            }
            let reqBody = Validator.zUpdateModVersion.safeParse(req.body);
            if (!reqBody.success) {
                return res.status(400).send({ message: `Invalid parameters.`, errors: reqBody.error.issues });
            }            
            let session = await validateSession(req, res, UserRoles.Approver, DatabaseHelper.getGameNameFromModVersionId(modVersionId.data));
            if (!session.approved) {
                return;
            }

            let modVer = await DatabaseHelper.database.ModVersions.findOne({ where: { id: modVersionId, status: Status.Unverified } });
            if (!modVer) {
                return res.status(404).send({ message: `Mod version not found.` });
            }

            if (!reqBody.data.modVersion && !reqBody.data.supportedGameVersionIds && !reqBody.data.dependencies && !reqBody.data.platform) {
                return res.status(400).send({ message: `No changes provided.` });
            }

            if ((await Validator.validateIDArray(reqBody.data.supportedGameVersionIds, `gameVersions`)) == false) {
                return res.status(400).send({ message: `Invalid gameVersionIds.` });
            }

            if ((await Validator.validateIDArray(reqBody.data.dependencies, `modVersions`)) == false) {
                return res.status(400).send({ message: `Invalid dependencies.` });
            }

            modVer.dependencies = reqBody.data.dependencies || modVer.dependencies;
            modVer.supportedGameVersionIds = reqBody.data.supportedGameVersionIds || modVer.supportedGameVersionIds;
            modVer.modVersion = new SemVer(reqBody.data.modVersion) || modVer.modVersion;
            modVer.platform = reqBody.data.platform || modVer.platform;
            modVer.lastUpdatedById = session.user.id;
            modVer.save().then(() => {
                Logger.log(`ModVersion ${modVersionId} updated by ${session.user.username}.`);
                return res.status(200).send({ message: `ModVersion updated.`, modVersion: modVer });
            }).catch((error) => {
                Logger.error(`Error updating modVersion ${modVersionId}: ${error}`);
                return res.status(500).send({ message: `Error updating modVersion: ${error}` });
            });
        });

        this.app.patch(`/api/approval/edit/:editIdParam`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Edit an edit in the approval queue.'
            // #swagger.description = 'Edit an edit in the approval queue.'
            // #swagger.parameters['editIdParam'] = { description: 'The id of the edit to edit.', type: 'integer', required: true }
            // #swagger.parameters['name'] = { description: 'The new name of the mod.', type: 'string' }
            // #swagger.parameters['summary'] = { description: 'The new summary of the mod.', type: 'string' }
            // #swagger.parameters['description'] = { description: 'The new description of the mod.', type: 'string' }
            // #swagger.parameters['gitUrl'] = { description: 'The new gitUrl of the mod.', type: 'string' }
            // #swagger.parameters['category'] = { description: 'The new category of the mod.', type: 'string' }
            // #swagger.parameters['authorIds'] = { description: 'The new authorIds of the mod.', type: 'array', items: { type: 'integer' } }
            // #swagger.parameters['gameName'] = { description: 'The new gameName of the mod.', type: 'string' }
            // #swagger.parameters['gameVersionIds'] = { description: 'The new gameVersionIds of the mod.', type: 'array', items: { type: 'integer' } }
            // #swagger.parameters['modVersion'] = { description: 'The new modVersion of the mod.', type: 'string' }
            // #swagger.parameters['dependencyIds'] = { description: 'The new dependencyIds of the mod.', type: 'array', items: { type: 'integer' } }
            // #swagger.parameters['platform'] = { description: 'The new platform of the mod.', type: 'string' }
            // #swagger.responses[200] = { description: 'Edit updated.', schema: { edit: {} } }
            // #swagger.responses[400] = { description: 'No changes provided.' }
            // #swagger.responses[401] = { description: 'Unauthorized.' }
            // #swagger.responses[404] = { description: 'Edit not found.' }
            // #swagger.responses[500] = { description: 'Error updating edit.' }
            let editId = Validator.zDBID.safeParse(req.params.editIdParam);
            if (!editId.success) {
                return res.status(400).send({ message: `Invalid edit id.` });
            }
            let session = await validateSession(req, res, UserRoles.Approver, DatabaseHelper.getGameNameFromEditApprovalQueueId(editId.data));
            if (!session.approved) {
                return;
            }
            
            let edit = await DatabaseHelper.database.EditApprovalQueue.findOne({ where: { id: editId.data, approved: null } });

            if (!edit) {
                return res.status(404).send({ message: `Edit not found.` });
            }

            let modId = edit.isMod() ? edit.objectId : await DatabaseHelper.database.ModVersions.findOne({ where: { id: edit.objectId } }).then((modVersion) => modVersion.modId);
            
            let mod = await DatabaseHelper.database.Mods.findOne({ where: { id: modId } });

            if (!mod) {
                return res.status(500).send({ message: `Mod not found.` });
            }

            if (mod.authorIds.includes(session.user.id)) {
                Logger.warn(`User ${session.user.username} edited their own mod (${mod.name}).`);
            }

            switch (edit.objectTableName) {
                case `mods`:
                    if (!edit.isMod()) {
                        Logger.error(`Edit ${editId} is not a mod edit, despite the table name being "mods".`);
                        return res.status(500).send({ message: `Invalid edit.` });
                    }

                    let reqBodym = Validator.zUpdateMod.safeParse(req.body);
                    if (!reqBodym.success) {
                        return res.status(400).send({ message: `Invalid parameters.`, errors: reqBodym.error.issues });
                    }
                    
                    if (!reqBodym.data.name && !reqBodym.data.summary && !reqBodym.data.description && !reqBodym.data.gitUrl && !reqBodym.data.category && !reqBodym.data.gameName && !reqBodym.data.authorIds) {
                        return res.status(400).send({ message: `No changes provided.` });
                    }

                    if ((await Validator.validateIDArray(reqBodym.data.authorIds, `users`)) == false) {
                        return res.status(400).send({ message: `Invalid authorIds.` });
                    }

                    edit.object = {
                        name: reqBodym.data.name || edit.object.name,
                        summary: reqBodym.data.summary || edit.object.summary,
                        description: reqBodym.data.description || edit.object.description,
                        gitUrl: reqBodym.data.gitUrl || edit.object.gitUrl,
                        category: reqBodym.data.category || edit.object.category,
                        authorIds: reqBodym.data.authorIds || edit.object.authorIds,
                        gameName: reqBodym.data.gameName || edit.object.gameName,
                    };
                    edit.save();
                    break;
                case `modVersions`:
                    if (!edit.isModVersion()) {
                        Logger.error(`Edit ${editId} is not a mod version edit, despite the table name being "modVersions".`);
                        return res.status(500).send({ message: `Invalid edit.` });
                    }
                    
                    let reqBodyv = Validator.zUpdateModVersion.safeParse(req.body);
                    if (!reqBodyv.success) {
                        return res.status(400).send({ message: `Invalid parameters.`, errors: reqBodyv.error.issues });
                    }

                    if (!reqBodyv.data.modVersion && !reqBodyv.data.supportedGameVersionIds && !reqBodyv.data.dependencies && !reqBodyv.data.platform) {
                        return res.status(400).send({ message: `No changes provided.` });
                    }

                    if ((await Validator.validateIDArray(reqBodyv.data.supportedGameVersionIds, `gameVersions`)) == false) {
                        return res.status(400).send({ message: `Invalid gameVersionIds.` });
                    }

                    if ((await Validator.validateIDArray(reqBodyv.data.dependencies, `modVersions`)) == false) {
                        return res.status(400).send({ message: `Invalid dependencies.` });
                    }

                    edit.object = {
                        modVersion: new SemVer(reqBodyv.data.modVersion) || edit.object.modVersion,
                        supportedGameVersionIds: reqBodyv.data.supportedGameVersionIds || edit.object.supportedGameVersionIds,
                        dependencies: reqBodyv.data.dependencies || edit.object.dependencies,
                        platform: reqBodyv.data.platform || edit.object.platform,
                    };
                    edit.save();
                    break;
            }

            res.status(200).send({ message: `Edit updated.`, edit: edit });
        });
        // #endregion
        // #region Revoke Approvals
        this.app.post(`/api/approval/modVersion/:modVersionIdParam/revoke`, async (req, res) => {
            // #swagger.tags = ['Approval']
            // #swagger.summary = 'Revoke a modVersion's verification.'
            // #swagger.description = 'Revoke a modVersion\'s verification status.\n\nThis will also revoke the verification status of any modVersions that depend on this modVersion.
            // #swagger.parameters['modVersionIdParam'] = { description: 'The id of the modVersion to revoke.', type: 'integer', required: true }
            // #swagger.parameters['allowDependants'] = { description: 'Allow dependants to remain verified. This is dangerous.', type: 'boolean', required: true }
            let modVersionId = Validator.zDBID.safeParse(req.params.modVersionIdParam);
            if (!modVersionId.success) {
                return res.status(400).send({ message: `Invalid mod version id.` });
            }
            let session = await validateSession(req, res, UserRoles.Admin, DatabaseHelper.getGameNameFromModVersionId(modVersionId.data));
            if (!session.approved) {
                return;
            }

            //let status = Validator.zStatus.safeParse(req.body.status);
            let allowDependants = Validator.zBool.safeParse(req.body.allowDependants);

            let modVersion = await DatabaseHelper.database.ModVersions.findOne({ where: { id: modVersionId.data } });
            if (!modVersion) {
                return res.status(404).send({ message: `Mod version not found.` });
            }

            let dependants = await DatabaseHelper.database.ModVersions.findAll({ where: { dependencies: { [Op.contains]: [modVersionId.data] } } });

            if (dependants.length > 0 && allowDependants.data == false) {
                return res.status(400).send({ message: `Mod version has ${dependants.length} dependants. Set "allowDependants" to true to revoke this mod's approved status.` });
            }

            
            let revokedIds:number[] = [];
            if (dependants.length > 0) {
                for (let dependant of dependants) {
                    let ids = await unverifyModVersionId(session.user.id, dependant.id, dependant);
                    revokedIds = [...revokedIds, ...ids];
                }
            } else {
                let ids = await unverifyModVersionId(session.user.id, modVersionId.data, modVersion);
                revokedIds = [...revokedIds, ...ids];
            }
            Logger.log(`ModVersion ${modVersionId.data} & its ${dependants.length} have been revoked by ${session.user.username}.`);
            return res.status(200).send({ message: `Mod version revoked.`, revokedIds: revokedIds });
        });
    }
}

async function unverifyModVersionId(approverId:number, modVersion: number, modObj?:ModVersion): Promise<number[]> {
    let modVersionDb = modObj || await DatabaseHelper.database.ModVersions.findOne({ where: { id: modVersion } });
    if (!modVersionDb || modVersionDb.status !== Status.Verified) {
        return [];
    }
    let revokedIds = [modVersionDb.id];
    modVersionDb.lastApprovedById = approverId;
    modVersionDb.status = Status.Unverified;
    await modVersionDb.save().then(async () => {
        for (let dependant of modVersionDb.dependencies) {
            let id = await unverifyModVersionId(approverId, dependant); // recursiveness
            revokedIds = [...revokedIds, ...id];
        }
    });
    return revokedIds;
}