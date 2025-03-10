import { CommandInteraction, SlashCommandBuilder, Routes, REST, RESTGetAPIApplicationCommandResult, Collection, AutocompleteInteraction } from "discord.js";
import * as fs from 'fs';
import * as path from 'path';
import { Luma } from "./Luma";
import { Config } from "../../shared/Config";

export interface ICommand {
    data:SlashCommandBuilder;
    guilds?:string[];
    execute: (luma: Luma, interaction: CommandInteraction) => Promise<any>;
    autocomplete?:(luma: Luma, interaction: AutocompleteInteraction) => Promise<any>;
}

export class Command {
    public data: SlashCommandBuilder;
    public guilds: string[] = [];
    public execute: (luma: Luma, interaction: CommandInteraction) => Promise<any>;
    public autocomplete?: (luma: Luma, interaction: AutocompleteInteraction) => Promise<any>;
    public id?: string;

    constructor(command: ICommand) {
        this.data = command.data;
        this.execute = command.execute;
        if (command.guilds != undefined) {
            if (command.guilds.length != 0) {
                this.guilds = command.guilds;
            }
        }
        if (command.autocomplete) {
            this.autocomplete = command.autocomplete;
        }
    }

    public async updateCommand(luma: Luma) {
        let rest = new REST({ version: `10` }).setToken(Config.bot.token);

        rest.patch(Routes.applicationCommand(Config.bot.clientId, this.id), { body: this.data.toJSON() })
            .then((response) => {
                let response2: RESTGetAPIApplicationCommandResult = response as RESTGetAPIApplicationCommandResult;
                this.id = response2.id;
                luma.logger.log(`Patched command (${this.data.name})`, `Update Command`);
            })
            .catch(error => {
                luma.logger.error(error, `Update Command`);
            }
            );
    }

    public async runCommand(luma: Luma, interaction: CommandInteraction) {
        luma.logger.log(`<@!${interaction.user.id}> ran ${this.data.name}: ${interaction.commandName}`, `Interactions`);

        try {
            await this.execute(luma, interaction);
        } catch (error: any) {
            console.error(error);
            luma.logger.warn(`Interaction (${interaction.commandName}) did not reply.`, `Interactions`);
        }
    }
}

export function loadCommands(luma: Luma, commandsPath?: string) {
    luma.commands = new Collection<string, Command>();

    let commandsDirectory: string;
    if (commandsPath) {
        commandsDirectory = commandsPath;
    } else {
        commandsDirectory = path.resolve(__dirname);
    }

    fs.readdirSync(path.join(commandsDirectory), { withFileTypes: true })
        .filter((item) => !item.isDirectory() && item.name.endsWith(`.js`))
        .forEach(item => {
            let fileName: string = item.name;
            let filePath = path.join(commandsDirectory, fileName);
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const commandFile = require(filePath);
                let command: Command = commandFile.command;
                luma.commands.set(command.data.name, command);
            } catch (error) {
                luma.logger.error(`Error when trying to load \`${filePath}\`\n\`\`\`${error}\`\`\``, `commandLoader`);
            }
        });
}