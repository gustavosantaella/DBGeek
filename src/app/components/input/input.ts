import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="field-container" [class.full-width]="fullWidth">
      <label *ngIf="label">{{label}}</label>
      <div class="input-wrapper">
        <input 
          [type]="currentType" 
          [placeholder]="placeholder" 
          [(ngModel)]="value"
          (mousedown)="$event.stopPropagation()"
          (focus)="onTouched()">
        
        <button *ngIf="type === 'password'" 
                type="button" 
                class="toggle-btn" 
                (click)="togglePassword($event)"
                (mousedown)="$event.stopPropagation()">
          {{ currentType === 'password' ? '👁️' : '🔒' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .field-container {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .full-width { grid-column: span 2; }
    label { font-size: 13px; color: #94a3b8; }
    
    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    input {
      width: 100%;
      padding: 10px 14px;
      padding-right: 40px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
      &:focus { border-color: #38bdf8; background: rgba(255, 255, 255, 0.08); }
    }

    .toggle-btn {
      position: absolute;
      right: 8px;
      background: transparent;
      border: none;
      padding: 4px;
      font-size: 14px;
      cursor: pointer;
      opacity: 0.6;
      transition: opacity 0.2s;
      &:hover { opacity: 1; transform: none; background: transparent; }
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ]
})
export class InputComponent implements ControlValueAccessor {
  @Input() label: string = '';
  @Input() type: string = 'text';
  @Input() placeholder: string = '';
  @Input() fullWidth: boolean = false;

  currentType: string = 'text';
  private _value: any;
  onChange = (_: any) => {};
  onTouched = () => {};

  ngOnInit() {
    this.currentType = this.type;
  }

  togglePassword(event: MouseEvent) {
    event.preventDefault();
    if (this.currentType === 'password') {
      this.currentType = 'text';
      setTimeout(() => {
        this.currentType = 'password';
      }, 3000);
    } else {
      this.currentType = 'password';
    }
  }

  get value() { return this._value; }
  set value(val: any) {
    this._value = val;
    this.onChange(val);
  }

  writeValue(val: any): void { this._value = val; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
