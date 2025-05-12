export interface IService {
  name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface IServiceManager {
  services: IService[];
  addService(service: IService): void;
  removeService(service: IService): void;
  startAllServices(): Promise<void>;
  stopAllServices(): Promise<void>;
}
