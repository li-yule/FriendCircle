import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useApp } from '../context/AppContext';

function normalizeAccount(value) {
  return (value || '').trim().toLowerCase();
}

function isValidAccount(value) {
  return /^[a-z0-9_.-]{3,32}$/.test(value);
}

export default function RegisterScreen({ navigation }) {
  const { dispatch } = useApp();
  const [name, setName] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleRegister = async () => {
    const accountValue = normalizeAccount(account);
    const passwordValue = password.trim();
    const confirmPasswordValue = confirmPassword.trim();

    if (!name.trim() || !accountValue || !passwordValue) {
      Alert.alert('提示', '请完整填写昵称、账号、密码');
      return;
    }

    if (!isValidAccount(accountValue)) {
      Alert.alert('提示', '账号仅支持 3-32 位字母、数字或 . _ -');
      return;
    }

    if (passwordValue.length < 6) {
      Alert.alert('提示', '密码至少 6 位');
      return;
    }

    if (passwordValue !== confirmPasswordValue) {
      Alert.alert('提示', '两次输入的密码不一致');
      return;
    }

    const result = await dispatch({
      type: 'REGISTER',
      payload: {
        name: name.trim(),
        account: accountValue,
        password: passwordValue,
      },
    });

    if (!result?.ok) {
      Alert.alert('注册失败', result?.error || '请稍后重试');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>创建账号</Text>
        <Text style={styles.subtitle}>注册后将自动登录到你的独立账号</Text>

        <TextInput
          style={styles.input}
          placeholder="昵称"
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={styles.input}
          placeholder="账号（3-32位：字母/数字/._-）"
          autoCapitalize="none"
          value={account}
          onChangeText={setAccount}
        />
        <TextInput
          style={styles.input}
          placeholder="密码（至少 6 位）"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="确认密码"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister}>
          <Text style={styles.primaryBtnText}>注册并登录</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.linkText}>已有账号？返回登录</Text>
        </TouchableOpacity>
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
  title: { fontSize: 24, fontWeight: '700', color: '#1E2A28' },
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
});
