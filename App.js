import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { AppProvider } from './src/context/AppContext';
import AppNavigator from './src/navigation/AppNavigator';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('[AppErrorBoundary] crash captured:', error);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F7F4EE', paddingHorizontal: 24 }}>
        <Text style={{ fontSize: 18, color: '#2F2A24', fontWeight: '700', marginBottom: 10 }}>应用遇到异常</Text>
        <Text style={{ color: '#6E655C', textAlign: 'center', marginBottom: 20, lineHeight: 22 }}>
          已拦截一次异常，避免直接闪退。请点击下方按钮重试。
        </Text>
        <TouchableOpacity onPress={this.handleRetry} style={{ backgroundColor: '#C49A4B', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>重试加载</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    Notifications.setNotificationChannelAsync('plan-reminders', {
      name: '规划提醒',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="dark" />
          <AppErrorBoundary>
            <AppNavigator />
          </AppErrorBoundary>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
