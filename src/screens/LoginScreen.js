import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../context/AppContext';

function normalizeAccount(value) {
  return (value || '').trim().toLowerCase();
}

export default function LoginScreen({ navigation }) {
  const { dispatch, isCloudEnabled } = useApp();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const accountValue = normalizeAccount(account);
    const passwordValue = password.trim();

    if (!accountValue || !passwordValue) {
      Alert.alert('提示', '请输入账号和密码');
      return;
    }

    const result = await dispatch({
      type: 'LOGIN',
      payload: { account: accountValue, password: passwordValue },
    });

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

        <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin}>
          <Text style={styles.primaryBtnText}>登录</Text>
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
    backgroundColor: '#F2F6F5',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#1E2A28' },
  subtitle: { marginTop: 6, marginBottom: 18, color: '#6A7673', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#E3EBE9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    backgroundColor: '#FAFCFB',
  },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: '#29B8AC',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  linkBtn: { marginTop: 12, alignItems: 'center' },
  linkText: { color: '#29B8AC', fontWeight: '500' },
  demoBox: {
    marginTop: 16,
    backgroundColor: '#F5FBFA',
    borderRadius: 10,
    padding: 10,
  },
  demoText: { color: '#6A7673', fontSize: 12 },
});
