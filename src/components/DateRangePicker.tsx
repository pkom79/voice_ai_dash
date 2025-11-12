import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format } from 'date-fns';

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onDateRangeChange: (start: Date | null, end: Date | null) => void;
  onClose: () => void;
}

export default function DateRangePicker({
  startDate,
  endDate,
  onDateRangeChange,
  onClose,
}: DateRangePickerProps) {
  const [tempStartDate, setTempStartDate] = useState<Date | null>(startDate);
  const [tempEndDate, setTempEndDate] = useState<Date | null>(endDate);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const date = startDate || new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const handleDateClick = (date: Date) => {
    if (!tempStartDate || (tempStartDate && tempEndDate)) {
      setTempStartDate(date);
      setTempEndDate(null);
    } else {
      if (date < tempStartDate) {
        setTempStartDate(date);
        setTempEndDate(tempStartDate);
      } else {
        setTempEndDate(date);
      }
    }
  };

  const handleConfirm = () => {
    onDateRangeChange(tempStartDate, tempEndDate);
    onClose();
  };

  const handleQuickSelect = (preset: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let start: Date;
    let end: Date = new Date(today);

    switch (preset) {
      case 'thisWeek': {
        const dayOfWeek = today.getDay();
        start = new Date(today);
        start.setDate(today.getDate() - dayOfWeek);
        break;
      }
      case 'lastWeek': {
        const dayOfWeek = today.getDay();
        start = new Date(today);
        start.setDate(today.getDate() - dayOfWeek - 7);
        end = new Date(start);
        end.setDate(start.getDate() + 6);
        break;
      }
      case 'last7Days': {
        start = new Date(today);
        start.setDate(today.getDate() - 6);
        break;
      }
      case 'thisMonth': {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      }
      default:
        return;
    }

    setTempStartDate(start);
    setTempEndDate(end);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      return newDate;
    });
  };

  const formatDateRange = () => {
    if (!tempStartDate && !tempEndDate) return '';

    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' };

    if (tempStartDate && !tempEndDate) {
      return tempStartDate.toLocaleDateString('en-US', options);
    }

    if (tempStartDate && tempEndDate) {
      return `${tempStartDate.toLocaleDateString('en-US', options)} → ${tempEndDate.toLocaleDateString('en-US', options)}`;
    }

    return '';
  };

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const days: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isDateInRange = (date: Date) => {
    if (!tempStartDate || !tempEndDate) return false;
    return date >= tempStartDate && date <= tempEndDate;
  };

  const isDateSelected = (date: Date) => {
    if (!tempStartDate) return false;
    if (tempStartDate && !tempEndDate) {
      return date.toDateString() === tempStartDate.toDateString();
    }
    return (
      date.toDateString() === tempStartDate.toDateString() ||
      date.toDateString() === tempEndDate?.toDateString()
    );
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getDateClasses = (day: number | null) => {
    if (day === null) return '';

    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const selected = isDateSelected(date);
    const inRange = isDateInRange(date);
    const today = isToday(date);

    let classes = 'h-10 w-10 flex items-center justify-center rounded-full text-sm cursor-pointer transition-colors ';

    if (selected) {
      classes += 'bg-blue-600 text-white font-semibold ';
    } else if (inRange) {
      classes += 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300 ';
    } else if (today) {
      classes += 'border-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 font-medium ';
    } else {
      classes += 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 ';
    }

    return classes;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-opacity-70 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <input
              type="text"
              readOnly
              value={formatDateRange() || 'Select date range'}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-default"
              placeholder="YYYY-MM-DD → YYYY-MM-DD"
            />
            <button
              onClick={onClose}
              className="ml-2 p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{monthName}</h3>
            <button
              onClick={() => navigateMonth('next')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="h-10 flex items-center justify-center text-xs font-medium text-gray-500 dark:text-gray-400">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => (
              <div key={index} className="flex items-center justify-center">
                {day !== null ? (
                  <button
                    onClick={() => handleDateClick(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}
                    className={getDateClasses(day)}
                  >
                    {day}
                  </button>
                ) : (
                  <div className="h-10 w-10" />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => handleQuickSelect('thisWeek')}
              className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              This Week
            </button>
            <button
              onClick={() => handleQuickSelect('lastWeek')}
              className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Last Week
            </button>
            <button
              onClick={() => handleQuickSelect('last7Days')}
              className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => handleQuickSelect('thisMonth')}
              className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
            >
              This Month
            </button>
          </div>
          <button
            onClick={handleConfirm}
            disabled={!tempStartDate}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors font-medium"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
