import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ElectronService {
  private electronAPI: any;

  constructor() {
    if ((window as any).electronAPI) {
      this.electronAPI = (window as any).electronAPI;
    } else {
      console.warn('Electron API not found. Running in web mode?');
    }
  }

  async connect(config: any): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbConnect(config);
  }

  async query(config: any, query: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbQuery(config, query);
  }

  async getTables(config: any): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbGetTables(config);
  }

  async getColumns(config: any, table: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbGetColumns(config, table);
  }

  async dbDropTable(config: any, table: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbDropTable(config, table);
  }
}
