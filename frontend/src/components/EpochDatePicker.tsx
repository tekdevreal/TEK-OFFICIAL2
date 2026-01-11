import { useState, useRef, useEffect } from 'react';
import './EpochDatePicker.css';

interface EpochDatePickerProps {
  selectedDate: string; // YYYY-MM-DD format
  availableEpochs: string[]; // Array of available epoch dates
  onDateSelect: (date: string) => void;
  maxDays?: number; // Maximum days to show (default 30)
}

function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMonthYear(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function getDateRange(currentDate: string, maxDays: number): string[] {
  const dates: string[] = [];
  const current = new Date(currentDate + 'T00:00:00Z');
  
  // Only show dates in the current month, up to today
  const startOfMonth = new Date(current);
  startOfMonth.setUTCDate(1);
  
  // Generate dates from start of month to today
  const daysInRange = current.getUTCDate(); // Days from 1st to today
  
  for (let i = 0; i < daysInRange; i++) {
    const date = new Date(current);
    date.setUTCDate(date.getUTCDate() - i);
    
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    dates.push(`${year}-${month}-${day}`);
  }
  
  return dates;
}

function isSameDay(date1: string, date2: string): boolean {
  return date1 === date2;
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  return dateStr === today;
}

function getDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

function getDayNumber(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.getUTCDate();
}

export function EpochDatePicker({
  selectedDate,
  availableEpochs,
  onDateSelect,
  maxDays = 30,
}: EpochDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);
  
  // Get current date (today)
  const now = new Date();
  const currentDate = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  
  // Get date range (last 30 days)
  const dateRange = getDateRange(currentDate, maxDays);
  
  // Group dates by month for calendar display
  const monthGroups = dateRange.reduce((groups, date) => {
    const monthKey = formatMonthYear(date);
    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(date);
    return groups;
  }, {} as Record<string, string[]>);
  
  // Check if date has data (is in availableEpochs)
  const hasData = (date: string) => availableEpochs.includes(date);
  
  // Check if date is in future
  const isFuture = (date: string) => {
    const checkDate = new Date(date + 'T00:00:00Z');
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    return checkDate > now;
  };
  
  // Check if date is disabled (no data or in future)
  const isDisabled = (date: string) => !hasData(date);
  
  const handleDateClick = (date: string) => {
    if (!isDisabled(date)) {
      onDateSelect(date);
      setIsOpen(false);
    }
  };
  
  return (
    <div className="epoch-date-picker" ref={dropdownRef}>
      <button
        className="epoch-date-picker-button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <svg
          className="calendar-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />
          <path d="M2 6H14" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M11 1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="selected-date-text">{formatDisplayDate(selectedDate)}</span>
        <svg
          className={`dropdown-arrow ${isOpen ? 'open' : ''}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 5L6 8L9 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      
      {isOpen && (
        <div className="epoch-date-picker-dropdown">
          <div className="date-picker-header">
            <span className="date-picker-title">Select Date</span>
          </div>
          
          {Object.entries(monthGroups).map(([monthKey, dates]) => (
            <div key={monthKey} className="month-group">
              <div className="month-header">{monthKey}</div>
              <div className="calendar-grid">
                {dates.map((date) => {
                  const disabled = isDisabled(date);
                  const selected = isSameDay(date, selectedDate);
                  const today = isToday(date);
                  
                  return (
                    <button
                      key={date}
                      className={`calendar-day ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${today ? 'today' : ''}`}
                      onClick={() => handleDateClick(date)}
                      disabled={disabled}
                      title={disabled ? 'No data available' : formatDisplayDate(date)}
                    >
                      <span className="day-name">{getDayName(date)}</span>
                      <span className="day-number">{getDayNumber(date)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
