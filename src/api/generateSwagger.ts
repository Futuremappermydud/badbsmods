import swaggerAutogen from 'swagger-autogen';

// docs: https://swagger-autogen.github.io/docs/getting-started/quick-start/
const doc = {
    info: {
        title: `BadBeatMods API`,
        description: `This isn't really fully complete, but its better than absolutely nothing.\n\nThis API documentation is automatically generated and therefor may not be 100% accurate and may be missing a few fields.`,
        version: `0.0.1`,
    },
    host: `bbm.saera.gay`,
    basePath: `/`,
    consumes: [`application/json`, `multipart/form-data`, `application/x-www-form-urlencoded`],
    produces: [`application/json`],
    schemes: [`https`, `http`],
    tags: [
        { name: `Mods`, description: `Mod related endpoints` },
        { name: `Auth`, description: `Authentication related endpoints` },
        { name: `Versions`, description: `Version Management` },
        { name: `Admin`, description: `Admin related endpoints` },
        { name: `Approval`, description: `Approval related endpoints` },
        { name: `MOTD`, description: `Message of the Day related endpoints` },
        { name: `Users`, description: `User related endpoints` },
        { name: `BeatMods`, description: `Legacy BeatMods API endpoints` },
    ],
};

const outputFile = `./swagger.json`;
const routes = [
    `./routes/beatmods.ts`,
    `./routes/getMod.ts`,
    `./routes/createMod.ts`,
    `./routes/updateMod.ts`,
    `./routes/auth.ts`,
    `./routes/versions.ts`,
    `./routes/import.ts`,
    `./routes/admin.ts`,
    `./routes/approval.ts`,
    `./routes/motd.ts`,
    `./routes/users.ts`,
];

swaggerAutogen()(outputFile, routes, doc);