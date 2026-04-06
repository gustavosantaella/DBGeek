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

  async getTables(config: any, schema?: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbGetTables(config, schema || null);
  }

  async getColumns(config: any, table: string, schema?: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbGetColumns(config, table, schema || null);
  }

  async dbDropTable(config: any, table: string, schema?: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbDropTable(config, table);
  }

  async dbDropDatabase(config: any, database: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbDropDatabase(config, database);
  }

  async dbCreateDatabase(config: any, database: string): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbCreateDatabase(config, database);
  }

  async dbGetDatabases(config: any): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbGetDatabases(config);
  }

  async getSchemas(conn: any): Promise<any> {
    if (!this.electronAPI) return { success: false, error: 'Electron not available' };
    return await this.electronAPI.dbGetSchemas(conn);
  }

}
