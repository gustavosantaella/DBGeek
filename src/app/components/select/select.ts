import { Component, Input, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="field-container">
      <label *ngIf="label">{{label}}</label>
      <select [(ngModel)]="value">
        <option *ngFor="let opt of options" [value]="opt.value">{{opt.label}}</option>
      </select>
    </div>
  `,
  styles: [`
    .field-container {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    label { font-size: 13px; color: #94a3b8; }
    select {
      width: 100%;
      padding: 10px 14px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #f8fafc;
      font-size: 14px;
      outline: none;
      transition: all 0.2s;
      &:focus { border-color: #38bdf8; background: rgba(255, 255, 255, 0.08); }
    }
    option {
      background-color: #1e293b;
      color: #f8fafc;
    }
  `],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true
    }
  ]
})
export class SelectComponent implements ControlValueAccessor {
  @Input() label: string = '';
  @Input() options: {label: string, value: any}[] = [];

  private _value: any;
  onChange = (_: any) => {};
  onTouched = () => {};

  get value() { return this._value; }
  set value(val: any) {
    this._value = val;
    this.onChange(val);
  }

  writeValue(val: any): void { this.value = val; }
  registerOnChange(fn: any): void { this.onChange = fn; }
  registerOnTouched(fn: any): void { this.onTouched = fn; }
}
