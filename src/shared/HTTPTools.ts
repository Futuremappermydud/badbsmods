import { randomInt } from 'crypto';
import { Express } from 'express';

export class HTTPTools {
    public static handleExpressShenanigans(app: Express) {
        app.disable(`x-powered-by`);
        app.use((req, res, next) => {
            res.status(404).send({message: `Unknown route.`});
        });
          
        app.use((err:any, req:any, res:any, next:any) => {
            console.error(err.stack);
            res.status(500).send({message: `Server error`});
        });
    }

    public static createRandomString(length:number): string {
        const CharSet = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
        let key = ``;
        for (let i = 0; i < length; i++) {
            key += CharSet[Math.floor(randomInt(8192) * (Date.now() / 100000)) % CharSet.length];
        }
        return key;
    }

    public static validateStringParameter(param: any | undefined, minLength:number = 1, maxLength:number = 2048): param is string {
        if (typeof param === `string`) {
            if (param.length >= minLength) {
                return true;
            }
        }
        return false;
    }

    public static parseNumberParameter(param: any | undefined): number | undefined {
        if (typeof param === `number`) {
            return param;
        } else if (typeof param === `string`) {
            const num = parseInt(param, 10);
            if (!isNaN(num)) {
                return num;
            }
        }
        return undefined;
    }

    public static validateNumberParameter(param: any | undefined, min:number = 0, max:number = Number.MAX_SAFE_INTEGER): param is number {
        const num = this.parseNumberParameter(param);
        if (num !== undefined) {
            if (num >= min && num <= max) {
                return true;
            }
        }
        return false;
    }

    public static validateNumberArrayParameter(param: any | undefined): param is Array<number> {
        if (Array.isArray(param)) {
            for (let num of param) {
                if (!this.validateNumberParameter(num)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
}