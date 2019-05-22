import { app, remote } from 'electron';
import * as Path from 'path';
import * as Fs from 'fs';
import { Constants, MessageModel, MessageType, Helpers, ConfigModel, IClonable, Dictionary } from '../../src-common';
import { IpcService } from './ipc.service';
import { SuperService } from '../super.service';

class ConfigCollection implements IClonable {
    private _configs: ConfigModel[];

    constructor() {
        this._configs = [];
    }

    get Configs(): ConfigModel[] {
        return this._configs;
    }

    Clone(object: any): void {
        if (object._configs) {
            this._configs = [];
            for (let configObj of object._configs) {
                let config = new ConfigModel();
                config.Clone(configObj);
                this._configs.push(config);
            }
        }
    }

}

export class ConfigService extends SuperService {
    private readonly _configFile: string;
    private _configs: Dictionary<string, any>;

    constructor(private readonly _ipc: IpcService) {
        super();
        this._ipc.Receive.on(Constants.IPC_CHANNEL, (message: MessageModel) => this.OnMessage(message));

        const userDataPath = (app || remote.app).getPath('userData');
        this._configFile = Path.join(userDataPath, 'config.json');
        console.log(this._configFile);
    }

    get ConfigFileName(): string {
        return this._configFile;
    }

    private async ReadFileAsync(fileName: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            Fs.readFile(fileName, 'utf8', (error: NodeJS.ErrnoException, data: string) => {
                if (error)
                    reject(error);
                else
                    resolve(data);
            });
        });
    }

    private async WriteFileAsync(fileName: string, data: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            Fs.writeFile(fileName, data, (error: NodeJS.ErrnoException) => {
                if (error)
                    reject(error);
                else
                    resolve();
            });
        });
    }

    private async ReadConfigFile(fileName: string): Promise<void> {
        if (this._configs)
            return;

        this._configs = new Dictionary();

        let json: string;
        try {
            json = await this.ReadFileAsync(fileName);
        } catch (ex) {
            console.error(ex);
        }

        if (!json)
            return;

        var configs = Helpers.Deserialize<ConfigCollection>(json, ConfigCollection);
        for (let config of configs.Configs)
            this._configs.Set(config.Key, config.Value);
    }

    private async WriteConfigFile(fileName: string): Promise<void> {
        if (!this._configs)
            return;

        let collection = new ConfigCollection();
        for (let key of this._configs.Keys) {
            let value = this._configs.Get(key);
            collection.Configs.push(new ConfigModel(key, value));
        }
        let json = Helpers.Serialize<ConfigCollection>(collection);
        await this.WriteFileAsync(fileName, json);
    }

    protected Dispose(): void {
        this._ipc.Receive.removeAllListeners(Constants.IPC_CHANNEL);
        this.WriteConfigFile(this.ConfigFileName).then();
    }

    private OnMessage(message: MessageModel): void {
        switch (message.Type) {
            case MessageType.GetSetConfig:
                this.ReadConfigFile(this.ConfigFileName).then();

                const config = Helpers.Deserialize<ConfigModel>(message.DataJson, ConfigModel);
                let value = config.Value;
                if (this._configs.IsHaving(config.Key)) {
                    value = this._configs.Get(config.Key);

                    this._configs.Set(config.Key, config.Value);

                    config.Value = value;
                }
                else
                    this._configs.Set(config.Key, value);

                message.DataJson = Helpers.Serialize<ConfigModel>(config);
                this._ipc.Send(message);
                break;

            case MessageType.DeleteConfig:
                this.ReadConfigFile(this.ConfigFileName).then();

                if (this._configs.IsHaving(message.DataJson))
                    this._configs.Delete(message.DataJson);
                break;
        }
    }
}