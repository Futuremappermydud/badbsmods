import path from "path";
import { exit } from "process";
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, ModelStatic, Op, Sequelize } from "sequelize";
import { Logger } from "./Logger";
import { satisfies, SemVer } from "semver";
import { Config } from "./Config";
import { sendModLog, sendModVersionLog } from "./ModWebhooks";


export enum SupportedGames {
    BeatSaber = `BeatSaber`,
    ChroMapper = `ChroMapper`,
    TromboneChampUnflattened = `TromboneChampUnflattened`,
    SpinRhythmXD = `SpinRhythmXD`,
}


function isValidDialect(dialect: string): dialect is `sqlite` |`postgres` {
    return [`sqlite`, `postgres`].includes(dialect);
}

export class DatabaseManager {
    public sequelize: Sequelize;
    public Users: ModelStatic<User>;
    public ModVersions: ModelStatic<ModVersion>;
    public Mods: ModelStatic<Mod>;
    public GameVersions: ModelStatic<GameVersion>;
    public EditApprovalQueue: ModelStatic<EditQueue>;
    public MOTDs: ModelStatic<MOTD>;

    constructor() {
        Logger.log(`Loading Database...`);
        this.sequelize = new Sequelize(`bbm_database`, Config.database.username, Config.database.password, {
            host: Config.database.dialect === `sqlite` ? `localhost` : Config.database.url,
            dialect: isValidDialect(Config.database.dialect) ? Config.database.dialect : `sqlite`,
            logging: false,
            storage: Config.database.dialect === `sqlite` ? path.resolve(Config.database.url) : undefined,
        });

        this.loadTables();
    }

    public async init() {
        await this.sequelize.sync({
            alter: Config.database.alter,
        }).then(() => {
            Logger.log(`Database Loaded.`);
            new DatabaseHelper(this);

            this.Users.findByPk(1).then((user) => {
                if (!user) {
                    this.Users.create({
                        username: `ServerAdmin`,
                        discordId: `1`,
                        roles: {
                            sitewide: [UserRoles.AllPermissions],
                            perGame: {},
                        },
                        githubId: null,
                    }).then(() => {
                        Logger.log(`Created built in server account.`);
                    }).catch((error) => {
                        Logger.error(`Error creating built in server account: ${error}`);
                    });
                } else {
                    if (!user.roles.sitewide.includes(UserRoles.AllPermissions)) {
                        if (user.username != `ServerAdmin`) {
                            Logger.warn(`Server account has been tampered with!`);
                        } else {
                            user.addSiteWideRole(UserRoles.AllPermissions);
                            Logger.log(`Added AllPermissions role to server account.`);
                        }
                    }
                }
            });

            DatabaseHelper.database.sequelize.query(`PRAGMA integrity_check;`).then((healthcheck) => {
                let healthcheckString = (healthcheck[0][0] as any).integrity_check;
                Logger.log(`Database health check: ${healthcheckString}`);
            }).catch((error) => {
                Logger.error(`Error checking database health: ${error}`);
            });
            setInterval(() => {
                DatabaseHelper.database.sequelize.query(`PRAGMA integrity_check;`).then((healthcheck) => {
                    let healthcheckString = (healthcheck[0][0] as any).integrity_check;
                    Logger.log(`Database health check: ${healthcheckString}`);
                }).catch((error) => {
                    Logger.error(`Error checking database health: ${error}`);
                });
            }, 1000 * 60 * 60 * 1);
        }).catch((error) => {
            Logger.error(`Error loading database: ${error}`);
            exit(-1);
        });
    }
    
