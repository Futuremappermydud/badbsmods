import { z } from "zod";
import { Categories, DatabaseHelper, GameVersion, ModVersion, Platform, Status, SupportedGames, User, Mod } from "./Database";
import { valid } from "semver";

// from ./Database.ts
const ZodMod = z.object({
    id: z.number().int().positive(),
    name: z.string().min(3).max(64),
    summary: z.string().min(3).max(200),
    description: z.string().min(3).max(4096),
    category: z.nativeEnum(Categories),
    gitUrl: z.string().min(5).max(256).url(),
    gameName: z.nativeEnum(SupportedGames), //z.string().min(3).max(256),
    authorIds: z.array(z.number().int().positive())
});

// from ./Database.ts
const ZodModVersion = z.object({
    id: z.number().int().positive(),
    modId: z.number().int().positive(),
    supportedGameVersionIds: z.array(z.number().int().positive()),
    modVersion: z.string().refine(valid, { message: `Invalid SemVer` }),
    dependencies: z.array(z.number().int().positive()),
    platform: z.nativeEnum(Platform),
    status: z.nativeEnum(Status),
});

export class Validator {
    public static readonly zDBID = z.number().int().positive();
    public static readonly zBool = z.boolean();
    public static readonly zStatus = z.nativeEnum(Status);
    public static readonly zCreateMod = ZodMod.pick({
        name: true,
        summary: true,
        description: true,
        category: true,
        gitUrl: true,
        gameName: true,
    }).required().strict();

    public static readonly zUploadModVersion = ZodModVersion.pick({
        supportedGameVersionIds: true,
        modVersion: true,
        dependencies: true,
        platform: true,
    }).required().strict();

    public static readonly zUpdateMod = ZodMod.pick({
        name: true,
        summary: true,
        description: true,
        category: true,
        gitUrl: true,
        gameName: true,
        authorIds: true,
    }).optional();

    public static readonly zUpdateModVersion = ZodModVersion.pick({
        supportedGameVersionIds: true,
        modVersion: true,
        dependencies: true,
        platform: true,
    }).optional();

    public static async validateIDArray(ids: number[], tableName:TableNames, allowEmpty: boolean = false): Promise<boolean> {
        if (ids.length == 0 && allowEmpty !== true) {
            return false;
        }

        if (ids.every(id => Validator.zDBID.safeParse(id).success) == false) {
            return false;
        }

        let records: Mod[]|ModVersion[]|User[]|GameVersion[] = [];
        switch (tableName) {
            case `mods`:
                records = await DatabaseHelper.database.Mods.findAll({ where: { id: ids } });
                break;
            case `modVersions`:
                records = await DatabaseHelper.database.ModVersions.findAll({ where: { id: ids } });
                break;
            case `users`:
                records = await DatabaseHelper.database.Users.findAll({ where: { id: ids } });
                break;
            case `gameVersions`:
                records = await DatabaseHelper.database.GameVersions.findAll({ where: { id: ids } });
                break;
            default:
                return false;
        }

        if (records.length != ids.length) {
            return false;
        }

        return true;
    }
}

type TableNames = `mods` | `modVersions` | `users` | `gameVersions` ;