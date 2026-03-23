import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import { useApp } from '../context/AppContext';
import { formatDateKey, generateId, toDateKey } from '../utils/helpers';
import DatePickerSheet from '../components/DatePickerSheet';

export default function NewPlanScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { currentUser } = state;

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [enableReminder, setEnableReminder] = useState(false);
  const [reminderTime, setReminderTime] = useState('21:00');
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const setDateByOffset = (offsetDays) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    setDate(toDateKey(d));
  };

  const scheduleReminder = async (titleText, dateText, timeText) => {
    const [hourStr, minuteStr] = String(timeText).split(':');
    const hour = Number(hourStr);
    const minute = Number(minuteStr);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return;
    }

    const triggerDate = new Date(`${dateText}T00:00:00`);
    triggerDate.setHours(hour, minute, 0, 0);
    if (triggerDate.getTime() <= Date.now() + 1000 * 30) {
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('plan-reminders', {
        name: '规划提醒',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
      });
    }

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) {
      Alert.alert('提醒未开启', '请在系统设置里允许通知权限，才能收到规划提醒。');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '规划提醒',
        body: `别忘了：${titleText}`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: Platform.OS === 'android' ? 'plan-reminders' : undefined,
      },
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('提示', '请填写规划标题');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('提示', '日期格式应为 YYYY-MM-DD');
      return;
    }

    const pickedDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(pickedDate.getTime())) {
      Alert.alert('提示', '请输入有效日期');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (pickedDate < today) {
      Alert.alert('提示', '规划只能创建今天或未来日期');
      return;
    }

    if (enableReminder && !/^([01]\d|2[0-3]):([0-5]\d)$/.test(reminderTime)) {
      Alert.alert('提示', '提醒时间格式应为 HH:mm，例如 21:00');
      return;
    }

    setIsSubmitting(true);
    const result = await dispatch({
      type: 'ADD_PLAN',
      payload: {
        id: generateId(),
        userId: currentUser.id,
        title: trimmedTitle,
        date: pickedDate.toISOString(),
        tasks: [],
        reminderAt: enableReminder ? `${date} ${reminderTime}` : '',
        createdAt: new Date().toISOString(),
      },
    });
    if (!result?.ok) {
      setIsSubmitting(false);
      Alert.alert('发布失败', result?.error || '请稍后重试');
      return;
    }
    if (enableReminder) {
      scheduleReminder(trimmedTitle, date, reminderTime).catch(() => {});
    }
    setIsSubmitting(false);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.title}>新建规划</Text>
        <TouchableOpacity style={[styles.sendBtn, isSubmitting && styles.sendBtnDisabled]} onPress={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sendText}>发布</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.heroCard}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="sparkles-outline" size={18} color="#FF6B6B" />
          </View>
          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>创建一个轻量规划</Text>
            <Text style={styles.heroDesc}>写下标题，选择日期，发布后会自动生成同名任务。</Text>
          </View>
        </View>

        <View style={styles.fieldCard}>
          <Text style={styles.label}>规划标题</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：数学错题复盘"
            value={title}
            onChangeText={setTitle}
            maxLength={40}
          />
          <Text style={styles.counterText}>{title.trim().length}/40</Text>
        </View>

        <View style={styles.fieldCard}>
          <Text style={styles.label}>规划日期</Text>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setDatePickerVisible(true)}>
            <View style={styles.dateLeft}>
              <Ionicons name="calendar-outline" size={16} color="#FF6B6B" />
              <Text style={styles.datePickerText}>{formatDateKey(date)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#FF9F9F" />
          </TouchableOpacity>

          <View style={styles.quickDateRow}>
            <TouchableOpacity style={styles.quickDateChip} onPress={() => setDateByOffset(0)}>
              <Text style={styles.quickDateText}>今天</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickDateChip} onPress={() => setDateByOffset(1)}>
              <Text style={styles.quickDateText}>明天</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.quickDateChip} onPress={() => setDateByOffset(7)}>
              <Text style={styles.quickDateText}>一周后</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldCard}>
          <View style={styles.reminderHeader}>
            <Text style={styles.label}>时间提醒</Text>
            <TouchableOpacity style={[styles.reminderToggle, enableReminder && styles.reminderToggleOn]} onPress={() => setEnableReminder(prev => !prev)}>
              <Text style={[styles.reminderToggleText, enableReminder && styles.reminderToggleTextOn]}>{enableReminder ? '已开启' : '未开启'}</Text>
            </TouchableOpacity>
          </View>

          {enableReminder && (
            <View style={styles.reminderInputRow}>
              <Ionicons name="alarm-outline" size={16} color="#FF6B6B" />
              <TextInput
                style={styles.reminderInput}
                placeholder="HH:mm"
                value={reminderTime}
                onChangeText={setReminderTime}
                maxLength={5}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          )}
          <Text style={styles.reminderHint}>支持本地提醒，示例：07:30、21:00。</Text>
        </View>

        <View style={styles.todayTip}>
          <Ionicons name="information-circle-outline" size={16} color="#FF6B6B" />
          <Text style={styles.todayTipText}>仅支持今天及未来日期。发布后可在“打卡”页继续补充执行细节。</Text>
        </View>
      </ScrollView>

      <DatePickerSheet
        visible={datePickerVisible}
        title="选择规划日期"
        value={date}
        minDate={toDateKey(new Date())}
        onClose={() => setDatePickerVisible(false)}
        onChange={setDate}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7FB' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cancel: { fontSize: 16, color: '#666' },
  title: { fontSize: 17, fontWeight: '600', color: '#333' },
  sendBtn: { backgroundColor: '#FF6B6B', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, minWidth: 62, alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.72 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { padding: 16, gap: 14, paddingBottom: 32 },
  heroCard: {
    backgroundColor: '#FFF7F7',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: '#FFE7E7',
  },
  heroIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFECEC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextWrap: { flex: 1, gap: 3 },
  heroTitle: { fontSize: 14, fontWeight: '700', color: '#D95555' },
  heroDesc: { fontSize: 12, color: '#A66D6D', lineHeight: 18 },
  fieldCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  label: { fontSize: 14, fontWeight: '600', color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#FAFAFA'
  },
  counterText: { alignSelf: 'flex-end', marginTop: -2, fontSize: 12, color: '#B3B3B3' },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FFD5D5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF7F7',
  },
  dateLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  datePickerText: { color: '#FF6B6B', fontWeight: '600', fontSize: 14 },
  quickDateRow: { flexDirection: 'row', gap: 8 },
  quickDateChip: {
    backgroundColor: '#FFF3F3',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#FFE3E3',
  },
  quickDateText: { color: '#E37272', fontSize: 12, fontWeight: '600' },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reminderToggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F1F1F1',
  },
  reminderToggleOn: { backgroundColor: '#FFEAEA' },
  reminderToggleText: { fontSize: 12, color: '#777', fontWeight: '600' },
  reminderToggleTextOn: { color: '#FF6B6B' },
  reminderInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFD5D5',
    borderRadius: 12,
    backgroundColor: '#FFF7F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reminderInput: { flex: 1, fontSize: 14, color: '#D95555', fontWeight: '600' },
  reminderHint: { fontSize: 12, color: '#B88686' },
  todayTip: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFF5F5',
    padding: 13,
    borderRadius: 12,
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#FFE8E8',
  },
  todayTipText: { flex: 1, fontSize: 13, color: '#FF6B6B', lineHeight: 18 },
});
