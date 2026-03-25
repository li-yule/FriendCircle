import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../context/AppContext';

function normalizeAccount(value) {
  return (value || '').trim().toLowerCase();
}

function isValidAccount(value) {
  return /^[a-z0-9_.-]{3,32}$/.test(value);
}

export default function LoginScreen({ navigation }) {
  const { dispatch, isCloudEnabled } = useApp();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    if (submitting) return;

    const accountValue = normalizeAccount(account);
    const passwordValue = password.trim();

    if (!accountValue || !passwordValue) {
      Alert.alert('提示', '请输入账号和密码');
      return;
    }

    if (!isValidAccount(accountValue)) {
      Alert.alert('提示', '账号仅支持 3-32 位字母、数字或 . _ -');
      return;
    }

    setSubmitting(true);
    let result;
    try {
      result = await dispatch({
        type: 'LOGIN',
        payload: { account: accountValue, password: passwordValue },
      });
    } finally {
      setSubmitting(false);
    }

    if (!result?.ok) {
      Alert.alert('登录失败', result?.error || '账号或密码不正确');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>FriendCircle</Text>
        <Text style={styles.subtitle}>登录你的账号</Text>

        <TextInput
          style={styles.input}
          placeholder="账号"
          autoCapitalize="none"
          value={account}
          onChangeText={setAccount}
        />
        <TextInput
          style={styles.input}
          placeholder="密码"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
          onPress={handleLogin}
          disabled={submitting}
        >
          <Text style={styles.primaryBtnText}>{submitting ? '登录中...' : '登录'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('Register')}>
          <Text style={styles.linkText}>没有账号？去注册</Text>
        </TouchableOpacity>

        <View style={styles.demoBox}>
          <Text style={styles.demoText}>{isCloudEnabled ? '当前已启用云端账号，请使用你注册过的账号登录' : '当前未连接云端，请先配置 Supabase 环境变量'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F4EE',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#FFFDF8',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E8E1D8',
  },
  title: { fontSize: 28, fontWeight: '700', color: '#2F2A24' },
  subtitle: { marginTop: 6, marginBottom: 18, color: '#7D746B', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#E8E1D8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: '#F9F5EE',
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: '#C49A4B',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  linkBtn: { marginTop: 12, alignItems: 'center' },
  linkText: { color: '#C49A4B', fontWeight: '500' },
  demoBox: {
    marginTop: 16,
    backgroundColor: '#EAF7F5',
    borderRadius: 10,
    padding: 10,
  },
  demoText: { color: '#7D746B', fontSize: 12 },
});
