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

interface Database {
  name: string;
  tables?: any[]; // Tables within this specific database
  expanded?: boolean; // For UI expansion
  loading?: boolean; // For UI loading state
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
    database?: string; // Initial database to connect to, or default
  };
  databases?: Database[]; // List of databases available under this connection
  expanded?: boolean; // For UI expansion
  loading?: boolean; // For UI loading state
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
  projects: Project[] = [{ name: 'Default', subProjects: [] }];
  activeProjectName: string = 'Default';
  newProjectName: string = '';
  selectedParentProject: string = 'root';

  connections: any[] = [];
  activeConnection: any = null;
  showNewConnection = false;
  isConnecting = false;
  isEditingConnection: boolean = false;

  newConn = {
    name: '',
    type: 'postgresql',
    env: 'default' as EnvType,
    project: 'Default',
    connection: { host: 'localhost', user: 'postgres', password: '', database: 'postgres' }
  };

  tabs: Tab[] = [];
  activeTabIndex = -1;
  console: Console = console; // Expose console to template for debugging
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

  // Context Menu Properties
  showContextMenu: boolean = false;
  contextMenuPositionX: number = 0;
  contextMenuPositionY: number = 0;
  contextMenuOptions: { label: string, action: string }[] = [];
  contextMenuTarget: any = null; // Will hold the project, connection, or table object

  constructor(private electronService: ElectronService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    console.log('ngOnInit - showNewConnection initially:', this.showNewConnection);
    this.loadPersistedData();
    this.updateProjectLists();
    this.addNewTab();
  }

  closeContextMenu() {
    console.log('Closing context menu.');
    this.showContextMenu = false;
    this.contextMenuTarget = null;
    this.cdr.detectChanges();
  }

  openConnectionContextMenu(conn: any, event: MouseEvent) {
    console.log('openConnectionContextMenu called.');
    console.log('Opening connection context menu for:', conn.name);
    event.preventDefault(); // Prevent default browser context menu
    this.contextMenuTarget = conn;
    this.contextMenuOptions = [
      { label: 'Edit Connection', action: 'edit-connection' }, // Added Edit option
      { label: 'Delete Connection', action: 'delete-connection' }
    ];
    this.contextMenuPositionX = event.clientX;
    this.contextMenuPositionY = event.clientY;
    this.showContextMenu = true;
    this.cdr.detectChanges();
  }

  openTableContextMenu(conn: any, table: any, event: MouseEvent) {
    console.log('openTableContextMenu called.');
    console.log('Opening table context menu for:', conn.name, '-', table.name);
    event.preventDefault(); // Prevent default browser context menu
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
    console.log('handleContextMenuItem called.');
    console.log('handleContextMenuItem invoked with action:', action);
    this.closeContextMenu();
    if (this.contextMenuTarget) {
      if (action === 'delete-connection') {
        this.deleteConnection(this.contextMenuTarget, new MouseEvent('click')); // Re-use existing delete logic
      } else if (action === 'edit-connection') { // Added Edit handler
        this.openEditConnectionModal(this.contextMenuTarget);
      }
      else if (action === 'delete-table') {
        const { conn, table } = this.contextMenuTarget;
        this.deleteTable(conn, table, new MouseEvent('click'));
      }
    }
  }

  onEditorInit(editor: any) {
    this.editor = editor;
    
    // SQL Keyword Auto-Uppercase
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
              if (p.isExpanded === undefined) p.isExpanded = true;
              if (p.subProjects) ensureExpanded(p.subProjects);
            });
          };
          ensureExpanded(parsedProjects);
          this.projects = parsedProjects;
        } else {
          this.projects = [{ name: 'Default', subProjects: [], isExpanded: true }];
        }
      } catch (e) {
        console.error("Error parsing saved projects from localStorage:", e);
        this.projects = [{ name: 'Default', subProjects: [], isExpanded: true }];
      }
    } else {
      this.projects = [{ name: 'Default', subProjects: [], isExpanded: true }];
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
    const newP: Project = { name: this.newProjectName.trim(), subProjects: [], isExpanded: true };
    
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

    // Remove connections associated with deleted projects
    this.connections = this.connections.filter(conn => !projectsToRemove.includes(conn.project));
    localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));

    // Remove project from the main list or sub-project list
    const removeProjectRecursive = (projs: Project[]): Project[] => {
      return projs.filter(p => {
        if (p.name === projectToDelete.name) {
          return false; // This project is to be removed
        }
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
      // Revert to original name if empty
      this.loadPersistedData(); 
      project.isEditing = false;
      this.cdr.detectChanges();
      return;
    }

    const oldName = project.name;
    const newName = project.name.trim();

    // Check for duplicate names at the same level (simplistic check)
    const isDuplicate = (projs: Project[], currentProject: Project, name: string): boolean => {
      return projs.some(p => p !== currentProject && p.name === name);
    };

    if (isDuplicate(this.projects, project, newName)) {
      alert(`Project with name "${newName}" already exists.`);
      this.loadPersistedData(); // Revert to original name
      project.isEditing = false;
      this.cdr.detectChanges();
      return;
    }

    // Update associated connections
    this.connections.forEach(conn => {
      if (conn.project === oldName) {
        conn.project = newName;
      }
    });
    localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));

    // Update the project name itself (already updated via ngModel, just need to persist)
    // No need to find it recursively as 'project' is a direct reference
    localStorage.setItem('dbgeek_projects', JSON.stringify(this.projects));

    project.isEditing = false;
    this.updateProjectLists();
    this.cdr.detectChanges();
  }

  getConnectionCount(projectName: string): number {
    return this.connections.filter(conn => conn.project === projectName).length;
  }

  get filteredConnections() {
    return this.connections.filter(c => c.project === this.activeProjectName);
  }

  openEditConnectionModal(conn: Connection) {
    this.isEditingConnection = true;
    // Deep copy the connection to avoid modifying the original until saved
    this.newConn = JSON.parse(JSON.stringify(conn)); 
    this.showNewConnection = true;
    this.cdr.detectChanges();
  }

  async testAndAddConnection() {
    this.isConnecting = true;
    try {
      const res = await this.electronService.connect(this.newConn);
      if (res.success) {
        if (this.isEditingConnection) {
          // Find and update the existing connection
          const index = this.connections.findIndex(c => c.name === this.newConn.name);
          if (index !== -1) {
            this.connections[index] = JSON.parse(JSON.stringify(this.newConn));
          }
          this.isEditingConnection = false; // Reset flag after editing
        } else {
          // Add new connection
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
    }
  }

  deleteConnection(conn: any, event: MouseEvent) {
    console.log('deleteConnection called.');
    console.log('deleteConnection method invoked for:', conn.name);
    event.preventDefault();
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete the connection "${conn.name}"?`)) {
      console.log('Connections before filter:', this.connections);
      console.log('Connection to delete:', conn);
      this.connections = this.connections.filter(c => c.name !== conn.name);
      console.log('Connections after filter:', this.connections);
      localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));
      if (this.activeConnection && this.activeConnection.name === conn.name) this.activeConnection = null; // Compare by name
      this.cdr.detectChanges();
    }
  }

  resetNewConn() {
    this.newConn = {
      name: '', type: 'postgresql', project: this.activeProjectName, env: 'default',
      connection: { host: 'localhost', user: 'postgres', password: '', database: 'postgres' }
    };
    this.isEditingConnection = false; // Reset edit flag
  }

  setActiveConnection(conn: any) {
    this.activeConnection = conn;
    if (!conn.tables) this.refreshConnection(conn);
  }

  async refreshConnection(conn: any) {
    conn.loading = true;
    const res = await this.electronService.getTables(conn);
    conn.loading = false;
    if (res.success) {
      conn.tables = res.data.map((t: string) => ({ name: t, columns: [], expanded: false }));
    }
    this.cdr.detectChanges();
  }

  async toggleTable(conn: any, table: any, event: MouseEvent) {
    event.stopPropagation();
    table.expanded = !table.expanded;
    if (table.expanded && table.columns.length === 0) {
      table.loading = true;
      const res = await this.electronService.getColumns(conn, table.name);
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
    if (!confirm(`Are you sure you want to delete the table "${table.name}" from connection "${conn.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await this.electronService.dbDropTable(conn, table.name);
      if (res.success) {
        // Remove the table from the connection's tables array
        conn.tables = conn.tables.filter((t: any) => t.name !== table.name);
        // Persist connections change to localStorage
        localStorage.setItem('dbgeek_connections', JSON.stringify(this.connections));
        this.cdr.detectChanges();
      } else {
        alert(`Failed to delete table: ${res.error}`);
      }
    } catch (error: any) {
      console.error('Error deleting table:', error);
      alert(`An error occurred while deleting table: ${error.message}`);
    }
  }

  quickViewData(table: string) {
    const sql = `SELECT * FROM ${table} LIMIT 100;`;
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
    
    // Execute selection if exists
    if (this.editor && this.editor.getSelection && this.editor.getModel) {
      const selection = this.editor.getSelection();
      const selectedText = this.editor.getModel().getValueInRange(selection);
      if (selectedText.trim()) {
        sqlToExecute = selectedText;
      }
    }

    if (!sqlToExecute.trim()) return;

    // Ensure it ends with semicolon
    if (!sqlToExecute.trim().endsWith(';')) {
      sqlToExecute = sqlToExecute.trim() + ';';
      if (!this.editor.getSelection().isEmpty()) {
        // If it was a selection, don't update the whole editor
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
    }  }

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
