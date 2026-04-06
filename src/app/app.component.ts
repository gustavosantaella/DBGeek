import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AgGridAngular } from 'ag-grid-angular';
import { ColDef } from 'ag-grid-community';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { ElectronService } from './services/electron';
import { InputComponent } from './components/input/input';
import { SelectComponent } from './components/select/select';

interface Project {
  name: string;
  subProjects: Project[];
  isExpanded?: boolean;
  isEditing?: boolean;
}

interface Tab {
  id: number;
  title: string;
  sql: string;
  type?: 'query' | 'project-manager';
}

interface Schema {
  name: string;
  tables?: any[];
  expanded?: boolean;
  loading?: boolean;
}

interface Database {
  name: string;
  tables?: any[]; 
  expanded?: boolean; 
  loading?: boolean; 
}

interface Connection {
  name: string;
  type: 'postgresql' | 'mysql' | 'sqlite';
  project: string;
  env: EnvType;
  connection: {
    host?: string;
    user?: string;
    password?: string;
    database?: string; 
  };
  databases?: Database[]; 
  schemas?: Schema[]; 
  tables?: any[]; 
  expanded?: boolean; 
  loading?: boolean; 
}

type EnvType = 'prod' | 'dev' | 'stage' | 'qa' | 'shared' | 'default';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular, MonacoEditorModule, InputComponent, SelectComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  isSidebarOpen: boolean = true;

  projects: Project[] = [{ name: 'Default', subProjects: [] }];
  activeProjectName: string = 'Default';
  newProjectName: string = '';
  selectedParentProject: string = 'root';

  connections: any[] = [];
  activeConnection: any = null;
  showNewConnection = false;
  isConnecting = false;
  
  isEditingConnection: boolean = false;
  originalConnName: string = ''; 

  newConn = {
    name: '',
    type: 'postgresql',
    env: 'default' as EnvType,
    project: 'Default',
    connection: { host: 'localhost', user: 'postgres', password: '', database: 'postgres' }
  };

  // CAMBIO: Por defecto todos los grupos de DB inician colapsados (false)
  groupExpandedState: { [key: string]: boolean } = {
    postgresql: false,
    mysql: false,
    sqlite: false
  };

  tabs: Tab[] = [];
  activeTabIndex = -1;
  console: Console = console; 
  tabCounter = 0;

  private editor: any;
  editorOptions = {
    theme: 'vs-dark',
    language: 'sql',
    automaticLayout: true,
    fontSize: 14,
    minimap: { enabled: false },
    fixedOverflowWidgets: true,
    formatOnPaste: true,
    formatOnType: true
  };

  results: any[] = [];
  columnDefs: ColDef[] = [];
  defaultColDef: ColDef = { sortable: true, filter: true, resizable: true };
  executing = false;
  lastExecutionTime: number | null = null;

  projectListFlat: {label: string, value: string}[] = [];
  dbTypeOptions = [
    { label: 'PostgreSQL', value: 'postgresql' },
    { label: 'MySQL', value: 'mysql' },
    { label: 'SQLite', value: 'sqlite' }
  ];

  envOptions = [
    { label: 'Default', value: 'default' },
    { label: 'Production', value: 'prod' },
    { label: 'Development', value: 'dev' },
    { label: 'Staging', value: 'stage' },
    { label: 'QA', value: 'qa' },
    { label: 'Shared', value: 'shared' }
  ];

  showContextMenu: boolean = false;
  contextMenuPositionX: number = 0;
  contextMenuPositionY: number = 0;
  contextMenuOptions: { label: string, action: string }[] = [];
  contextMenuTarget: any = null; 

  constructor(private electronService: ElectronService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.loadPersistedData();
    this.updateProjectLists();
    this.addNewTab();
  }

  toggleSidebar() {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  toggleGroup(type: string) {
    this.groupExpandedState[type] = !this.groupExpandedState[type];
  }

  get groupedConnections() {
    const filtered = this.filteredConnections;
    const groupsMap = {
      postgresql: { type: 'postgresql', label: 'PostgreSQL', icon: '🐘', connections: [] as any[] },
      mysql: { type: 'mysql', label: 'MySQL', icon: '🐬', connections: [] as any[] },
      sqlite: { type: 'sqlite', label: 'SQLite', icon: '🪶', connections: [] as any[] }
    };
    filtered.forEach(c => {
      if (groupsMap[c.type as keyof typeof groupsMap]) {
        groupsMap[c.type as keyof typeof groupsMap].connections.push(c);
      }
    });
    return Object.values(groupsMap).filter(g => g.connections.length > 0);
  }

  get filteredConnections() {
    return this.connections.filter(c => c.project === this.activeProjectName);
  }

  closeContextMenu() {
    this.showContextMenu = false;
    this.contextMenuTarget = null;
    this.cdr.detectChanges();
  }

  openConnectionContextMenu(conn: any, event: MouseEvent) {
    event.preventDefault(); 
    event.stopPropagation(); 
    this.contextMenuTarget = conn;
    this.contextMenuOptions = [
      { label: 'Edit Connection', action: 'edit-connection' },
      { label: 'Delete Connection', action: 'delete-connection' }
    ];
    this.contextMenuPositionX = event.clientX;
    this.contextMenuPositionY = event.clientY;
    this.showContextMenu = true;
    this.cdr.detectChanges();
  }

  openTableContextMenu(conn: any, table: any, event: MouseEvent) {
    event.preventDefault(); 
    event.stopPropagation(); 
    this.contextMenuTarget = { conn, table };
    this.contextMenuOptions = [
      { label: 'Delete Table', action: 'delete-table' }
    ];
    this.contextMenuPositionX = event.clientX;
    this.contextMenuPositionY = event.clientY;
    this.showContextMenu = true;
    this.cdr.detectChanges();
  }

  handleContextMenuItem(action: string) {
    if (this.contextMenuTarget) {
      if (action === 'delete-connection') {
        this.deleteConnection(this.contextMenuTarget, new MouseEvent('click')); 
      } else if (action === 'edit-connection') { 
        this.openEditConnectionModal(this.contextMenuTarget);
      }
      else if (action === 'delete-table') {
        const { conn, table } = this.contextMenuTarget;
        this.deleteTable(conn, table, new MouseEvent('click'));
      }
    }
    this.closeContextMenu();
  }

  onEditorInit(editor: any) {
    this.editor = editor;
    editor.onDidChangeModelContent(() => {
      const model = editor.getModel();
      const value = model.getValue();
      const keywords = ['select', 'from', 'where', 'insert', 'update', 'delete', 'into', 'values', 'limit', 'order', 'by', 'join', 'left', 'inner', 'on', 'group', 'and', 'or', 'not', 'null', 'is', 'as', 'create', 'table', 'drop', 'alter', 'table'];
      
      let newValue = value;
      keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        newValue = newValue.replace(regex, (match: string) => match.toUpperCase());
      });

      if (newValue !== value) {
        const selection = editor.getSelection();
        model.setValue(newValue);
        editor.setSelection(selection);
      }
    });
  }

  loadPersistedData() {
    const savedConns = localStorage.getItem('dbgeek_connections');
    if (savedConns) this.connections = JSON.parse(savedConns);

    const savedProjects = localStorage.getItem('dbgeek_projects');
    if (savedProjects) {
      try {
        const parsedProjects = JSON.parse(savedProjects);
        if (Array.isArray(parsedProjects) && parsedProjects.length > 0) {
          const ensureExpanded = (projs: Project[]) => {
            projs.forEach(p => {
              // CAMBIO: Inicia en false para que el Project Manager esté colapsado
              if (p.isExpanded === undefined) p.isExpanded = false;
              if (p.subProjects) ensureExpanded(p.subProjects);
            });
          };
          ensureExpanded(parsedProjects);
          this.projects = parsedProjects;
        } else {
          this.projects = [{ name: 'Default', subProjects: [], isExpanded: false }];
        }
      } catch (e) {
        this.projects = [{ name: 'Default', subProjects: [], isExpanded: false }];
      }
    } else {
      this.projects = [{ name: 'Default', subProjects: [], isExpanded: false }];
    }
  }

  updateProjectLists() {
    const flat: {label: string, value: string}[] = [];
    const flatten = (projs: Project[], prefix = '') => {
      if (!projs) return;
      projs.forEach(p => {
        const name = prefix ? `${prefix} / ${p.name}` : p.name;
        flat.push({ label: name, value: p.name });
        if (p.subProjects) flatten(p.subProjects, name);
      });
    };
    flatten(this.projects);
    this.projectListFlat = flat;
    this.cdr.detectChanges();
  }

  addProject() {
    if (!this.newProjectName.trim()) return;
    // CAMBIO: Al crear uno nuevo, inícialo colapsado (false)
    const newP: Project = { name: this.newProjectName.trim(), subProjects: [], isExpanded: false };
    
    if (this.selectedParentProject === 'root') {
      this.projects.push(newP);
    } else {
      const findAndAdd = (projs: Project[]): boolean => {
        for (let p of projs) {
          if (p.name === this.selectedParentProject) {
            if (!p.subProjects) p.subProjects = [];
            p.subProjects.push(newP);
            return true;
          }
          if (p.subProjects && findAndAdd(p.subProjects)) return true;
        }
        return false;
      };
      findAndAdd(this.projects);
    }

    localStorage.setItem('dbgeek_projects', JSON.stringify(this.projects));
    this.newProjectName = '';
    this.updateProjectLists();
  }

  toggleProjectExpansion(project: Project) {
    project.isExpanded = !project.isExpanded;
    this.cdr.detectChanges();
  }

  deleteProject(projectToDelete: Project) {
    if (!confirm(`Are you sure you want to delete project "${projectToDelete.name}" and all its sub-projects and associated connections? This action cannot be undone.`)) {
      return;
    }

    const projectsToRemove: string[] = [];
    const collectProjects = (project: Project) => {
      projectsToRemove.push(project.name);
      project.subProjects.forEach(sub => collectProjects(sub));
    };
    collectProjects(projectToDelete);

    this.connections = this.connections.filter(conn => !projectsToRemove.includes(conn.project));
    localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));

    const removeProjectRecursive = (projs: Project[]): Project[] => {
      return projs.filter(p => {
        if (p.name === projectToDelete.name) return false; 
        if (p.subProjects) {
          p.subProjects = removeProjectRecursive(p.subProjects);
        }
        return true;
      });
    };

    this.projects = removeProjectRecursive(this.projects);
    localStorage.setItem('dbgeek_projects', JSON.stringify(this.projects));
    
    this.updateProjectLists();
    this.cdr.detectChanges();
  }

  saveProjectName(project: Project) {
    if (project.name.trim() === '') {
      alert('Project name cannot be empty.');
      this.loadPersistedData(); 
      project.isEditing = false;
      this.cdr.detectChanges();
      return;
    }
    const oldName = project.name;
    const newName = project.name.trim();

    const isDuplicate = (projs: Project[], currentProject: Project, name: string): boolean => {
      return projs.some(p => p !== currentProject && p.name === name);
    };

    if (isDuplicate(this.projects, project, newName)) {
      alert(`Project with name "${newName}" already exists.`);
      this.loadPersistedData(); 
      project.isEditing = false;
      this.cdr.detectChanges();
      return;
    }

    this.connections.forEach(conn => {
      if (conn.project === oldName) {
        conn.project = newName;
      }
    });
    localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));
    localStorage.setItem('dbgeek_projects', JSON.stringify(this.projects));

    project.isEditing = false;
    this.updateProjectLists();
    this.cdr.detectChanges();
  }

  getConnectionCount(projectName: string): number {
    return this.connections.filter(conn => conn.project === projectName).length;
  }

  openEditConnectionModal(conn: Connection) {
    this.isEditingConnection = true;
    this.originalConnName = conn.name; 
    
    this.newConn = JSON.parse(JSON.stringify(conn)); 
    
    if (!this.newConn.connection) {
      this.newConn.connection = { host: 'localhost', user: 'postgres', password: '', database: 'postgres' };
    }

    this.showNewConnection = true;
    this.cdr.detectChanges();
  }

  async testAndAddConnection() {
    this.isConnecting = true;
    try {
      const res = await this.electronService.connect(this.newConn);
      if (res.success) {
        if (this.isEditingConnection) {
          const index = this.connections.findIndex(c => c.name === this.originalConnName);
          if (index !== -1) {
            this.connections[index] = JSON.parse(JSON.stringify(this.newConn));
            
            if (this.activeConnection && this.activeConnection.name === this.originalConnName) {
              this.activeConnection = this.connections[index];
            }
          }
          this.isEditingConnection = false;
        } else {
          this.connections.push(JSON.parse(JSON.stringify(this.newConn)));
        }
        localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));
        this.showNewConnection = false;
        this.resetNewConn();
        this.cdr.detectChanges();
      } else {
        alert(`ERROR: ${res.error}`);
      }
    } finally {
      this.isConnecting = false;
      this.cdr.detectChanges();
    }
  }

  deleteConnectionFromModal() {
    if (confirm(`Are you sure you want to delete the connection "${this.originalConnName}"?`)) {
      this.connections = this.connections.filter(c => c.name !== this.originalConnName);
      localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));
      
      if (this.activeConnection && this.activeConnection.name === this.originalConnName) {
        this.activeConnection = null;
      }
      
      this.showNewConnection = false;
      this.resetNewConn();
      this.cdr.detectChanges();
    }
  }

  deleteConnection(conn: any, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete the connection "${conn.name}"?`)) {
      this.connections = this.connections.filter(c => c.name !== conn.name);
      localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));
      if (this.activeConnection && this.activeConnection.name === conn.name) this.activeConnection = null;
      this.cdr.detectChanges();
    }
  }

  resetNewConn() {
    this.newConn = {
      name: '', type: 'postgresql', project: this.activeProjectName, env: 'default',
      connection: { host: 'localhost', user: 'postgres', password: '', database: 'postgres' }
    };
    this.isEditingConnection = false; 
    this.originalConnName = '';
  }

  async setActiveConnection(conn: any) {
    this.activeConnection = conn;
    if (conn.type === 'postgresql') {
      if (!conn.schemas) this.refreshSchemas(conn);
    } else {
      if (!conn.tables) this.refreshConnection(conn);
    }
  }

  async refreshSchemas(conn: any) {
    conn.loading = true;
    try {
      const res = await (this.electronService as any).getSchemas 
        ? await (this.electronService as any).getSchemas(conn) 
        : { success: true, data: ['public'] };
      
      if (res.success) {
        // CAMBIO: Las carpetas de schemas también inician colapsadas (expanded: false)
        conn.schemas = res.data.map((s: string) => ({ name: s, tables: null, expanded: false, loading: false }));
      }
    } catch (e) {
      conn.schemas = [{ name: 'public', tables: null, expanded: false, loading: false }];
    }
    conn.loading = false;
    this.cdr.detectChanges();
  }

  async toggleSchema(conn: any, schema: any, event: MouseEvent) {
    event.stopPropagation();
    schema.expanded = !schema.expanded;
    if (schema.expanded && !schema.tables) {
      schema.loading = true;
      const res = await this.electronService.getTables(conn, schema.name);
      schema.loading = false;
      if (res.success) {
        schema.tables = res.data.map((t: string) => ({ name: t, schema: schema.name, columns: [], expanded: false }));
      }
      this.cdr.detectChanges();
    }
  }

  async refreshConnection(conn: any) {
    conn.loading = true;
    const res = await this.electronService.getTables(conn);
    conn.loading = false;
    if (res.success) {
      // CAMBIO: Las tablas inician colapsadas
      conn.tables = res.data.map((t: string) => ({ name: t, columns: [], expanded: false }));
    }
    this.cdr.detectChanges();
  }

  async toggleTable(conn: any, table: any, event: MouseEvent) {
    event.stopPropagation();
    table.expanded = !table.expanded;
    if (table.expanded && table.columns.length === 0) {
      table.loading = true;
      const res = await this.electronService.getColumns(conn, table.name, table.schema);
      table.loading = false;
      if (res.success) {
        table.columns = res.data;
      }
    }
    this.cdr.detectChanges();
  }

  async deleteTable(conn: any, table: any, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const fullTableName = table.schema ? `"${table.schema}"."${table.name}"` : `"${table.name}"`;
    
    if (!confirm(`Are you sure you want to delete the table ${fullTableName} from connection "${conn.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await this.electronService.dbDropTable(conn, table.name, table.schema);
      if (res.success) {
        if (conn.type === 'postgresql' && table.schema) {
          const schema = conn.schemas.find((s: any) => s.name === table.schema);
          if (schema && schema.tables) {
             schema.tables = schema.tables.filter((t: any) => t.name !== table.name);
          }
        } else {
          conn.tables = conn.tables.filter((t: any) => t.name !== table.name);
        }
        this.cdr.detectChanges();
      } else {
        alert(`Failed to delete table: ${res.error}`);
      }
    } catch (error: any) {
      console.error('Error deleting table:', error);
      alert(`An error occurred while deleting table: ${error.message}`);
    }
  }

  quickViewData(table: any) {
    const fullTableName = table.schema ? `"${table.schema}"."${table.name}"` : `"${table.name}"`;
    const sql = `SELECT * FROM ${fullTableName} LIMIT 100;`;
    
    let queryTab = this.tabs[this.activeTabIndex];
    if (!queryTab || queryTab.type !== 'query') {
      this.addNewTab();
      queryTab = this.tabs[this.activeTabIndex];
    }
    queryTab.sql = sql;
    this.executeQuery();
  }

  addNewTab() {
    this.tabCounter++;
    this.tabs.push({ id: this.tabCounter, title: `Query ${this.tabCounter}`, sql: '', type: 'query' });
    this.activeTabIndex = this.tabs.length - 1;
  }

  openProjectManager() {
    const existing = this.tabs.findIndex(t => t.type === 'project-manager');
    if (existing !== -1) {
      this.activeTabIndex = existing;
    } else {
      this.tabCounter++;
      this.tabs.push({ id: this.tabCounter, title: 'Project Manager', sql: '', type: 'project-manager' });
      this.activeTabIndex = this.tabs.length - 1;
    }
  }

  closeTab(index: number, event: MouseEvent) {
    event.stopPropagation();
    this.tabs.splice(index, 1);
    if (this.activeTabIndex >= this.tabs.length) this.activeTabIndex = this.tabs.length - 1;
  }

  async executeQuery() {
    if (!this.activeConnection) return alert('Select a connection');
    const activeTab = this.tabs[this.activeTabIndex];
    if (!activeTab || activeTab.type !== 'query') return;

    let sqlToExecute = activeTab.sql;
    
    if (this.editor && this.editor.getSelection && this.editor.getModel) {
      const selection = this.editor.getSelection();
      const selectedText = this.editor.getModel().getValueInRange(selection);
      if (selectedText.trim()) {
        sqlToExecute = selectedText;
      }
    }

    if (!sqlToExecute.trim()) return;

    if (!sqlToExecute.trim().endsWith(';')) {
      sqlToExecute = sqlToExecute.trim() + ';';
      if (!this.editor.getSelection().isEmpty()) {
      } else {
        activeTab.sql = sqlToExecute;
      }
    }

    this.executing = true;
    const start = Date.now();
    try {
      const res = await this.electronService.query(this.activeConnection, sqlToExecute);
      this.lastExecutionTime = Date.now() - start;
      if (res.success) {
        this.results = res.data;
        this.updateColumnDefs(res.data);
      } else {
        alert('Query Error: ' + res.error);
        this.cdr.detectChanges();
      }
    } finally {
      this.executing = false;
      this.cdr.detectChanges();
    }  
  }

  updateColumnDefs(data: any[]) {
    if (!data || data.length === 0) {
      this.columnDefs = [];
      return;
    }
    this.columnDefs = Object.keys(data[0]).map(key => ({
      field: key,
      headerName: key.toUpperCase()
    }));
  }
}