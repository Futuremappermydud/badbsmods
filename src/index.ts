import express from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import { HTTPTools } from './shared/HTTPTools';
import { DatabaseHelper, DatabaseManager } from './shared/Database';
import fileUpload from 'express-fileupload';
import { CreateModRoutes } from './api/routes/createMod';
import rateLimit from 'express-rate-limit';
import { Logger } from './shared/Logger';
import { GetModRoutes } from './api/routes/getMod';
import { Config } from './shared/Config';
import { UpdateModRoutes } from './api/routes/updateMod';
import { AuthRoutes } from './api/routes/auth';
import { VersionsRoutes } from './api/routes/versions';
import { ImportRoutes } from './api/routes/import';
import { AdminRoutes } from './api/routes/admin';
import { ApprovalRoutes } from './api/routes/approval';
import { Luma } from './discord/classes/Luma';
import { ActivityType } from 'discord.js';
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from './api/swagger.json';
import { BeatModsRoutes } from './api/routes/beatmods';
import { CDNRoutes } from './api/routes/cdn';
import cors from 'cors';
import { MOTDRoutes } from './api/routes/motd';
import { UserRoutes } from './api/routes/users';

console.log(`Starting setup...`);
new Config();
const app = express();
const memstore = MemoryStore(session);
const port = Config.server.port;
let database = new DatabaseManager();

if (Config.bot.enabled) {
    const luma = new Luma({
        intents: [],
        presence: {activities: [{name: `with your mods`, type: ActivityType.Playing}], status: `online`}});
    luma.login(Config.bot.token);
}

// handle parsing request bodies
app.use(express.json({ limit: 100000 }));
app.use(express.urlencoded({limit : 10000, parameterLimit: 10, extended: false }));
app.use(cors({
    origin: Config.server.corsOrigins,
    credentials: Config.server.iHateSecurity ? true : false,
}));
app.use(fileUpload({
    limits: {
        fileSize: 75 * 1024 * 1024, // here you go kaitlyn
        files: 1
    },
    abortOnLimit: true,
}));

// rate limiting
app.use(/\/cdn|\/favicon\.ico|\/banner\.png/, rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    statusCode: 429,
    message: `Rate limit exceeded.`,
    skipSuccessfulRequests: false,
}));

app.use(`/api`, rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    statusCode: 429,
    message: `Rate limit exceeded.`,
    skipSuccessfulRequests: false,
}));

// session handling
app.use(session({
    secret: Config.server.sessionSecret,
    name: `bbm_session`,
    store: new memstore({
        checkPeriod: 86400000
    }),
    resave: false,
    saveUninitialized: false,
    unset: `destroy`,
    cookie: {
        maxAge: 86400000,
        secure: `auto`,
        httpOnly: true,
        sameSite: Config.server.iHateSecurity ? `none` : `strict`,
    }
}));
app.set(`trust proxy`, `uniquelocal, loopback`);

app.use((req, res, next) => {
    if (Config.devmode) {
        if (Config.authBypass) {
            req.session.userId = 1;
        }
        console.log(req.url);
    }
    next();
});

//app.use(`/api`, Validator.runValidator);

new BeatModsRoutes(app);
new CreateModRoutes(app);
new GetModRoutes(app);
new UpdateModRoutes(app);
new ApprovalRoutes(app);
new AuthRoutes(app);
new ImportRoutes(app);
new AdminRoutes(app);
new VersionsRoutes(app);
new MOTDRoutes(app);
new UserRoutes(app);

swaggerDocument.host = Config.server.url.replace(`http://`, ``).replace(`https://`, ``);
app.use(`/api/docs`, swaggerUi.serve, swaggerUi.setup(swaggerDocument));

new CDNRoutes(app);

HTTPTools.handleExpressShenanigans(app);

async function startServer() {
    await database.init();
    app.listen(port, () => {
        console.log(`Server listening @ http://localhost:${port}`);
        Config.devmode ? Logger.warn(`Development mode is enabled!`) : null;
        Config.authBypass ? Logger.warn(`Authentication bypass is enabled!`) : null;
        Config.devmode ? console.log(`API docs @ http://localhost:${port}/api/docs`) : null;
    });
}
startServer();

process.on(`exit`, (code) => {
    Logger.log(`Process exiting with code ${code}`);
});

process.on(`SIGTERM`, () => {
    Logger.log(`Received SIGTERM, exiting.`);
    DatabaseHelper.database.sequelize.close();
    process.exit(0);
});

process.on(`SIGINT`, () => {
    Logger.log(`Received SIGINT, exiting.`);
    DatabaseHelper.database.sequelize.close();
    process.exit(0);
});

process.on(`SIGQUIT`, () => {
    Logger.log(`Received SIGQUIT, exiting.`);
    DatabaseHelper.database.sequelize.close();
    process.exit(0);
});

process.on(`unhandledRejection`, (reason: Error | any, promise: Promise<any>) => {
    if (reason instanceof Error) {
        Logger.error(`Unhandled promise rejection:${reason.name}\n${reason.message}\n${reason.stack}`, `node.js`);
    } else {
        Logger.error(`Unhandled promise rejection:${reason}\n`, `node.js`);
    }
    process.exit(1);
});

console.log(`Setup complete.`);