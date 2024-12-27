import { Express } from 'express';
import { DatabaseHelper, MOTD, SupportedGames, UserRoles } from '../../shared/Database';
import { validateSession } from '../../shared/AuthHelper';
import { HTTPTools } from '../../shared/HTTPTools';

export class MOTDRoutes {
    private app: Express;
    constructor(app: Express) {
        this.app = app;
        this.loadRoutes();
    }

    private async loadRoutes() {
        this.app.get(`/api/motd`, async (req, res) => {
            // #swagger.tags = ['MOTD']

            let gameName = req.query.gameName;
            if (gameName && (typeof gameName !== `string` || DatabaseHelper.isValidGameName(gameName) == false)) {
                gameName = SupportedGames.BeatSaber;
            }

            let motds = MOTD.getActiveMOTDs(gameName as SupportedGames, false);
            return res.status(200).send({ messages: motds });
        });

        this.app.post(`/api/motd`, async (req, res) => {
            // #swagger.tags = ['MOTD']
            let gameName = req.query.gameName;
            if (gameName && (typeof gameName !== `string` || DatabaseHelper.isValidGameName(gameName) == false)) {
                return res.status(400).send({ message: `Invalid gameName.` });
            }

            let session = await validateSession(req, res, UserRoles.Poster, gameName as SupportedGames);
            if (!session.approved) {
                return;
            }

            let message = req.body.message;
            let startDate = req.body.startDate;
            let endDate = req.body.endDate;
            let postType = req.body.postType;
            
            if (!message || !HTTPTools.validateStringParameter(message, 3, 256) == false) {
                return res.status(400).send({ message: `Invalid message.` });
            }

            if (!startDate || typeof startDate !== `string` || new Date(startDate).toString() === `Invalid Date`) {
                return res.status(400).send({ message: `Invalid startDate.` });
            }

            if (endDate && (typeof endDate !== `string` || new Date(endDate).toString() === `Invalid Date`)) {
                return res.status(400).send({ message: `Invalid endDate.` });
            }

            if (!postType || typeof postType !== `string` || DatabaseHelper.isValidPostType(postType) == false) {
                return res.status(400).send({ message: `Invalid postType.` });
            }

            let motd = ({
                gameName: gameName as SupportedGames,
                message: message,
                startTime: new Date(startDate),
                endTime: endDate ? new Date(endDate) : new Date(startDate + 1000 * 60 * 60 * 24 * 7),
                postType: postType,
                authorId: session.user.id,
            });

            return res.status(200).send({ message: `MOTD added.`, motd });
        });

        this.app.delete(`/api/motd/:id`, async (req, res) => {
            // #swagger.tags = ['MOTD']
            if (HTTPTools.validateNumberParameter(req.params.id, 0) == false) {
                return res.status(400).send({ message: `Invalid id.` });
            }

            let id = HTTPTools.parseNumberParameter(req.params.id);
            let motd = await DatabaseHelper.database.MOTDs.findOne({ where: { id } });
            if (!motd) {
                return res.status(404).send({ message: `MOTD not found.` });
            }

            let session = await validateSession(req, res, UserRoles.Poster, motd.gameName);
            if (!session.approved) {
                return;
            }

            motd.destroy();
            return res.status(200).send({ message: `MOTD deleted.` });
        });
    }
}