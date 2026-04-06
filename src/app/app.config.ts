import { ApplicationConfig, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { routes } from './app.routes';
import { MonacoEditorModule } from 'ngx-monaco-editor-v2';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';

// Register AG Grid Modules
ModuleRegistry.registerModules([AllCommunityModule]);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    importProvidersFrom(MonacoEditorModule.forRoot({
      baseUrl: 'assets/monaco'
    }))
  ]
};
