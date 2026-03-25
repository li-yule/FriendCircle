import React, { useMemo, useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const WEEK_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateKey(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(date, minDate, maxDate) {
  if (minDate && date < minDate) return false;
  if (maxDate && date > maxDate) return false;
  return true;
}

function buildCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const monthDays = new Date(year, month + 1, 0).getDate();

  const result = [];
  for (let i = 0; i < startWeekday; i += 1) result.push(null);
  for (let day = 1; day <= monthDays; day += 1) result.push(new Date(year, month, day));
  while (result.length % 7 !== 0) result.push(null);
  return result;
}

export default function DatePickerSheet({
  visible,
  value,
  onClose,
  onChange,
  title = '选择日期',
  minDate,
  maxDate,
}) {
  const selectedDate = parseDateKey(value) || new Date();
  const [cursor, setCursor] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  useEffect(() => {
    if (!visible) return;
    const next = parseDateKey(value) || new Date();
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
  }, [visible, value]);

  const days = useMemo(
    () => buildCalendarDays(cursor.getFullYear(), cursor.getMonth()),
    [cursor]
  );

  const min = minDate ? new Date(`${minDate}T00:00:00`) : null;
  const max = maxDate ? new Date(`${maxDate}T00:00:00`) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.mask}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color="#7D746B" />
            </TouchableOpacity>
          </View>

          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}>
              <Ionicons name="chevron-back" size={20} color="#6F655D" />
            </TouchableOpacity>
            <Text style={styles.monthText}>{cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月</Text>
            <TouchableOpacity onPress={() => setCursor(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}>
              <Ionicons name="chevron-forward" size={20} color="#6F655D" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEK_NAMES.map(w => (
              <View key={w} style={styles.weekCell}>
                <Text style={styles.weekText}>{w}</Text>
              </View>
            ))}
          </View>

          <View style={styles.daysWrap}>
            {days.map((date, idx) => {
              if (!date) {
                return (
                  <View key={`empty_${idx}`} style={styles.dayCell}>
                    <View style={styles.dayInner} />
                  </View>
                );
              }

              const disabled = !inRange(date, min, max);
              const selected = isSameDay(date, selectedDate);

              return (
                <View key={toDateKey(date)} style={styles.dayCell}>
                  <TouchableOpacity
                  key={toDateKey(date)}
                  style={[styles.dayInner, selected && styles.dayCellSelected, disabled && styles.dayCellDisabled]}
                  disabled={disabled}
                  onPress={() => {
                    onChange(toDateKey(date));
                    onClose();
                  }}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected, disabled && styles.dayTextDisabled]}>
                    {date.getDate()}
                  </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    backgroundColor: '#FFFDF8',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#2F2A24' },
  monthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthText: { fontSize: 16, fontWeight: '600', color: '#2F2A24' },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekCell: {
    width: '14.2857%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 26,
  },
  weekText: {
    textAlign: 'center',
    color: '#867D73',
    fontSize: 13,
  },
  daysWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.2857%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dayInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#EAF7F5',
    borderWidth: 1.5,
    borderColor: '#2F9F97',
  },
  dayCellDisabled: { opacity: 0.35 },
  dayText: { color: '#6F655D', fontSize: 15 },
  dayTextSelected: { color: '#2F9F97', fontWeight: '700' },
  dayTextDisabled: { color: '#AAA' },
});
