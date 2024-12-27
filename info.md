![BadBSMods](https://github.com/Saeraphinx/badbsmods/blob/main/assets/banner.png)
# BadBeatMods
A game-agnostic BeatMods replacement.

BadBSMods/BadBeatMods (haven't decided which name to go through with yet, badbsmods is just what I keep calling it on accident, so it might be better to go with that tbh) is a (currently backend only) replacement for [BeatMods](https://github.com/bsmg/BeatMods-Website). It functions in a very different way from BeatMods though. Some big points being that mods do not need to be reuploaded for every single version, and supports multiple games. It is written in Typescript, and primarially uses Express & Sequelize. It is still very much in active development, so please do keep that in mind. You can find all of the models for the database in [`src/shared/Database.ts`](https://github.com/Saeraphinx/badbsmods/blob/main/src/shared/Database.ts). The server is written with the intent of using SQLite as its main database, but it should support postgres (and in theory every database that Sequelize supports).

If anyone has any questions, comments, or feature requests, please let me (Saera) know as soon as possible. This is the best time to tell me to change something.
## Todo list
See [TODO.md](https://github.com/Saeraphinx/badbsmods/blob/main/TODO.md)

## Main Differences & Things to Note
I might be missing a few things, but I'm pretty sure this list has all of the major points.
- Mods do NOT need to be reuploaded for new game versions (assuming nothing breaks in the mod, or the mod doesn't need a dependancy bump/fixes).
- Mods MUST have an icon (A default one is available if an icon is not specified).
- Mod metadata is updatable without a reupload.
- Game version aliases from BeatMods do not exist.
- Accounts are made using GitHub OAuth2. You are able to link your Discord account for contact only.
- Users can have profiles (see `User` in the Database).
- The `required` field from BeatMods is not present. It has been replaced with the "core" and "essentials" library.
- Old BeatMods endpoint now requires the `gameVersion` parameter (it will assume the game's default version if not provided).
- In order to reduce calls to the database, the server caches all DB tables. It refreshes this cache every 60 seconds.

## Rules/Goals of a ModVersion
A ModVersion can (atm) share a version with other versions provided the version string & platform string (steampc/oculuspc/universalpc) is unique.  
An example of allowed overlaps would be:
- Heck v1.0.0 (verified)
- Heck v1.0.0 (denied)
- Heck v1.0.0+1.39.0 (unverified)
- Heck v1.0.0+1.40.0 (verified)
 
An example of a prohibited overlap would be:
- Heck v1.0.0 (verified)
- Heck v1.0.0 (verified)

also prohibited is:
- Heck v1.0.0 (verified)
- Heck v1.0.0 (unverified)

A ModVersion can support multiple versions:
- BSIPA v4.3.5 supports versions 1.37.1 through 1.39.1
- NotOutYet v1.0.0 supports versions 0.11.2 through 1.40.0

Dependancies should be marked for the oldest supported GameVersion that the mod is marked as supporting. ModVersions that have a dependancy on another ModVersion that has not been marked as compatible with the requested versions will attempt to resolve a newer dependancy. It will not mark a version as a valid dependancy sucessor if any of the following is true:
- The original dependancy version supports the requested GameVersion
- The newer dependancy does not support the requested GameVersion
- The newer dependancy does not satisfy the check [``return satisfies(newVersion.modVersion, `^${originalVersion.modVersion.raw}\`);``](https://github.com/Saeraphinx/badbsmods/blob/63620b2f33d141175088e81c481eb988eb95b82e/src/shared/Database.ts#L557)` (e.g. ^{original version semver}).

## Rules/Goals of a Mod
A Mod stores all of the metadata for a mod (think name, description, authors, git url, etc).

Mods are required to have unique names. That's it. The name is matched using Sequalize's `Op.eq` (exact).

<!--## How are mods done differently?
> [!NOTE]
> This section is not complete, and might be inaccurate due to the project still being in active development.

In BadBeatMods, mods are stored in two parts:
1. `Mod`, responsible for mod metadata (such as name, description, gitUrl, category, etc), and
2. `ModVersion`, responsible for the zip file itself (such as hashes, dependancies, version, supportedGameVersion, platform, etc)
  
The process of uploading a new mod would look something like this:
1. Create a `Mod`, and fill in information
2. Using the `Mod`'s id that you just created, you'll make a new `ModVersion`, and supply it with the list of dependancies (which is an array of `ModVersion` IDs, the Mod Version (in SemVer), and the supported game versions), along with everything else it requires--->

