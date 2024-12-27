import { Express } from 'express';
import express from 'express';
import path from 'path';
import { Config } from '../../shared/Config';
import fs from 'fs';
import { DatabaseHelper } from '../../shared/Database';
import { Logger } from '../../shared/Logger';

export class CDNRoutes {
    private app: Express;

    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.get(`/favicon.ico`, (req, res) => {
            res.sendFile(path.resolve(`./assets/favicon.png`), {
                maxAge: 1000 * 60 * 60 * 24 * 1,
                //immutable: true,
                lastModified: true,
            });
        });
        
        this.app.get(`/banner.png`, (req, res) => {
            res.sendFile(path.resolve(`./assets/banner.png`), {
                maxAge: 1000 * 60 * 60 * 24 * 1,
                //immutable: true,
                lastModified: true,
            });
        });
        
        this.app.use(`/cdn/icon`, express.static(path.resolve(Config.storage.iconsDir), {
            extensions: [`png`],
            dotfiles: `ignore`,
            immutable: true,
            index: false,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            fallthrough: false,
        }));
        
        this.app.use(`/cdn/mod`, express.static(path.resolve(Config.storage.modsDir), {
            extensions: [`zip`],
            dotfiles: `ignore`,
            immutable: true,
            maxAge: 1000 * 60 * 60 * 24 * 7,
            setHeaders: (res, file) => { // this is a hacky workaround to get code to execute when a file is served, but it should work with minimal preformance impact
                res.set(`Content-Disposition`, `attachment`);
                let hash = path.basename(file).replace(path.extname(file), ``);
                DatabaseHelper.database.ModVersions.findOne({ where: { zipHash: hash } }).then((version) => {
                    version.increment(`downloadCount`);
                }).catch((error) => {
                    Config.devmode ? Logger.warn(`Error incrementing download count: ${error}`) : null;
                });
            },
            fallthrough: false,
        }));

        if (Config.devmode && fs.existsSync(path.resolve(`./storage/frontend`))) {
            this.app.use(`/`, express.static(path.resolve(`./storage/frontend`), {
                dotfiles: `ignore`,
                immutable: false,
                index: true,
                maxAge: 1000 * 60 * 60 * 1,
                fallthrough: true,
            }));
        }
    }
}