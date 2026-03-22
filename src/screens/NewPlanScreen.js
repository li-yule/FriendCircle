import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { formatDateKey, generateId, toDateKey } from '../utils/helpers';
import DatePickerSheet from '../components/DatePickerSheet';

export default function NewPlanScreen({ navigation }) {
  const { state, dispatch } = useApp();
  const { currentUser } = state;

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getTodayStr());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [tasks, setTasks] = useState([{ id: generateId(), text: '', done: false, reminderTime: '' }]);

  function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const addTask = () => {
    setTasks(prev => [...prev, { id: generateId(), text: '', done: false, reminderTime: '' }]);
  };

  const updateTask = (id, field, val) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: val } : t));
  };

  const removeTask = (id) => {
    if (tasks.length <= 1) return;
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    const validTasks = tasks.filter(t => t.text.trim());
    if (!trimmedTitle && validTasks.length === 0) {
      Alert.alert('提示', '请填写规划标题或至少一项小任务');
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

    const normalizedTasks = validTasks.length > 0
      ? validTasks
      : [{ id: generateId(), text: trimmedTitle, done: false, reminderTime: '' }];

    const result = await dispatch({
      type: 'ADD_PLAN',
      payload: {
        id: generateId(),
        userId: currentUser.id,
        title: trimmedTitle,
        date: pickedDate.toISOString(),
        tasks: normalizedTasks,
        createdAt: new Date().toISOString(),
      },
    });
    if (!result?.ok) {
      Alert.alert('发布失败', result?.error || '请稍后重试');
      return;
    }
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.title}>新建规划</Text>
        <TouchableOpacity style={styles.sendBtn} onPress={handleSubmit}>
          <Text style={styles.sendText}>发布</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* 标题 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>规划标题</Text>
          <TextInput
            style={styles.input}
            placeholder="给这次规划起个名字..."
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>规划日期</Text>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setDatePickerVisible(true)}>
            <Ionicons name="calendar-outline" size={16} color="#FF6B6B" />
            <Text style={styles.datePickerText}>{formatDateKey(date)}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.todayTip}>
          <Ionicons name="calendar-outline" size={16} color="#FF6B6B" />
          <Text style={styles.todayTipText}>可创建今天和未来的规划。只写标题也能发布，会自动生成一条同名任务。</Text>
        </View>

        {/* 任务列表 */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>任务清单</Text>
          {tasks.map((task, idx) => (
            <View key={task.id} style={styles.taskRow}>
              <View style={styles.taskInputWrap}>
                <TextInput
                  style={styles.taskInput}
                  placeholder={`任务 ${idx + 1}`}
                  value={task.text}
                  onChangeText={val => updateTask(task.id, 'text', val)}
                />
                <View style={styles.reminderRow}>
                  <Ionicons name="alarm-outline" size={14} color="#999" />
                  <TextInput
                    style={styles.reminderInput}
                    placeholder="提醒时间（如 09:30）"
                    value={task.reminderTime}
                    onChangeText={val => updateTask(task.id, 'reminderTime', val)}
                  />
                </View>
              </View>
              <TouchableOpacity onPress={() => removeTask(task.id)} style={styles.removeTask}>
                <Ionicons name="close-circle-outline" size={22} color="#FF6B6B" />
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addTaskBtn} onPress={addTask}>
            <Ionicons name="add-circle-outline" size={20} color="#FF6B6B" />
            <Text style={styles.addTaskText}>添加任务</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tip}>
          <Ionicons name="information-circle-outline" size={16} color="#999" />
          <Text style={styles.tipText}>发布后可以在打卡页勾选完成情况，朋友也能看到你的进度！</Text>
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
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cancel: { fontSize: 16, color: '#666' },
  title: { fontSize: 17, fontWeight: '600', color: '#333' },
  sendBtn: { backgroundColor: '#FF6B6B', paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  sendText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  body: { padding: 16, gap: 20 },
  fieldGroup: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#333' },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#FFD5D5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFF7F7',
  },
  datePickerText: { color: '#FF6B6B', fontWeight: '600', fontSize: 14 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  taskInputWrap: { flex: 1, borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 10, backgroundColor: '#FAFAFA' },
  taskInput: { fontSize: 15, color: '#333', paddingBottom: 4 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  reminderInput: { flex: 1, fontSize: 12, color: '#999' },
  removeTask: { padding: 4 },
  addTaskBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10 },
  addTaskText: { color: '#FF6B6B', fontSize: 15, fontWeight: '500' },
  tip: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#FFF8F0',
    padding: 12,
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  tipText: { flex: 1, fontSize: 13, color: '#999', lineHeight: 18 },
  todayTip: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 10,
    alignItems: 'flex-start',
  },
  todayTipText: { flex: 1, fontSize: 13, color: '#FF6B6B', lineHeight: 18 },
});
