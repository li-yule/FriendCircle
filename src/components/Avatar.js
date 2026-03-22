import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { INITIAL_USERS } from '../data/initialData';

// 头像组件：显示彩色首字母头像
export function Avatar({ user, size = 40, onPress }) {
  const u = typeof user === 'string' ? INITIAL_USERS.find(u => u.id === user) : user;
  if (!u) return null;
  const firstChar = u.name ? u.name[0] : '?';
  const fontSize = size * 0.4;

  const inner = (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: u.avatarColor || '#ccc' }]}>
      <Text style={[styles.avatarText, { fontSize }]}>{firstChar}</Text>
    </View>
  );

  if (onPress) return <TouchableOpacity onPress={onPress}>{inner}</TouchableOpacity>;
  return inner;
}

const styles = StyleSheet.create({
  avatar: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