    // #region LoadTables
    private loadTables() {
        this.Users = User.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            username: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            githubId: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: null,
                unique: true, //SQLite treats all NULL values are different, therefore, a column with a UNIQUE constraint can have multiple NULL values.
            },
            sponsorUrl: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: ``,
            },
            discordId: {
                type: DataTypes.STRING,
                allowNull: true,
                defaultValue: ``,
            },
            displayName: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            bio: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: ``,
            },
            roles: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `[]`,
                get() {
                    // @ts-expect-error s(2345)
                    return JSON.parse(this.getDataValue(`roles`));
                },
                set(value: string[]) {
                    // @ts-expect-error s(2345)
                    this.setDataValue(`roles`, JSON.stringify(value));
                },
            },
            createdAt: DataTypes.DATE, // just so that typescript isn't angy
            updatedAt: DataTypes.DATE,
        }, {
            sequelize: this.sequelize,
            modelName: `users`,
        });

        this.GameVersions = GameVersion.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            gameName: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            version: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            defaultVersion: {
                type: DataTypes.BOOLEAN,
                allowNull: false,
                defaultValue: false,
            },
            createdAt: DataTypes.DATE, // just so that typescript isn't angy
            updatedAt: DataTypes.DATE,
        }, {
            sequelize: this.sequelize,
            modelName: `gameVersions`,
        });

        this.Mods = Mod.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            summary: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: ``,
            },
            gameName: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: SupportedGames.BeatSaber,
            },
            category: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `other`,
            },
            authorIds: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `[]`,
                get() {
                    // @ts-expect-error s(2345)
                    return JSON.parse(this.getDataValue(`authorIds`));
                },
                set(value: number[]) {
                    // @ts-expect-error s(2345)
                    this.setDataValue(`authorIds`, JSON.stringify(value));
                },
            },
            iconFileName: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            gitUrl: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `private`,
            },
            lastApprovedById: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            lastUpdatedById: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            createdAt: DataTypes.DATE, // just so that typescript isn't angy
            updatedAt: DataTypes.DATE,
        }, {
            sequelize: this.sequelize,
            modelName: `mods`,
        });

        this.ModVersions = ModVersion.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            modId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            authorId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            modVersion: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
                get() {
                    return new SemVer(this.getDataValue(`modVersion`));
                },
                set(value: SemVer) {
                    // @ts-expect-error ts(2345)
                    this.setDataValue(`modVersion`, value.raw);
                },
            },
            supportedGameVersionIds: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
                get() {
                    // @ts-expect-error s(2345)
                    return JSON.parse(this.getDataValue(`supportedGameVersionIds`));
                },
                set(value: number[]) {
                    // @ts-expect-error s(2345)
                    this.setDataValue(`supportedGameVersionIds`, JSON.stringify(value));
                },
            },
            status: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `private`,
            },
            platform: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `steam`,
            },
            zipHash: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            contentHashes: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `[]`,
                get() {
                    // @ts-expect-error s(2345)
                    return JSON.parse(this.getDataValue(`contentHashes`));
                },
                set(value: ContentHash[]) {
                    // @ts-expect-error s(2345)
                    this.setDataValue(`contentHashes`, JSON.stringify(value));
                },
            },
            dependencies: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `[]`,
                get() {
                    // @ts-expect-error s(2345)
                    return JSON.parse(this.getDataValue(`dependencies`));
                },
                set(value: number[]) {
                    // @ts-expect-error s(2345)
                    this.setDataValue(`dependencies`, JSON.stringify(value));
                }
            },
            downloadCount: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 0,
            },
            lastApprovedById: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            lastUpdatedById: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            createdAt: DataTypes.DATE, // just so that typescript isn't angy
            updatedAt: DataTypes.DATE,
        }, {
            sequelize: this.sequelize,
            modelName: `modVersions`,
        });

        this.EditApprovalQueue = EditQueue.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            submitterId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            objectId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            objectTableName: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            object: {
                type: DataTypes.TEXT,
                allowNull: false,
                defaultValue: `{}`,
                get() {
                    // @ts-expect-error s(2345)
                    return JSON.parse(this.getDataValue(`object`));
                },
                set(value: any) {
                    // @ts-expect-error s(2345)
                    this.setDataValue(`object`, JSON.stringify(value));
                },
            },
            approverId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                defaultValue: null,
            },
            approved: {
                type: DataTypes.BOOLEAN,
                allowNull: true,
                defaultValue: null,
            },
            createdAt: DataTypes.DATE, // just so that typescript isn't angy
            updatedAt: DataTypes.DATE,
        }, {
            sequelize: this.sequelize,
            modelName: `editApprovalQueue`,
        });

        this.MOTDs = MOTD.init({
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
                unique: true,
            },
            gameName: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            message: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: ``,
            },
            translations: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `{}`,
                get() {
                    // @ts-expect-error s(2345)
                    return JSON.parse(this.getDataValue(`translations`));
                },
                set(value: string[]) {
                    // @ts-expect-error s(2345)
                    this.setDataValue(`translations`, JSON.stringify(value));
                },
            },
            startTime: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            endTime: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            postType: {
                type: DataTypes.STRING,
                allowNull: false,
                defaultValue: `community`,
            },
            authorId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            createdAt: DataTypes.DATE, // just so that typescript isn't angy
            updatedAt: DataTypes.DATE,
        }, {
            sequelize: this.sequelize,
            modelName: `motds`,
        });
        // #endregion

        // #region Hooks
        this.Mods.afterValidate(async (mod) => {
            await Mod.checkForExistingMod(mod.name).then((existingMod) => {
                if (existingMod) {
                    if (existingMod.id != mod.id) {
                        throw new Error(`Mod already exists.`);
                    }
                }
            });
        });

        this.ModVersions.afterValidate(async (modVersion) => {
            let parentMod = await Mod.findByPk(modVersion.modId);
            await ModVersion.checkForExistingVersion(modVersion.modId, modVersion.modVersion, modVersion.platform).then((existingVersion) => {
                if (existingVersion) {
                    if (existingVersion.id != modVersion.id && modVersion.status == Status.Verified) {
                        throw new Error(`Edit would cause a duplicate version.`);
                    }
                }
            });

            if (modVersion.supportedGameVersionIds.length == 0) {
                throw new Error(`ModVersion must support at least one game version.`);
            }

            let gameVersions = await this.GameVersions.findAll({ where: { id: modVersion.supportedGameVersionIds } });
            if (gameVersions.length == 0) {
                throw new Error(`No valid game versions found.`);
            }

            if (gameVersions.length != modVersion.supportedGameVersionIds.length) {
                throw new Error(`Invalid game version(s) found.`);
            }

            for (let gameVersion of gameVersions) {
                if (gameVersion.gameName != parentMod.gameName) {
                    throw new Error(`ModVersion must only have game versions for the parent mod's game.`);
                }
            }
        });

        // this is just to make sure that there is always a default version for a game, as otherwise a bunch of endpoints won't know what to do.
        this.GameVersions.beforeCreate(async (gameVersion) => {
            await GameVersion.findOne({ where: { gameName: gameVersion.gameName, defaultVersion: true }}).then((existingVersion) => {
                if (!existingVersion) {
                    gameVersion.defaultVersion = true;
                }
            });
        });

        this.EditApprovalQueue.beforeCreate(async (queueItem) => {
            if (!queueItem.isMod() && !queueItem.isModVersion()) {
                throw new Error(`Invalid object type.`);
            }
        });
    }
    // #endregion
}
// #region User
export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
    declare readonly id: CreationOptional<number>;
    declare username: string;
    declare githubId: string;
    declare discordId: string;
    declare sponsorUrl: string;
    declare displayName: string;
    declare bio: string;
    declare roles: UserRolesObject;
    declare readonly createdAt: CreationOptional<Date>;
    declare readonly updatedAt: CreationOptional<Date>;

    public addSiteWideRole(role: UserRoles) {
        if (!this.roles.sitewide.includes(role)) {
            this.roles = {
                sitewide: [...this.roles.sitewide, role],
                perGame: this.roles.perGame,
            };
            this.save();
        } else {
            Logger.warn(`User ${this.username} already has role ${role}`);
        }
    }

    public toAPIResponse(): UserAPIResponse {
        return {
            id: this.id,
            username: this.username,
            githubId: this.githubId,
            sponsorUrl: this.sponsorUrl,
            displayName: this.displayName,
            bio: this.bio,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}

export interface UserRolesObject {
    sitewide: UserRoles[];
    perGame: {
        [gameName in SupportedGames]?: UserRoles[];
    }
}

export enum UserRoles {
    AllPermissions = `allpermissions`,
    Admin = `admin`,
    Poster = `poster`,
    Approver = `approver`,
    Moderator = `moderator`,
    Banned = `banned`,
}

export interface UserAPIResponse {
    id: number;
    username: string;
    githubId: string;
    sponsorUrl: string;
    displayName: string;
    bio: string;
    createdAt?: Date;
    updatedAt?: Date;
}
// #endregion
// #region GameVersion
export type APIGameVersion = InferAttributes<GameVersion, { omit: `createdAt` | `updatedAt` }>;
export class GameVersion extends Model<InferAttributes<GameVersion>, InferCreationAttributes<GameVersion>> {
    declare readonly id: CreationOptional<number>;
    declare gameName: SupportedGames;
    declare version: string; // semver-esc version (e.g. 1.29.1)
    declare defaultVersion: boolean;
    declare readonly createdAt: CreationOptional<Date>;
    declare readonly updatedAt: CreationOptional<Date>;

    public toAPIResponse() {
        return {
            id: this.id,
            gameName: this.gameName,
            version: this.version,
            defaultVersion: this.defaultVersion,
        };
    }

    public static async getDefaultVersion(gameName: SupportedGames): Promise<string | null> {
        let version = DatabaseHelper.cache.gameVersions.find((version) => version.gameName == gameName && version.defaultVersion == true);
        if (!version) {
            version = await DatabaseHelper.database.GameVersions.findOne({ where: { gameName, defaultVersion: true } });
        }
        if (!version) {
            return null;
        }
        return version.version;
    }

    public static async getDefaultVersionObject(gameName: SupportedGames): Promise<GameVersion | null> {
        let version = DatabaseHelper.cache.gameVersions.find((version) => version.gameName == gameName && version.defaultVersion == true);
        if (!version) {
            version = await DatabaseHelper.database.GameVersions.findOne({ where: { gameName, defaultVersion: true } });
        }
        return version;
    }
}
// #endregion
// #region Mod
export class Mod extends Model<InferAttributes<Mod>, InferCreationAttributes<Mod>> {
    declare readonly id: CreationOptional<number>;
    declare name: string;
    declare summary: string;
    declare description: string;
    declare gameName: SupportedGames;
    declare category: Categories;
    declare authorIds: number[];
    declare status: Status;
    declare iconFileName: string;
    declare gitUrl: string;
    declare lastApprovedById: number;
    declare lastUpdatedById: number;
    declare readonly createdAt: CreationOptional<Date>;
    declare readonly updatedAt: CreationOptional<Date>;

    public async getLatestVersion(gameVersion: number, platform:Platform = Platform.Universal, onlyApproved = false): Promise<ModVersion | null> {
        let versions = DatabaseHelper.cache.modVersions.filter((version) => version.modId == this.id && (version.platform == platform || version.platform == Platform.Universal));
        if (!versions) {
            versions = await DatabaseHelper.database.ModVersions.findAll({ where: { modId: this.id, [Op.or]: [{ platform: platform }, { platform: Platform.Universal }] } });
        }
        let latestVersion: ModVersion | null = null;
        for (let version of versions) {
            if (version.supportedGameVersionIds.includes(gameVersion)) {
                if ((!latestVersion || version.modVersion.compare(latestVersion.modVersion) > 0) && (!onlyApproved || version.status == Status.Verified)) {
                    latestVersion = version;
                }
            }
        }
        return latestVersion;
    }

    public async setStatus(status:Status, user: User) {
        this.status = status;
        try {
            await this.save();
        } catch (error) {
            Logger.error(`Error setting status: ${error}`);
            throw error;
        }
        Logger.log(`Mod ${this.id} approved by ${user.username}`);
        switch (status) {
            case Status.Unverified:
                sendModLog(this, user, `New`);
                break;
            case Status.Verified:
                sendModLog(this, user, `Approved`);
                break;
            case Status.Removed:
                sendModLog(this, user, `Rejected`);
                break;
        }
        return this;
    }

    public static async checkForExistingMod(name: string) {
        let mod = await DatabaseHelper.database.Mods.findOne({ where: { name } });
        return mod;
    }

    public static async countExistingMods(name: string) {
        let count = await DatabaseHelper.database.Mods.count({ where: { name } });
        return count;
    }

    public toAPIResponse(): ModAPIResponse {
        return {
            id: this.id,
            name: this.name,
            summary: this.summary,
            description: this.description,
            gameName: this.gameName,
            category: this.category,
            authors: DatabaseHelper.cache.users.filter((user) => this.authorIds.includes(user.id)).map((user) => user.toAPIResponse()),
            status: this.status,
            iconFileName: this.iconFileName,
            gitUrl: this.gitUrl,
            lastApprovedById: this.lastApprovedById,
            lastUpdatedById: this.lastUpdatedById,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
export interface ModAPIResponse {
    id: number;
    name: string;
    summary: string;
    description: string;
    gameName: SupportedGames;
    category: Categories;
    authors: UserAPIResponse[];
    status: Status;
    iconFileName: string;
    gitUrl: string;
    lastApprovedById: number;
    lastUpdatedById: number;
    createdAt: Date;
    updatedAt: Date;
}
// #endregion
// #region ModVersion
export class ModVersion extends Model<InferAttributes<ModVersion>, InferCreationAttributes<ModVersion>> {
    declare readonly id: number;
    declare modId: number;
    declare authorId: number;
    declare modVersion: SemVer;
    declare supportedGameVersionIds: number[];
    declare status: Status;
    declare dependencies: number[]; // array of modVersion ids
    declare platform: Platform;
    declare zipHash: string;
    declare contentHashes: ContentHash[];
    declare downloadCount: number;
    declare lastApprovedById: number;
    declare lastUpdatedById: number;
    declare readonly createdAt: Date;
    declare readonly updatedAt: Date;

    public async setStatus(status:Status, user: User) {
        this.status = status;
        try {
            await this.save();
        } catch (error) {
            Logger.error(`Error setting status: ${error}`);
            throw error;
        }
        Logger.log(`Mod ${this.id} approved by ${user.username}`);
        switch (status) {
            case Status.Unverified:
                sendModVersionLog(this, user, `New`);
                break;
            case Status.Verified:
                sendModVersionLog(this, user, `Approved`);
                break;
            case Status.Removed:
                sendModVersionLog(this, user, `Rejected`);
                break;
        }
        return this;
    }

    // this function called to see if a duplicate version already exists in the database. if it does, creation of a new version should be halted.
    public static async checkForExistingVersion(modId: number, semver: SemVer, platform:Platform): Promise<ModVersion | null> {
        let modVersion = DatabaseHelper.database.ModVersions.findOne({ where: { modId, modVersion: semver.raw, platform, [Op.or]: [{status: Status.Verified}, {status: Status.Unverified}, {status: Status.Private }] } });
        return modVersion;
    }

    public static async countExistingVersions(modId: number, semver: SemVer, platform:Platform): Promise<number> {
        let count = DatabaseHelper.database.ModVersions.count({ where: { modId, modVersion: semver.raw, platform, [Op.or]: [{status: Status.Verified}, {status: Status.Unverified}] } });
        return count;
    }

    public async getSupportedGameVersions(): Promise<APIGameVersion[]> {
        let gameVersions: APIGameVersion[] = [];
        for (let versionId of this.supportedGameVersionIds) {
            let version = DatabaseHelper.cache.gameVersions.find((version) => version.id == versionId);
            if (!version) {
                version = await DatabaseHelper.database.GameVersions.findByPk(versionId);
            }

            if (version) {
                gameVersions.push(version.toAPIResponse());
            }

        }
        return gameVersions;
    }

    public async getDependencies(gameVersionId: number, platform: Platform, onlyApproved = false): Promise<ModVersion[]> {
        let dependencies: ModVersion[] = [];
        for (let dependancyId of this.dependencies) {
            let dependancy = DatabaseHelper.cache.modVersions.find((version) => version.id == dependancyId);
            if (!dependancy) {
                dependancy = await DatabaseHelper.database.ModVersions.findByPk(dependancyId);
            }

            if (dependancy) {
                let mod = DatabaseHelper.cache.mods.find((mod) => mod.id == dependancy?.modId);
                let latest = await mod.getLatestVersion(gameVersionId, platform, onlyApproved);
                if (latest && await ModVersion.isValidDependancySucessor(dependancy, latest, gameVersionId)) {
                    dependencies.push(latest);
                } else {
                    dependencies.push(dependancy);
                }
            } else {
                Config.devmode ? Logger.warn(`ModVersion ${dependancyId} not found in cache or database.`) : null;
            }
        }
        return dependencies;
    }
    // this function is for when a mod supports a newer version but the dependancy does not. (uses ^x.x.x for comparison)
    public static async isValidDependancySucessor(originalVersion:ModVersion, newVersion:ModVersion, forVersion: number): Promise<boolean> {
        let newGameVersions = await newVersion.getSupportedGameVersions();

        if (!newGameVersions.find((version) => version.id == forVersion)) {
            return false;
        }

        return satisfies(newVersion.modVersion, `^${originalVersion.modVersion.raw}`);
    }

    public async toRawAPIResonse() {
        return {
            id: this.id,
            modId: this.modId,
            authorId: this.authorId,
            modVersion: this.modVersion.raw,
            platform: this.platform,
            zipHash: this.zipHash,
            status: this.status,
            dependencies: this.dependencies,
            contentHashes: this.contentHashes,
            supportedGameVersions: this.supportedGameVersionIds,
            downloadCount: this.downloadCount,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }

    public async toAPIResonse(gameVersionId: number = this.supportedGameVersionIds[0], platform = Platform.Universal, onlyApproved = false): Promise<ModVersionAPIResponse> {
        return {
            id: this.id,
            modId: this.modId,
            author: DatabaseHelper.cache.users.find((user) => user.id == this.authorId).toAPIResponse(),
            modVersion: this.modVersion.raw,
            platform: this.platform,
            zipHash: this.zipHash,
            status: this.status,
            dependencies: (await this.getDependencies(gameVersionId, platform, onlyApproved)).flatMap((dependancy) => dependancy.id),
            contentHashes: this.contentHashes,
            downloadCount: this.downloadCount,
            supportedGameVersions: await this.getSupportedGameVersions(),

            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}

export interface ModVersionAPIResponse {
    id: number;
    modId: number;
    author: UserAPIResponse;
    modVersion: string;
    platform: Platform;
    zipHash: string;
    status: Status;
    dependencies: number[];
    contentHashes: ContentHash[];
    supportedGameVersions: APIGameVersion[];
    downloadCount: number;
    lastApprovedById?: number;
    lastUpdatedById?: number;
    createdAt?: Date;
    updatedAt?: Date;
}
// #endregion
// #region EditApprovalQueue
export type ModVersionApproval = InferAttributes<ModVersion, { omit: `modId` | `id` | `createdAt` | `updatedAt` | `authorId` | `status` | `contentHashes` | `zipHash` | `lastApprovedById` | `lastUpdatedById` | `downloadCount` }>
export type ModApproval = InferAttributes<Mod, { omit: `id` | `createdAt` | `updatedAt` | `iconFileName` | `status` | `lastApprovedById` | `lastUpdatedById` }>

//this is gonna be fun :3
export class EditQueue extends Model<InferAttributes<EditQueue>, InferCreationAttributes<EditQueue>> {
    declare readonly id: number;
    declare submitterId: number;
    declare objectId: number;
    declare objectTableName: `modVersions` | `mods`;
    declare object: ModVersionApproval | ModApproval;

    declare approverId: number;
    declare approved: boolean|null; // just use null as a 3rd bit 5head
    declare readonly createdAt: Date;
    declare readonly updatedAt: Date;

    public isModVersion(): this is EditQueue & { objectTableName: `modVersions`, object: ModVersionApproval } {
        return this.objectTableName === `modVersions` && `modVersion` in this.object;
    }

    public isMod(): this is EditQueue & { objTableName: `mods`, object: ModApproval } {
        return this.objectTableName === `mods` && `name` in this.object;
    }

    public async approve(approver: User) {
        if (this.approved) {
            return;
        }
        
        let record: Mod | ModVersion;

        if (this.objectTableName == `modVersions` && `modVersion` in this.object) {
            let modVersion = await DatabaseHelper.database.ModVersions.findByPk(this.objectId);
            if (modVersion) {
                modVersion.modVersion = this.object.modVersion || modVersion.modVersion;
                modVersion.platform = this.object.platform || modVersion.platform;
                modVersion.supportedGameVersionIds = this.object.supportedGameVersionIds || modVersion.supportedGameVersionIds;
                modVersion.dependencies = this.object.dependencies || modVersion.dependencies;
                modVersion.lastApprovedById = approver.id;
                modVersion.lastUpdatedById = this.submitterId;
                modVersion.status = Status.Verified;
                record = await modVersion.save();
            }
        } else if (this.objectTableName == `mods` && `name` in this.object) {
            let mod = await DatabaseHelper.database.Mods.findByPk(this.objectId);
            if (mod) {
                mod.name = this.object.name || mod.name;
                mod.description = this.object.description || mod.description;
                mod.category = this.object.category || mod.category;
                mod.gitUrl = this.object.gitUrl || mod.gitUrl;
                mod.authorIds = this.object.authorIds || mod.authorIds;
                mod.gameName = this.object.gameName || mod.gameName;
                mod.lastApprovedById = approver.id;
                mod.lastUpdatedById = this.submitterId;
                mod.status = Status.Verified;
                record = await mod.save();
            }
        }
        this.approved = true;
        this.approverId = approver.id;
        this.save().then(() => {
            Logger.log(`Edit ${this.id} approved by ${approver.username}`);

            if (this.isMod()) {
                sendModLog(record as Mod, approver, `Approved`);
            } else {
                sendModVersionLog(this.object as ModVersion, approver, `Approved`);
            }
        }).catch((error) => {
            Logger.error(`Error approving edit ${this.id}: ${error}`);
        });
        return record;
    }

    public async deny(approver: User) {
        if (this.approved) {
            return;
        }

        let record = this.isMod() ? await DatabaseHelper.database.Mods.findByPk(this.objectId) : await DatabaseHelper.database.ModVersions.findByPk(this.objectId);
        this.approved = false;
        this.approverId = approver.id;
        this.save().then(() => {
            Logger.log(`Edit ${this.id} denied by ${approver.username}`);
            if (this.isMod()) {
                sendModLog(record as Mod, approver, `Rejected`);
            } else {
                sendModVersionLog(record as ModVersion, approver, `Rejected`);
            }
        }).catch((error) => {
            Logger.error(`Error denying edit ${this.id}: ${error}`);
        });
    }
}
// #endregion
// #region MOTD
export class MOTD extends Model<InferAttributes<MOTD>, InferCreationAttributes<MOTD>> {
    declare readonly id: number;
    declare gameName: SupportedGames;
    declare postType: PostType;
    declare message: string;
    declare translations: Translations;
    declare authorId: number;
    declare startTime: Date;
    declare endTime: Date;
    declare readonly createdAt: Date;
    declare readonly updatedAt: Date;

    public static async getActiveMOTDs(gameName: SupportedGames, getExpired = false): Promise<MOTD[]> {
        if (getExpired == false) {
            return MOTD.findAll({ where: { gameName, startTime: { $lt: new Date(Date.now()) }, endTime: { $gt: new Date(Date.now()) }} });
        } else {
            return MOTD.findAll({ where: { gameName, endTime: { $lt: new Date(Date.now()) }} });
        }
    }
}
// #endregion
// #region Interfaces/Enums
export enum PostType {
    Emergency = `emergency`,
    GameUpdates = `gameupdates`,
    Community = `community`
}

export interface Translations {
    [locale: string]: string;
}

export interface ContentHash {
    path: string;
    hash: string;
}

export enum Platform {
    Steam = `steampc`,
    Oculus = `oculuspc`,
    Universal = `universalpc`,
    // Quest will be one option, as PC does not have individual options for Index, Vive, etc.
    UniversalQuest = `universalquest`,
}

export enum Status {
    Private = `private`,
    Removed = `removed`,
    Unverified = `unverified`,
    Verified = `verified`,
}

export enum Categories {
    Core = `core`, // BSIPA, SongCore, etc
    Essential = `essential`, // Camera2, BeatSaverDownloader, BeatSaverUpdater, etc
    Library = `library`,
    Cosmetic = `cosmetic`,
    PracticeTraining = `practice`,
    Gameplay = `gameplay`,
    StreamTools = `streamtools`,
    UIEnhancements = `ui`,
    Lighting = `lighting`,
    TweaksTools = `tweaks`,
    Multiplayer = `multiplayer`,
    TextChanges = `text`,
    Editor = `editor`,
    Other = `other`,
}
// #endregion

// yoink thankies bstoday & bns
function validateEnumValue(value: string | number, enumType: object): boolean {
    if (Object.values(enumType).includes(value)) {
        return true;
    }
    return false;
}
// #region DatabaseHelper
export class DatabaseHelper {
    public static database: DatabaseManager;
    public static cache: {
        gameVersions: GameVersion[],
        modVersions: ModVersion[],
        mods: Mod[],
        users: User[],
        editApprovalQueue: EditQueue[],
        motd: MOTD[],
    } = {
            gameVersions: [],
            modVersions: [],
            mods: [],
            users: [],
            editApprovalQueue: [],
            motd: [],
        };

    constructor(database: DatabaseManager) {
        DatabaseHelper.database = database;

        DatabaseHelper.refreshAllCaches();
        setInterval(DatabaseHelper.refreshAllCaches, 1000 * 60 * 1);
    }

    public static async refreshAllCaches() {
        DatabaseHelper.cache.gameVersions = await DatabaseHelper.database.GameVersions.findAll();
        DatabaseHelper.cache.modVersions = await DatabaseHelper.database.ModVersions.findAll();
        DatabaseHelper.cache.mods = await DatabaseHelper.database.Mods.findAll();
        DatabaseHelper.cache.users = await DatabaseHelper.database.Users.findAll();
        DatabaseHelper.cache.editApprovalQueue = await DatabaseHelper.database.EditApprovalQueue.findAll();
        DatabaseHelper.cache.motd = await DatabaseHelper.database.MOTDs.findAll();
    }

    public static async refreshCache(tableName: `gameVersions` | `modVersions` | `mods` | `users` | `editApprovalQueue`) {
        switch (tableName) {
            case `gameVersions`:
                DatabaseHelper.cache.gameVersions = await DatabaseHelper.database.GameVersions.findAll();
                break;
            case `modVersions`:
                DatabaseHelper.cache.modVersions = await DatabaseHelper.database.ModVersions.findAll();
                break;
            case `mods`:
                DatabaseHelper.cache.mods = await DatabaseHelper.database.Mods.findAll();
                break;
            case `users`:
                DatabaseHelper.cache.users = await DatabaseHelper.database.Users.findAll();
                break;
            case `editApprovalQueue`:
                DatabaseHelper.cache.editApprovalQueue = await DatabaseHelper.database.EditApprovalQueue.findAll();
                break;
        }
    }

    public static getGameNameFromModId(id: number): SupportedGames | null {
        let mod = DatabaseHelper.cache.mods.find((mod) => mod.id == id);
        if (!mod) {
            return null;
        }
        return mod.gameName;
    }

    public static getGameNameFromModVersionId(id: number): SupportedGames | null {
        let modVersion = DatabaseHelper.cache.modVersions.find((modVersion) => modVersion.id == id);
        if (!modVersion) {
            return null;
        }
        let mod = DatabaseHelper.cache.mods.find((mod) => mod.id == modVersion.modId);
        if (!mod) {
            return null;
        }
        return mod.gameName;
    }

    public static getGameNameFromEditApprovalQueueId(id: number): SupportedGames | null {
        let edit = DatabaseHelper.cache.editApprovalQueue.find((edit) => edit.id == id);
        if (!edit) {
            return null;
        }
        if (edit.objectTableName == `mods` && `gameName` in edit.object) {
            return edit.object.gameName;
        } else if (edit.objectTableName == `modVersions`) {
            return DatabaseHelper.getGameNameFromModVersionId(edit.objectId);
        }
    }

    public static isValidPlatform(value: string): value is Platform {
        return validateEnumValue(value, Platform);
    }
    
    public static isValidVisibility(value: string): value is Status {
        return validateEnumValue(value, Status);
    }

    public static isValidCategory(value: string): value is Categories {
        return validateEnumValue(value, Categories);
    }

    public static isValidGameName(name: string): name is SupportedGames {
        if (!name) {
            return false;
        }
        return validateEnumValue(name, SupportedGames);
    }

    public static async isValidGameVersion(gameName: string, version: string): Promise<number | null> {
        if (!gameName || !version) {
            return null;
        }

        if (!DatabaseHelper.isValidGameName(gameName)) {
            return null;
        }

        let game = await DatabaseHelper.database.GameVersions.findOne({ where: { gameName: gameName, version: version } });
        return game ? game.id : null;
    }

    public static isValidPostType(value: string): value is PostType {
        return validateEnumValue(value, PostType);
    }
}
// #endregion