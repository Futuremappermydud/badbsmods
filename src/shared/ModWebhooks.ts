import { WebhookClient } from "discord.js";
import { DatabaseHelper, Mod, ModVersion, Platform, User } from "./Database";
import { Config } from "./Config";
import { Logger } from "./Logger";

let webhookClient: WebhookClient;

export async function sendModLog(mod: Mod, userMakingChanges:User, action: `New` | `Approved` | `Rejected`) {
    if (Config.webhooks.enableWebhooks) {
        if (!webhookClient) {
            webhookClient = new WebhookClient({ url: Config.webhooks.modLogUrl });
        }
        let authors:User[] = [];
        for (let author of mod.authorIds) {
            let authorDb = await DatabaseHelper.database.Users.findOne({ where: { id: author } });
            if (!authorDb) {
                continue;
            }
            authors.push(authorDb);
        }
        if (authors.length === 0) {
            return Logger.error(`No authors found for mod ${mod.name}`);
        }

        let color = 0x00FF00;

        if (action === `Rejected`) {
            color = 0xFF0000;
        } else if (action === `Approved`) {
            color = 0x0000FF;
        }

        webhookClient.send({
            username: `BadBeatMods`,
            avatarURL: `${Config.server.url}/favicon.ico`,
            embeds: [
                {
                    title: `${action} Mod: ${mod.name}`,
                    url: `${Config.server.url}/api/mod/${mod.id}`,
                    description: `${mod.description} `,
                    author: {
                        name: `${userMakingChanges.username} `,
                        icon_url: userMakingChanges.username === `ServerAdmin` ? `${Config.server.url}/favicon.ico` : `https://github.com/${userMakingChanges.username}.png`,
                    },
                    fields: [
                        {
                            name: `Authors`,
                            value: `${authors.map(author => { return author.username; }).join(`, `)} `,
                            inline: true,
                        },
                        {
                            name: `Category`,
                            value: `${mod.category} `,
                            inline: true,
                        },
                        {
                            name: `Git URL`,
                            value: `${mod.gitUrl} `,
                            inline: false,
                        },
                        
                    ],
                    thumbnail: {
                        url: `${Config.server.url}/cdn/icon/${mod.iconFileName}`,
                    },
                    color: color,
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `Mod ID: ${mod.id}`,
                        icon_url: `${Config.server.url}/favicon.ico`,
                    },
                },
            ],
        });
    }
}

export async function sendModVersionLog(modVersion: ModVersion, userMakingChanges:User, action: `New` | `Approved` | `Rejected`, modObj?:Mod) {
    if (Config.webhooks.enableWebhooks) {
        if (!webhookClient) {
            webhookClient = new WebhookClient({ url: Config.webhooks.modLogUrl });
        }
        let author = await DatabaseHelper.database.Users.findOne({ where: { id: modVersion.authorId } });
        let mod = modObj ? modObj : await DatabaseHelper.database.Mods.findOne({ where: { id: modVersion.modId } });
        let gameVersions = await modVersion.getSupportedGameVersions();
        let dependancies: string[] = [];
        for (let dependancy of (await modVersion.getDependencies(gameVersions[0].id, Platform.Universal, false))) {
            let dependancyMod = await DatabaseHelper.database.Mods.findOne({ where: { id: dependancy.modId } });
            if (!dependancyMod) {
                return Logger.warn(`Dependancy mod ${dependancy.modId} not found for mod version ${modVersion.id}`);
            }
            dependancies.push(`${dependancyMod.name} v${dependancy.modVersion.raw}`);
        }
        

        let color = 0x00FF00;

        if (action === `Rejected`) {
            color = 0xFF0000;
        } else if (action === `Approved`) {
            color = 0x0000FF;
        }

        webhookClient.send({
            username: `BadBeatMods`,
            avatarURL: `${Config.server.url}/favicon.ico`,
            embeds: [
                {
                    title: `${action} Mod Version: ${mod.name} v${modVersion.modVersion.raw}`,
                    url: `${Config.server.url}/api/modversion/${modVersion.id}`,
                    description: `${mod.description} `,
                    author: {
                        name: `${userMakingChanges.username} `,
                        icon_url: userMakingChanges.username === `ServerAdmin` ? `${Config.server.url}/favicon.ico` : `https://github.com/${userMakingChanges.username}.png`,
                    },
                    fields: [
                        {
                            name: `Author`,
                            value: `${author.username} `,
                            inline: true,
                        },
                        {
                            name: `Platform`,
                            value: `${modVersion.platform} `,
                            inline: true,
                        },
                        {
                            name: `# of Files`,
                            value: `${modVersion.contentHashes.length} `,
                            inline: true,
                        },
                        {
                            name: `Game Versions`,
                            value: `${gameVersions.map((v) => v.version).join(`, `)} `,
                            inline: true,
                        },
                        {
                            name: `Dependencies`,
                            value: `${dependancies.join(`, `)} `,
                            inline: true,
                        },
                    ],
                    thumbnail: {
                        url: `${Config.server.url}/cdn/icon/${mod.iconFileName}`,
                    },
                    color: color,
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `Mod ID: ${mod.id} | Mod Version ID: ${modVersion.id}`,
                        icon_url: `${Config.server.url}/favicon.ico`,
                    },
                },
            ],
        });
    }
}